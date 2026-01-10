import { useCallback, useState } from "react";
import { api } from "../api/client";
import type { PatchHunk } from "../components/renderers/tools/types";
import { useSessionMetadata } from "../contexts/SessionMetadataContext";

interface ExpandedDiffResult {
  structuredPatch: PatchHunk[];
  diffHtml: string;
}

interface UseExpandedDiffOptions {
  filePath: string;
  oldString: string;
  newString: string;
  /** Complete file content from SDK Edit result (never truncated, verified up to 150KB+) */
  originalFile: string;
}

/**
 * Hook to fetch an expanded diff with full file context from the server.
 * The server computes the diff with syntax highlighting and word-level diffs.
 *
 * Uses originalFile from the SDK's Edit tool result directly - the SDK never
 * truncates this field (verified up to 150KB+ files).
 */
export function useExpandedDiff(options: UseExpandedDiffOptions) {
  const { projectId } = useSessionMetadata();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ExpandedDiffResult | null>(null);

  const fetchExpandedDiff = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.expandDiffContext(
        projectId,
        options.filePath,
        options.oldString,
        options.newString,
        options.originalFile,
      );
      setResult({
        structuredPatch: data.structuredPatch as PatchHunk[],
        diffHtml: data.diffHtml,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to expand context");
    } finally {
      setLoading(false);
    }
  }, [
    projectId,
    options.filePath,
    options.oldString,
    options.newString,
    options.originalFile,
  ]);

  return { loading, error, result, fetchExpandedDiff };
}
