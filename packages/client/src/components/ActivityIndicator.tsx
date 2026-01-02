/**
 * Unified activity indicator component for showing active/running state.
 * Uses semantic CSS with pulsing animation.
 *
 * Variants:
 * - "dot": Compact pulsing dot (default)
 * - "badge": Dot wrapped in a badge container
 */

interface ActivityIndicatorProps {
  /** Visual variant - "dot" for compact, "badge" for wrapped in badge container */
  variant?: "dot" | "badge";
  /** Optional className for additional styling */
  className?: string;
}

export function ActivityIndicator({
  variant = "dot",
  className,
}: ActivityIndicatorProps) {
  const dot = <span className="activity-dot" />;

  if (variant === "badge") {
    return <span className={`activity-badge ${className ?? ""}`}>{dot}</span>;
  }

  return <span className={`activity-indicator ${className ?? ""}`}>{dot}</span>;
}
