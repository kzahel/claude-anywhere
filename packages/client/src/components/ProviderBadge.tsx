import type { ProviderName } from "@yep-anywhere/shared";
import { MODEL_OPTIONS } from "../hooks/useModelSettings";

const PROVIDER_COLORS: Record<ProviderName, string> = {
  claude: "var(--provider-claude)", // Claude orange
  codex: "var(--provider-codex)", // OpenAI green
  "codex-oss": "var(--provider-codex)", // OpenAI green (same as codex)
  gemini: "var(--provider-gemini)", // Google blue
};

const PROVIDER_LABELS: Record<ProviderName, string> = {
  claude: "Claude",
  codex: "Codex",
  "codex-oss": "CodexOSS",
  gemini: "Gemini",
};

interface ProviderBadgeProps {
  provider: ProviderName;
  /** Show as small dot only (for sidebar) vs full badge (for header) */
  compact?: boolean;
  /** Model name to display alongside provider (e.g., "opus", "sonnet") */
  model?: string;
  className?: string;
}

/**
 * Badge showing which AI provider is running a session.
 * Use compact mode for sidebar lists, full mode for session headers.
 */
export function ProviderBadge({
  provider,
  compact = false,
  model,
  className = "",
}: ProviderBadgeProps) {
  const color = PROVIDER_COLORS[provider];
  const label = PROVIDER_LABELS[provider];

  // Format model name for display
  const getModelLabel = (modelName: string | undefined): string | null => {
    if (!modelName) return null;
    if (modelName === "default") return null;

    // Check if it's a known short model option (e.g., "opus", "sonnet")
    const knownModel = MODEL_OPTIONS.find((o) => o.value === modelName);
    if (knownModel && knownModel.value !== "default") {
      return knownModel.label;
    }

    // Parse full model IDs like "claude-opus-4-5-20251101" or "claude-sonnet-4-20250514"
    // Extract the model family (opus, sonnet, haiku) from the full ID
    const claudeMatch = modelName.match(/claude-(\w+)-/);
    if (claudeMatch?.[1]) {
      const family = claudeMatch[1];
      // Check if the extracted family is a known model
      const familyModel = MODEL_OPTIONS.find((o) => o.value === family);
      if (familyModel) {
        return familyModel.label;
      }
      // Capitalize unknown family
      return family.charAt(0).toUpperCase() + family.slice(1);
    }

    // For other models, capitalize first letter
    return modelName.charAt(0).toUpperCase() + modelName.slice(1);
  };

  const modelLabel = getModelLabel(model);

  if (compact) {
    return (
      <span
        className={`provider-badge-stripe ${className}`}
        style={{ backgroundColor: color }}
        title={modelLabel ? `${label} (${modelLabel})` : label}
        aria-label={`Provider: ${label}${modelLabel ? ` (${modelLabel})` : ""}`}
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
      {modelLabel && <span className="provider-badge-model">{modelLabel}</span>}
    </span>
  );
}
