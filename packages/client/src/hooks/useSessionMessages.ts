import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import {
  getMessageId,
  mergeJSONLMessages,
  mergeSSEMessage,
} from "../lib/mergeMessages";
import { getProvider } from "../providers/registry";
import type { Message, Session, SessionStatus } from "../types";

/** Content from a subagent (Task tool) */
export interface AgentContent {
  messages: Message[];
  status: "pending" | "running" | "completed" | "failed";
  /** Real-time context usage from message_start events */
  contextUsage?: {
    inputTokens: number;
    percentage: number;
  };
}

/** Map of agentId → agent content */
export type AgentContentMap = Record<string, AgentContent>;

/** Result from initial session load */
export interface SessionLoadResult {
  session: Session;
  status: SessionStatus;
  pendingInputRequest?: unknown;
}

/** Options for useSessionMessages */
export interface UseSessionMessagesOptions {
  projectId: string;
  sessionId: string;
  /** Called when initial load completes with session data */
  onLoadComplete?: (result: SessionLoadResult) => void;
  /** Called on load error */
  onLoadError?: (error: Error) => void;
}

/** Result from useSessionMessages hook */
export interface UseSessionMessagesResult {
  /** Messages in the session */
  messages: Message[];
  /** Subagent content keyed by agentId */
  agentContent: AgentContentMap;
  /** Mapping from Task tool_use_id → agentId */
  toolUseToAgent: Map<string, string>;
  /** Whether initial load is in progress */
  loading: boolean;
  /** Session data from initial load */
  session: Session | null;
  /** Set session data (for SSE connected event) */
  setSession: React.Dispatch<React.SetStateAction<Session | null>>;
  /** Handle streaming content updates (for useStreamingContent) */
  handleStreamingUpdate: (message: Message, agentId?: string) => void;
  /** Handle SSE message event (buffered until initial load completes) */
  handleSSEMessageEvent: (incoming: Message) => void;
  /** Handle SSE subagent message event */
  handleSSESubagentMessage: (incoming: Message, agentId: string) => void;
  /** Register toolUse → agent mapping */
  registerToolUseAgent: (toolUseId: string, agentId: string) => void;
  /** Update agent content (for lazy loading) */
  setAgentContent: React.Dispatch<React.SetStateAction<AgentContentMap>>;
  /** Update toolUseToAgent mapping */
  setToolUseToAgent: React.Dispatch<React.SetStateAction<Map<string, string>>>;
  /** Direct messages setter (for clearing streaming placeholders) */
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  /** Fetch new messages incrementally (for file change events) */
  fetchNewMessages: () => Promise<void>;
  /** Fetch session metadata only */
  fetchSessionMetadata: () => Promise<void>;
}

/**
 * Hook for managing session messages with SSE buffering.
 *
 * Handles:
 * - Initial REST load of messages
 * - Buffering SSE messages until initial load completes
 * - Merging SSE and JSONL messages
 * - Routing subagent messages to agentContent
 */
