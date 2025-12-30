/**
 * Permission mode for tool approvals.
 * - "default": Ask user before executing each tool
 * - "acceptEdits": Auto-approve file editing tools (Edit, Write, NotebookEdit), ask for others
 * - "plan": Deny all tools (planning/analysis only)
 * - "bypassPermissions": Auto-approve all tools (full autonomous mode)
 */
export type PermissionMode =
  | "default"
  | "bypassPermissions"
  | "acceptEdits"
  | "plan";

/**
 * Status of a session.
 * - "idle": No active process
 * - "owned": Process is running and owned by this server
 * - "external": Session is being controlled by an external program
 */
export type SessionStatus =
  | { state: "idle" }
  | {
      state: "owned";
      processId: string;
      permissionMode?: PermissionMode;
      modeVersion?: number;
    }
  | { state: "external" };
