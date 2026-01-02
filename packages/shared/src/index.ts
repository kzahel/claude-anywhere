export {
  isIdeMetadata,
  stripIdeMetadata,
  extractOpenedFilePath,
  parseOpenedFiles,
  getFilename,
} from "./ideMetadata.js";

export type {
  PermissionMode,
  SessionStatus,
  ModelOption,
  ThinkingOption,
  FileMetadata,
  FileContentResponse,
} from "./types.js";
export { thinkingOptionToTokens } from "./types.js";

export {
  orderByParentChain,
  needsReorder,
  type DagOrderable,
} from "./dag.js";

export {
  type UrlProjectId,
  type DirProjectId,
  isUrlProjectId,
  isDirProjectId,
  toUrlProjectId,
  fromUrlProjectId,
  assertUrlProjectId,
  asDirProjectId,
} from "./projectId.js";

export type {
  UploadedFile,
  UploadStartMessage,
  UploadEndMessage,
  UploadCancelMessage,
  UploadProgressMessage,
  UploadCompleteMessage,
  UploadErrorMessage,
  UploadClientMessage,
  UploadServerMessage,
} from "./upload.js";

// SDK schema types (type-only, no Zod runtime)
export type {
  // Entry types (JSONL line types)
  AssistantEntry,
  UserEntry,
  SystemEntry,
  SummaryEntry,
  FileHistorySnapshotEntry,
  QueueOperationEntry,
  SessionEntry,
  SidechainEntry,
  BaseEntry,
  // Message types
  AssistantMessage,
  AssistantMessageContent,
  UserMessage,
  UserMessageContent,
  // Content block types
  TextContent,
  ThinkingContent,
  ToolUseContent,
  ToolResultContent,
  ImageContent,
  DocumentContent,
  // Tool types
  StructuredPatch,
  ToolUseResult,
} from "./claude-sdk-schema/types.js";

// App-specific types (extend SDK types with runtime fields)
export type {
  // Content block
  AppContentBlock,
  // Message extensions
  AppMessageExtensions,
  AppUserMessage,
  AppAssistantMessage,
  AppSystemMessage,
  AppSummaryMessage,
  AppMessage,
  AppConversationMessage,
  // Session types
  PendingInputType,
  ProcessStateType,
  ContextUsage,
  AppSessionStatus,
  AppSessionSummary,
  AppSession,
  // Agent session types
  AgentStatus,
  AgentSession,
  // Input request types
  InputRequest,
} from "./app-types.js";
export {
  isUserMessage,
  isAssistantMessage,
  isSystemMessage,
  isSummaryMessage,
  isConversationMessage,
} from "./app-types.js";
