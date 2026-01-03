/**
 * AuthService manages cookie-based authentication.
 *
 * Features:
 * - Single user account (self-hosted apps typically have one owner)
 * - Session-based auth with signed cookies
 * - Password hashing with bcrypt
 *
 * State is persisted to a JSON file for durability across server restarts.
 */

import * as crypto from "node:crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import bcrypt from "bcrypt";

const BCRYPT_ROUNDS = 12;
const SESSION_ID_BYTES = 32;

export interface AuthState {
  /** Schema version for future migrations */
  version: number;
  /** Account credentials (undefined = setup mode) */
  account?: {
    /** bcrypt-hashed password */
    passwordHash: string;
    /** When account was created */
    createdAt: string;
  };
  /** Active sessions: sessionId -> session data */
  sessions: Record<
    string,
    {
      createdAt: string;
      lastActiveAt: string;
      userAgent?: string;
    }
  >;
}

const CURRENT_VERSION = 1;

export interface AuthServiceOptions {
  /** Directory to store auth state (defaults to dataDir) */
  dataDir: string;
  /** Session TTL in milliseconds (default: 30 days) */
  sessionTtlMs?: number;
  /** Cookie signing secret (auto-generated if not provided) */
  cookieSecret?: string;
}

export class AuthService {
  private state: AuthState;
  private dataDir: string;
  private filePath: string;
  private sessionTtlMs: number;
  private cookieSecret: string;
  private savePromise: Promise<void> | null = null;
  private pendingSave = false;

  constructor(options: AuthServiceOptions) {
    this.dataDir = options.dataDir;
    this.filePath = path.join(this.dataDir, "auth.json");
    this.sessionTtlMs = options.sessionTtlMs ?? 30 * 24 * 60 * 60 * 1000; // 30 days
    this.cookieSecret = options.cookieSecret ?? "";
    this.state = { version: CURRENT_VERSION, sessions: {} };
  }

  /**
   * Initialize the service by loading state from disk.
   * Creates the data directory if it doesn't exist.
   * Generates cookie secret if not provided.
   */
  async initialize(): Promise<void> {
    try {
      await fs.mkdir(this.dataDir, { recursive: true });

      const content = await fs.readFile(this.filePath, "utf-8");
      const parsed = JSON.parse(content) as AuthState;

      if (parsed.version === CURRENT_VERSION) {
        this.state = parsed;
      } else {
        // Future: handle migrations
        this.state = {
          version: CURRENT_VERSION,
          account: parsed.account,
          sessions: parsed.sessions ?? {},
        };
        await this.save();
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        console.warn(
          "[AuthService] Failed to load state, starting fresh:",
          error,
        );
      }
      this.state = { version: CURRENT_VERSION, sessions: {} };
    }

    // Generate cookie secret if not provided
    if (!this.cookieSecret) {
      this.cookieSecret = crypto.randomBytes(32).toString("hex");
    }

    // Clean up expired sessions on startup
    await this.cleanupExpiredSessions();
  }

  /**
   * Check if an account has been set up.
   */
  hasAccount(): boolean {
    return !!this.state.account;
  }

  /**
   * Create the initial account. Only works if no account exists.
   */
  async createAccount(password: string): Promise<boolean> {
    if (this.state.account) {
      return false; // Account already exists
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    this.state.account = {
      passwordHash,
      createdAt: new Date().toISOString(),
    };
    await this.save();
    return true;
  }

  /**
   * Verify a password against the stored hash.
   */
  async verifyPassword(password: string): Promise<boolean> {
    if (!this.state.account) {
      return false;
    }
    return bcrypt.compare(password, this.state.account.passwordHash);
  }

  /**
   * Change the account password. Requires current password.
   */
  async changePassword(
    currentPassword: string,
    newPassword: string,
  ): Promise<boolean> {
    if (!this.state.account) {
      return false;
    }

    const valid = await bcrypt.compare(
      currentPassword,
      this.state.account.passwordHash,
    );
    if (!valid) {
      return false;
    }

    this.state.account.passwordHash = await bcrypt.hash(
      newPassword,
      BCRYPT_ROUNDS,
    );
    await this.save();
    return true;
  }

  /**
   * Create a new session and return the session ID.
   */
  async createSession(userAgent?: string): Promise<string> {
    const sessionId = crypto.randomBytes(SESSION_ID_BYTES).toString("hex");
    const now = new Date().toISOString();

    this.state.sessions[sessionId] = {
      createdAt: now,
      lastActiveAt: now,
      userAgent,
    };
    await this.save();

    return sessionId;
  }

  /**
   * Validate a session ID and update last active time.
   * Returns true if valid, false if expired or not found.
   */
  async validateSession(sessionId: string): Promise<boolean> {
    const session = this.state.sessions[sessionId];
    if (!session) {
      return false;
    }

    const createdAt = new Date(session.createdAt).getTime();
    const now = Date.now();

    if (now - createdAt > this.sessionTtlMs) {
      // Session expired
      delete this.state.sessions[sessionId];
      await this.save();
      return false;
    }

    // Update last active time (debounced via save)
    session.lastActiveAt = new Date().toISOString();
    // Don't await save here to avoid blocking every request
    void this.save();

    return true;
  }

  /**
   * Invalidate a session (logout).
   */
  async invalidateSession(sessionId: string): Promise<void> {
    if (this.state.sessions[sessionId]) {
      delete this.state.sessions[sessionId];
      await this.save();
    }
  }

  /**
   * Invalidate all sessions (logout everywhere).
   */
  async invalidateAllSessions(): Promise<void> {
    this.state.sessions = {};
    await this.save();
  }

  /**
   * Get the cookie secret for signing.
   */
  getCookieSecret(): string {
    return this.cookieSecret;
  }

  /**
   * Clean up expired sessions.
   */
  private async cleanupExpiredSessions(): Promise<void> {
    const now = Date.now();
    let changed = false;

    for (const [sessionId, session] of Object.entries(this.state.sessions)) {
      const createdAt = new Date(session.createdAt).getTime();
      if (now - createdAt > this.sessionTtlMs) {
        delete this.state.sessions[sessionId];
        changed = true;
      }
    }

    if (changed) {
      await this.save();
    }
  }

  /**
   * Save state to disk with debouncing.
   */
  private async save(): Promise<void> {
    if (this.savePromise) {
      this.pendingSave = true;
      return;
    }

    this.savePromise = this.doSave();
    await this.savePromise;
    this.savePromise = null;

    if (this.pendingSave) {
      this.pendingSave = false;
      await this.save();
    }
  }

  private async doSave(): Promise<void> {
    try {
      const content = JSON.stringify(this.state, null, 2);
      await fs.writeFile(this.filePath, content, "utf-8");
    } catch (error) {
      console.error("[AuthService] Failed to save state:", error);
      throw error;
    }
  }
}
