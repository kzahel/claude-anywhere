import { type ReactNode, createContext, useContext } from "react";

/**
 * Minimal session metadata for components that need project/session info.
 * Keep this focused - only add fields that are truly needed across the component tree.
 */
interface SessionMetadata {
  projectId: string;
  projectPath: string | null;
  sessionId: string;
}

const SessionMetadataContext = createContext<SessionMetadata | null>(null);

export function SessionMetadataProvider({
  projectId,
  projectPath,
  sessionId,
  children,
}: SessionMetadata & { children: ReactNode }) {
  return (
    <SessionMetadataContext.Provider
      value={{ projectId, projectPath, sessionId }}
    >
      {children}
    </SessionMetadataContext.Provider>
  );
}

/**
 * Get session metadata. Throws if used outside SessionMetadataProvider.
 */
export function useSessionMetadata(): SessionMetadata {
  const context = useContext(SessionMetadataContext);
  if (!context) {
    throw new Error(
      "useSessionMetadata must be used within SessionMetadataProvider",
    );
  }
  return context;
}
