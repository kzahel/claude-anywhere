import type { ProviderName } from "@claude-anywhere/shared";

const PROVIDER_COLORS: Record<ProviderName, string> = {
  claude: "var(--app-claude-orange)",
  codex: "#10a37f", // OpenAI green
  gemini: "#4285f4", // Google blue
};

const PROVIDER_LABELS: Record<ProviderName, string> = {
  claude: "Claude",
  codex: "Codex",
  gemini: "Gemini",
};

interface ProviderBadgeProps {
  provider: ProviderName;
  /** Show as small dot only (for sidebar) vs full badge (for header) */
  compact?: boolean;
  className?: string;
}

/**
 * Badge showing which AI provider is running a session.
 * Use compact mode for sidebar lists, full mode for session headers.
 */
export function ProviderBadge({
  provider,
  compact = false,
  className = "",
}: ProviderBadgeProps) {
  const color = PROVIDER_COLORS[provider];
  const label = PROVIDER_LABELS[provider];

  if (compact) {
    return (
      <span
        className={`provider-badge-dot ${className}`}
        style={{ backgroundColor: color }}
        title={label}
        aria-label={`Provider: ${label}`}
      />
    );
  }

  return (
    <span
      className={`provider-badge ${className}`}
      style={{ borderColor: color, color }}
    >
      <span
        className="provider-badge-dot-inline"
        style={{ backgroundColor: color }}
      />
      {label}
    </span>
  );
}
