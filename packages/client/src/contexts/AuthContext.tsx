/**
 * AuthContext - Manages authentication state for the app.
 *
 * Provides:
 * - Auth status checking on mount
 * - Login/logout/setup functions
 * - Redirect to login when unauthenticated
 */

import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api } from "../api/client";

interface AuthContextValue {
  /** Whether user is authenticated */
  isAuthenticated: boolean;
  /** Whether account setup is required (no account exists) */
  isSetupMode: boolean;
  /** Whether auth check is in progress */
  isLoading: boolean;
  /** Whether auth is enabled in settings */
  authEnabled: boolean;
  /** Whether auth is disabled by --auth-disable flag (for recovery) */
  authDisabledByEnv: boolean;
  /** Path to auth.json file (for recovery instructions) */
  authFilePath: string;
  /** Login with password */
  login: (password: string) => Promise<void>;
  /** Logout current session */
  logout: () => Promise<void>;
  /** Enable auth with a password (from settings) */
  enableAuth: (password: string) => Promise<void>;
  /** Disable auth (requires authenticated session) */
  disableAuth: () => Promise<void>;
  /** Create initial account (setup mode only) - deprecated, use enableAuth */
  setupAccount: (password: string) => Promise<void>;
  /** Change password */
  changePassword: (
    currentPassword: string,
    newPassword: string,
  ) => Promise<void>;
  /** Re-check auth status */
  checkAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isSetupMode, setIsSetupMode] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [authEnabled, setAuthEnabled] = useState(false);
  const [authDisabledByEnv, setAuthDisabledByEnv] = useState(false);
  const [authFilePath, setAuthFilePath] = useState("");
  const navigate = useNavigate();
  const location = useLocation();

  const checkAuth = useCallback(async () => {
    try {
      const status = await api.getAuthStatus();
      setAuthEnabled(status.enabled);
      setAuthDisabledByEnv(status.disabledByEnv);
      setAuthFilePath(status.authFilePath);
      setIsAuthenticated(status.authenticated);
      setIsSetupMode(status.setupRequired);
    } catch (error) {
      // If we get a network error or the endpoint doesn't exist,
      // assume auth is not enabled (for backward compatibility)
      console.warn(
        "[Auth] Auth check failed, assuming auth not enabled:",
        error,
      );
      setIsAuthenticated(true);
      setIsSetupMode(false);
      setAuthEnabled(false);
      setAuthDisabledByEnv(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Check auth status on mount
  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // Redirect to login if not authenticated and auth is enabled
  useEffect(() => {
    if (
      !isLoading &&
      !isAuthenticated &&
      authEnabled &&
      !authDisabledByEnv &&
      location.pathname !== "/login"
    ) {
      navigate("/login", { state: { from: location.pathname } });
    }
  }, [
    isLoading,
    isAuthenticated,
    authEnabled,
    authDisabledByEnv,
    location.pathname,
    navigate,
  ]);

  const login = useCallback(async (password: string) => {
    await api.login(password);
    setIsAuthenticated(true);
    setIsSetupMode(false);
  }, []);

  const logout = useCallback(async () => {
    await api.logout();
    setIsAuthenticated(false);
    navigate("/login");
  }, [navigate]);

  const enableAuth = useCallback(async (password: string) => {
    await api.enableAuth(password);
    setAuthEnabled(true);
    setIsAuthenticated(true);
    setIsSetupMode(false);
  }, []);

  const disableAuth = useCallback(async () => {
    await api.disableAuth();
    setAuthEnabled(false);
    setIsAuthenticated(true); // No auth needed after disabling
  }, []);

  const setupAccount = useCallback(async (password: string) => {
    await api.setupAccount(password);
    setAuthEnabled(true);
    setIsAuthenticated(true);
    setIsSetupMode(false);
  }, []);

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string) => {
      await api.changePassword(currentPassword, newPassword);
    },
    [],
  );

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        isSetupMode,
        isLoading,
        authEnabled,
        authDisabledByEnv,
        authFilePath,
        login,
        logout,
        enableAuth,
        disableAuth,
        setupAccount,
        changePassword,
        checkAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

/**
 * Hook to access auth state and functions.
 * Must be used within an AuthProvider.
 */
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
