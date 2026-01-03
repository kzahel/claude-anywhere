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
  /** Whether auth is disabled on the server */
  authDisabled: boolean;
  /** Login with password */
  login: (password: string) => Promise<void>;
  /** Logout current session */
  logout: () => Promise<void>;
  /** Create initial account (setup mode only) */
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
  const [authDisabled, setAuthDisabled] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const checkAuth = useCallback(async () => {
    try {
      const status = await api.getAuthStatus();
      setIsAuthenticated(status.authenticated);
      setIsSetupMode(status.setupRequired);
      setAuthDisabled(false);
    } catch (error) {
      // If we get a network error or the endpoint doesn't exist,
      // assume auth is disabled (for backward compatibility)
      console.warn("[Auth] Auth check failed, assuming auth disabled:", error);
      setIsAuthenticated(true);
      setIsSetupMode(false);
      setAuthDisabled(true);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Check auth status on mount
  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // Redirect to login if not authenticated and not already on login page
  useEffect(() => {
    if (
      !isLoading &&
      !isAuthenticated &&
      !authDisabled &&
      location.pathname !== "/login"
    ) {
      navigate("/login", { state: { from: location.pathname } });
    }
  }, [isLoading, isAuthenticated, authDisabled, location.pathname, navigate]);

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

  const setupAccount = useCallback(async (password: string) => {
    await api.setupAccount(password);
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
        authDisabled,
        login,
        logout,
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