export function useSessionMessages(
  options: UseSessionMessagesOptions,
): UseSessionMessagesResult {
  const { projectId, sessionId, onLoadComplete, onLoadError } = options;

  // Core state
  const [messages, setMessages] = useState<Message[]>([]);
  const [agentContent, setAgentContent] = useState<AgentContentMap>({});
  const [toolUseToAgent, setToolUseToAgent] = useState<Map<string, string>>(
    () => new Map(),
  );
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);

  // Buffering: queue SSE messages until initial load completes
  const sseBufferRef = useRef<
    Array<
      | { type: "message"; msg: Message }
      | { type: "subagent"; msg: Message; agentId: string }
    >
  >([]);
  const initialLoadCompleteRef = useRef(false);

  // Track provider for DAG ordering decisions
  const providerRef = useRef<string | undefined>(undefined);

  // Track last message ID for incremental fetching
  const lastMessageIdRef = useRef<string | undefined>(undefined);

  // Update lastMessageIdRef when messages change
  useEffect(() => {
    const lastMessage = messages[messages.length - 1];
    if (lastMessage) {
      lastMessageIdRef.current = getMessageId(lastMessage);
    }
  }, [messages]);

  // Process a buffered SSE message event
  const processSSEMessage = useCallback((incoming: Message) => {
    setMessages((prev) => {
      const result = mergeSSEMessage(prev, incoming);
      return result.messages;
    });
  }, []);

  // Process a buffered SSE subagent message
  const processSSESubagentMessage = useCallback(
    (incoming: Message, agentId: string) => {
      setAgentContent((prev) => {
        const existing = prev[agentId] ?? {
          messages: [],
          status: "running" as const,
        };
        const incomingId = getMessageId(incoming);
        if (existing.messages.some((m) => getMessageId(m) === incomingId)) {
          return prev;
        }
        return {
          ...prev,
          [agentId]: {
            ...existing,
            messages: [...existing.messages, incoming],
            status: "running",
          },
        };
      });
    },
    [],
  );

  // Flush buffered SSE messages after initial load
  const flushBuffer = useCallback(() => {
    const buffer = sseBufferRef.current;
    sseBufferRef.current = [];
    for (const item of buffer) {
      if (item.type === "message") {
        processSSEMessage(item.msg);
      } else {
        processSSESubagentMessage(item.msg, item.agentId);
      }
    }
  }, [processSSEMessage, processSSESubagentMessage]);

  // Initial load
  useEffect(() => {
    initialLoadCompleteRef.current = false;
    sseBufferRef.current = [];
    setLoading(true);
    setAgentContent({});

    api
      .getSession(projectId, sessionId)
      .then((data) => {
        setSession(data.session);
        providerRef.current = data.session.provider;

        // Tag messages from JSONL as authoritative
        const taggedMessages = data.messages.map((m) => ({
          ...m,
          _source: "jsonl" as const,
        }));
        setMessages(taggedMessages);

        // Mark ready and flush buffer
        initialLoadCompleteRef.current = true;
        flushBuffer();

        setLoading(false);

        // Notify parent
        onLoadComplete?.({
          session: data.session,
          status: data.status,
          pendingInputRequest: data.pendingInputRequest,
        });
      })
      .catch((err) => {
        setLoading(false);
        onLoadError?.(err);
      });
  }, [projectId, sessionId, onLoadComplete, onLoadError, flushBuffer]);

  // Handle streaming content updates (from useStreamingContent)
  const handleStreamingUpdate = useCallback(
    (streamingMessage: Message, agentId?: string) => {
      const messageId = getMessageId(streamingMessage);
      if (!messageId) return;

      if (agentId) {
        // Route to agentContent
        setAgentContent((prev) => {
          const existing = prev[agentId] ?? {
            messages: [],
            status: "running" as const,
          };
          const existingIdx = existing.messages.findIndex(
            (m) => getMessageId(m) === messageId,
          );

          if (existingIdx >= 0) {
            const updated = [...existing.messages];
            updated[existingIdx] = streamingMessage;
            return { ...prev, [agentId]: { ...existing, messages: updated } };
          }
          return {
            ...prev,
            [agentId]: {
              ...existing,
              messages: [...existing.messages, streamingMessage],
            },
          };
        });
        return;
      }

      // Route to main messages
      setMessages((prev) => {
        const existingIdx = prev.findIndex(
          (m) => getMessageId(m) === messageId,
        );
        if (existingIdx >= 0) {
          const updated = [...prev];
          updated[existingIdx] = streamingMessage;
          return updated;
        }
        return [...prev, streamingMessage];
      });
    },
    [],
  );

  // Handle SSE message event (with buffering)
  const handleSSEMessageEvent = useCallback(
    (incoming: Message) => {
      if (!initialLoadCompleteRef.current) {
        sseBufferRef.current.push({ type: "message", msg: incoming });
        return;
      }
      processSSEMessage(incoming);
    },
    [processSSEMessage],
  );

  // Handle SSE subagent message event (with buffering)
  const handleSSESubagentMessage = useCallback(
    (incoming: Message, agentId: string) => {
      if (!initialLoadCompleteRef.current) {
        sseBufferRef.current.push({ type: "subagent", msg: incoming, agentId });
        return;
      }
      processSSESubagentMessage(incoming, agentId);
    },
    [processSSESubagentMessage],
  );

  // Register toolUse → agent mapping
  const registerToolUseAgent = useCallback(
    (toolUseId: string, agentId: string) => {
      setToolUseToAgent((prev) => {
        if (prev.has(toolUseId)) return prev;
        const next = new Map(prev);
        next.set(toolUseId, agentId);
        return next;
      });
    },
    [],
  );

  // Fetch new messages incrementally (for file change events)
  const fetchNewMessages = useCallback(async () => {
    try {
      const data = await api.getSession(
        projectId,
        sessionId,
        lastMessageIdRef.current,
      );
      if (data.messages.length > 0) {
        setMessages((prev) => {
          const result = mergeJSONLMessages(prev, data.messages, {
            skipDagOrdering: !getProvider(data.session.provider).capabilities
              .supportsDag,
          });
          return result.messages;
        });
      }
      // Update session metadata (including title, model, contextUsage) which may have changed
      // For new sessions, prev may be null if JSONL didn't exist on initial load
      setSession((prev) =>
        prev
          ? { ...prev, ...data.session, messages: prev.messages }
          : data.session,
      );
    } catch {
      // Silent fail for incremental updates
    }
  }, [projectId, sessionId]);

  // Fetch session metadata only
  const fetchSessionMetadata = useCallback(async () => {
    try {
      const data = await api.getSessionMetadata(projectId, sessionId);
      // For new sessions, prev may be null if JSONL didn't exist on initial load
      setSession((prev) =>
        prev
          ? { ...prev, ...data.session, messages: prev.messages }
          : { ...data.session, messages: [] },
      );
    } catch {
      // Silent fail for metadata updates
    }
  }, [projectId, sessionId]);

  return {
    messages,
    agentContent,
    toolUseToAgent,
    loading,
    session,
    setSession,
    handleStreamingUpdate,
    handleSSEMessageEvent,
    handleSSESubagentMessage,
    registerToolUseAgent,
    setAgentContent,
    setToolUseToAgent,
    setMessages,
    fetchNewMessages,
    fetchSessionMetadata,
  };
}
