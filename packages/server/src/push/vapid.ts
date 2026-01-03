/**
 * VAPID Key Management
 *
 * Manages VAPID (Voluntary Application Server Identification) keys for Web Push.
 * Keys are stored in dataDir/vapid.json and reused across server restarts.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import webPush from "web-push";
import { getDataDir } from "../config.js";

/** VAPID keys file path (uses dataDir from config for profile support) */
const VAPID_FILE = path.join(getDataDir(), "vapid.json");

export interface VapidKeys {
  /** Base64url-encoded public key (for client subscription) */
  publicKey: string;
  /** Base64url-encoded private key (for signing push requests) */
  privateKey: string;
  /** Contact email for push service operators */
  subject: string;
}

/**
 * Validate VAPID key format.
 * Public key should be 65 bytes (uncompressed P-256 point) when base64url-decoded.
 * Private key should be 32 bytes when base64url-decoded.
 */
export function validateVapidKeys(keys: VapidKeys): {
  valid: boolean;
  error?: string;
} {
  try {
    // Check required fields
    if (!keys.publicKey || typeof keys.publicKey !== "string") {
      return { valid: false, error: "Missing or invalid publicKey" };
    }
    if (!keys.privateKey || typeof keys.privateKey !== "string") {
      return { valid: false, error: "Missing or invalid privateKey" };
    }
    if (!keys.subject || typeof keys.subject !== "string") {
      return { valid: false, error: "Missing or invalid subject" };
    }

    // Validate subject format (must be mailto: or https:)
    if (
      !keys.subject.startsWith("mailto:") &&
      !keys.subject.startsWith("https://")
    ) {
      return {
        valid: false,
        error: "Subject must start with mailto: or https://",
      };
    }

    // Decode and check key lengths
    const publicKeyBytes = Buffer.from(keys.publicKey, "base64url");
    const privateKeyBytes = Buffer.from(keys.privateKey, "base64url");

    if (publicKeyBytes.length !== 65) {
      return {
        valid: false,
        error: `Public key should be 65 bytes, got ${publicKeyBytes.length}`,
      };
    }
    if (privateKeyBytes.length !== 32) {
      return {
        valid: false,
        error: `Private key should be 32 bytes, got ${privateKeyBytes.length}`,
      };
    }

    // First byte of public key should be 0x04 (uncompressed point)
    if (publicKeyBytes[0] !== 0x04) {
      return {
        valid: false,
        error: "Public key should be uncompressed (start with 0x04)",
      };
    }

    return { valid: true };
  } catch (error) {
    return { valid: false, error: `Validation error: ${error}` };
  }
}

/**
 * Load existing VAPID keys from disk.
 * Returns null if file doesn't exist or is invalid.
 */
export async function loadVapidKeys(
  filePath: string = VAPID_FILE,
): Promise<VapidKeys | null> {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    const keys = JSON.parse(content) as VapidKeys;

    const validation = validateVapidKeys(keys);
    if (!validation.valid) {
      console.warn(`[vapid] Invalid keys in ${filePath}: ${validation.error}`);
      return null;
    }

    return keys;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null; // File doesn't exist
    }
    console.warn(`[vapid] Failed to load ${filePath}:`, error);
    return null;
  }
}

/**
 * Generate new VAPID keys and save to disk.
 */
export async function generateVapidKeys(
  filePath: string = VAPID_FILE,
  subject = "mailto:claude-anywhere@localhost",
): Promise<VapidKeys> {
  // Ensure data directory exists
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });

  // Generate new key pair
  const vapidKeys = webPush.generateVAPIDKeys();

  const keys: VapidKeys = {
    publicKey: vapidKeys.publicKey,
    privateKey: vapidKeys.privateKey,
    subject,
  };

  // Validate before saving
  const validation = validateVapidKeys(keys);
  if (!validation.valid) {
    throw new Error(`Generated keys are invalid: ${validation.error}`);
  }

  // Save to disk with restricted permissions
  await fs.writeFile(filePath, JSON.stringify(keys, null, 2), {
    encoding: "utf-8",
    mode: 0o600, // Owner read/write only
  });

  return keys;
}

/**
 * Get or create VAPID keys.
 * Loads existing keys if available, otherwise generates new ones.
 */
export async function getOrCreateVapidKeys(
  filePath: string = VAPID_FILE,
): Promise<VapidKeys> {
  const existing = await loadVapidKeys(filePath);
  if (existing) {
    return existing;
  }
  return generateVapidKeys(filePath);
}

/**
 * Get VAPID file path (for external use).
 */
export function getVapidFilePath(): string {
  return VAPID_FILE;
}
