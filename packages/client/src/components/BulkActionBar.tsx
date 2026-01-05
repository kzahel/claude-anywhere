interface BulkActionBarProps {
  selectedCount: number;
  onArchive: () => Promise<void>;
  onUnarchive: () => Promise<void>;
  onStar: () => Promise<void>;
  onUnstar: () => Promise<void>;
  onClearSelection: () => void;
  isPending?: boolean;
  /** True if any selected item can be archived (is not archived) */
  canArchive?: boolean;
  /** True if any selected item can be unarchived (is archived) */
  canUnarchive?: boolean;
  /** True if any selected item can be starred (is not starred) */
  canStar?: boolean;
  /** True if any selected item can be unstarred (is starred) */
  canUnstar?: boolean;
}

/**
 * Fixed bottom bar for bulk session actions.
 * Slides up when sessions are selected, slides down when cleared.
 */
export function BulkActionBar({
  selectedCount,
  onArchive,
  onUnarchive,
  onStar,
  onUnstar,
  onClearSelection,
  isPending = false,
  canArchive = true,
  canUnarchive = true,
  canStar = true,
  canUnstar = true,
}: BulkActionBarProps) {
  if (selectedCount === 0) {
    return null;
  }

  return (
    <div className="bulk-action-bar">
      <div className="bulk-action-bar__info">
        <span className="bulk-action-bar__count">{selectedCount} selected</span>
        <button
          type="button"
          className="bulk-action-bar__clear"
          onClick={onClearSelection}
          disabled={isPending}
          aria-label="Clear selection"
        >
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
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <div className="bulk-action-bar__actions">
        {canArchive && (
          <button
            type="button"
            className="bulk-action-button"
            onClick={onArchive}
            disabled={isPending}
            title="Archive selected"
          >
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
              <polyline points="21 8 21 21 3 21 3 8" />
              <rect x="1" y="3" width="22" height="5" />
              <line x1="10" y1="12" x2="14" y2="12" />
            </svg>
            <span>Archive</span>
          </button>
        )}

        {canUnarchive && (
          <button
            type="button"
            className="bulk-action-button"
            onClick={onUnarchive}
            disabled={isPending}
            title="Unarchive selected"
          >
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
              <polyline points="21 8 21 21 3 21 3 8" />
              <rect x="1" y="3" width="22" height="5" />
              <polyline points="12 11 12 17" />
              <polyline points="9 14 12 11 15 14" />
            </svg>
            <span>Unarchive</span>
          </button>
        )}

        {canStar && (
          <button
            type="button"
            className="bulk-action-button"
            onClick={onStar}
            disabled={isPending}
            title="Star selected"
          >
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
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
            <span>Star</span>
          </button>
        )}

        {canUnstar && (
          <button
            type="button"
            className="bulk-action-button"
            onClick={onUnstar}
            disabled={isPending}
            title="Unstar selected"
          >
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
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              <line x1="4" y1="4" x2="20" y2="20" />
            </svg>
            <span>Unstar</span>
          </button>
        )}
      </div>
    </div>
  );
}
