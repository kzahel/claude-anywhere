import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { PermissionMode } from "../types";

const MODE_ORDER: PermissionMode[] = [
  "default",
  "acceptEdits",
  "plan",
  "bypassPermissions",
];

const MODE_LABELS: Record<PermissionMode, string> = {
  default: "Ask before edits",
  acceptEdits: "Edit automatically",
  plan: "Plan mode",
  bypassPermissions: "Bypass permissions",
};

// Breakpoint for desktop behavior (should match CSS)
const DESKTOP_BREAKPOINT = 769;

interface ModeSelectorProps {
  mode: PermissionMode;
  onModeChange: (mode: PermissionMode) => void;
  disabled?: boolean;
  isModePending?: boolean;
  /** Whether the session is currently held (soft pause) */
  isHeld?: boolean;
  /** Callback when hold state changes */
  onHoldChange?: (held: boolean) => void;
}

/**
 * Mode selector button that opens a bottom sheet (mobile) or dropdown (desktop).
 * Includes hold (soft pause) as a special first option.
 * Clicking outside the popup or selecting a mode closes it.
 */
export function ModeSelector({
  mode,
  onModeChange,
  disabled,
  isModePending,
  isHeld = false,
  onHoldChange,
}: ModeSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(
    () => window.innerWidth >= DESKTOP_BREAKPOINT,
  );
  const buttonRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  const handleButtonClick = () => {
    if (!disabled) {
      // Blur button to remove focus ring before sheet appears
      buttonRef.current?.blur();
      setIsOpen(true);
    }
  };

  const handleModeSelect = (selectedMode: PermissionMode) => {
    // If held, resume first
    if (isHeld && onHoldChange) {
      onHoldChange(false);
    }
    onModeChange(selectedMode);
    setIsOpen(false);
  };

  const handleHoldToggle = () => {
    if (onHoldChange) {
      onHoldChange(!isHeld);
    }
    setIsOpen(false);
  };

  const handleClose = useCallback(() => {
    setIsOpen(false);
  }, []);

  // Track window resize to update desktop/mobile state
  useEffect(() => {
    const handleResize = () => {
      setIsDesktop(window.innerWidth >= DESKTOP_BREAKPOINT);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        handleClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [isOpen, handleClose]);

  // Close on click outside (for desktop dropdown)
  useEffect(() => {
    if (!isOpen || !isDesktop) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        sheetRef.current &&
        !sheetRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        handleClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen, isDesktop, handleClose]);

  // Prevent body scroll when sheet is open (mobile only)
  useEffect(() => {
    if (isOpen && !isDesktop) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [isOpen, isDesktop]);

  // Focus the sheet when opened for accessibility
  useEffect(() => {
    if (isOpen) {
      sheetRef.current?.focus();
    }
  }, [isOpen]);

  const handleOverlayClick = (e: React.MouseEvent) => {
    // Only close if clicking directly on the overlay, not its children
    if (e.target === e.currentTarget) {
      e.preventDefault();
      e.stopPropagation();
      handleClose();
    }
  };

  // Display text: show "Hold" when held, otherwise show mode label
  const displayLabel = isHeld ? "Hold" : MODE_LABELS[mode];
  const displayDotClass = isHeld ? "mode-hold" : `mode-${mode}`;

  // Shared options content used by both mobile sheet and desktop dropdown
  const optionsContent = (
    <>
      {/* Hold option - special first item */}
      {onHoldChange && (
        <button
          type="button"
          className={`mode-selector-option ${isHeld ? "selected" : ""}`}
          onClick={handleHoldToggle}
          aria-pressed={isHeld}
        >
          <span className="mode-dot mode-hold" />
          <span className="mode-selector-label">
            {isHeld ? "Resume" : "Hold"}
          </span>
          <span className="mode-selector-description">
            {isHeld ? "Continue execution" : "Pause execution"}
          </span>
          {isHeld && (
            <span className="mode-selector-check" aria-hidden="true">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </span>
          )}
        </button>
      )}

      {/* Divider between hold and permission modes */}
      {onHoldChange && <div className="mode-selector-divider" />}

      {/* Permission mode options */}
      {MODE_ORDER.map((m) => (
        <button
          key={m}
          type="button"
          className={`mode-selector-option ${!isHeld && mode === m ? "selected" : ""}`}
          onClick={() => handleModeSelect(m)}
          aria-pressed={!isHeld && mode === m}
        >
          <span className={`mode-dot mode-${m}`} />
          <span className="mode-selector-label">{MODE_LABELS[m]}</span>
          {!isHeld && mode === m && (
            <span className="mode-selector-check" aria-hidden="true">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </span>
          )}
        </button>
      ))}
    </>
  );

  // Mobile: bottom sheet with overlay (portaled)
  const mobileSheet =
    isOpen && !isDesktop
      ? createPortal(
          // biome-ignore lint/a11y/useKeyWithClickEvents: Escape key handled globally
          <div
            className="mode-selector-overlay"
            onClick={handleOverlayClick}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div
              ref={sheetRef}
              className="mode-selector-sheet"
              tabIndex={-1}
              aria-label="Select mode"
            >
              <div className="mode-selector-header">
                <span className="mode-selector-title">Session Mode</span>
              </div>
              <div className="mode-selector-options">{optionsContent}</div>
            </div>
          </div>,
          document.body,
        )
      : null;

  // Desktop: dropdown positioned relative to button (inline)
  const desktopDropdown =
    isOpen && isDesktop ? (
      <div
        ref={sheetRef}
        className="mode-selector-dropdown"
        tabIndex={-1}
        aria-label="Select mode"
      >
        <div className="mode-selector-options">{optionsContent}</div>
      </div>
    ) : null;

  return (
    <div className="mode-selector-container">
      <button
        ref={buttonRef}
        type="button"
        className={`mode-button ${isHeld ? "mode-button-held" : ""}`}
        onClick={handleButtonClick}
        disabled={disabled}
        title="Click to select mode"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span className={`mode-dot ${displayDotClass}`} />
        {displayLabel}
        {isModePending && !isHeld && (
          <span className="mode-pending-hint">(set on next message)</span>
        )}
      </button>
      {desktopDropdown}
      {mobileSheet}
    </div>
  );
}
