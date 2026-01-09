/**
 * LoginPage - Login form for cookie-based auth.
 *
 * Shows setup form when no account exists,
 * otherwise shows login form.
 */

import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { YepAnywhereLogo } from "../components/YepAnywhereLogo";
import { useAuth } from "../contexts/AuthContext";

export function LoginPage() {
  const {
    isSetupMode,
    login,
    setupAccount,
    isLoading,
    authEnabled,
    authDisabledByEnv,
  } = useAuth();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  // Get the page they were trying to access before being redirected
  const from =
    (location.state as { from?: string } | null)?.from ?? "/projects";

  // If auth is not enabled or disabled by env, redirect away from login page
  useEffect(() => {
    if (!isLoading && (!authEnabled || authDisabledByEnv)) {
      navigate("/projects", { replace: true });
    }
  }, [isLoading, authEnabled, authDisabledByEnv, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!password) {
      setError("Password is required");
      return;
    }

    if (isSetupMode) {
      if (password.length < 8) {
        setError("Password must be at least 8 characters");
        return;
      }
      if (password !== confirmPassword) {
        setError("Passwords do not match");
        return;
      }
    }

    setIsSubmitting(true);

    try {
      if (isSetupMode) {
        await setupAccount(password);
      } else {
        await login(password);
      }
      navigate(from, { replace: true });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Authentication failed";
      setError(message.includes("401") ? "Invalid password" : message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="login-page">
        <div className="login-container">
          <div className="login-loading">Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="login-page">
      <div className="login-container">
        <div className="login-logo">
          <YepAnywhereLogo />
        </div>
        <p className="login-subtitle">
          {isSetupMode
            ? "Create your account to get started"
            : "Enter your password to continue"}
        </p>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="login-field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={isSetupMode ? "Create a password" : "Enter password"}
              disabled={isSubmitting}
            />
          </div>

          {isSetupMode && (
            <div className="login-field">
              <label htmlFor="confirmPassword">Confirm Password</label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm password"
                disabled={isSubmitting}
              />
            </div>
          )}

          {error && <div className="login-error">{error}</div>}

          <button
            type="submit"
            className="login-button"
            disabled={isSubmitting}
          >
            {isSubmitting
              ? "Please wait..."
              : isSetupMode
                ? "Create Account"
                : "Login"}
          </button>
        </form>

        {isSetupMode && (
          <p className="login-hint">
            This password will be used to access Yep Anywhere from any device.
          </p>
        )}

        {!isSetupMode && (
          <p className="login-recovery-hint">
            Forgot your password? Restart the server with{" "}
            <code>--auth-disable</code> to bypass authentication, then disable
            or reset auth in Settings.
          </p>
        )}
      </div>
    </div>
  );
}
