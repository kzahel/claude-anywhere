import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useRef,
} from "react";
import type { AugmentEvent, PendingEvent } from "../hooks/useStreamingMarkdown";

/**
 * Handler callbacks for the streaming text block
 */
interface StreamingHandlers {
  onAugment: (augment: AugmentEvent) => void;
  onPending: (pending: PendingEvent) => void;
  onStreamEnd: () => void;
}

/**
 * Context value for streaming markdown events
 */
interface StreamingMarkdownContextValue {
  /**
   * Register as the current streaming text block handler.
   * Only one handler can be registered at a time (the streaming TextBlock).
   * Returns an unregister function.
   */
  registerStreamingHandler: (handlers: StreamingHandlers) => () => void;

  /**
   * Dispatch an augment event to the current streaming handler.
   */
  dispatchAugment: (augment: AugmentEvent) => void;

  /**
   * Dispatch a pending text event to the current streaming handler.
   */
  dispatchPending: (pending: PendingEvent) => void;

  /**
   * Signal that streaming has ended.
   */
  dispatchStreamEnd: () => void;

  /**
   * Set the current streaming message ID.
   * Called when message_start event is received.
   * (Used for internal tracking, not for registration)
   */
  setCurrentMessageId: (messageId: string | null) => void;
}

const StreamingMarkdownContext =
  createContext<StreamingMarkdownContextValue | null>(null);

interface StreamingMarkdownProviderProps {
  children: ReactNode;
}

/**
 * Provider for streaming markdown events.
 *
 * This context acts as an event bus between SSE events and TextBlock components.
 * When augment/pending events arrive from SSE, they're dispatched to the
 * registered streaming handler (the currently streaming TextBlock).
 */
export function StreamingMarkdownProvider({
  children,
}: StreamingMarkdownProviderProps) {
  // Current streaming handler (only one TextBlock at a time is streaming)
  const handlersRef = useRef<StreamingHandlers | null>(null);

  // Current streaming message ID (for debugging/tracking, not used for dispatch)
  const currentMessageIdRef = useRef<string | null>(null);

  const registerStreamingHandler = useCallback(
    (handlers: StreamingHandlers): (() => void) => {
      if (
        typeof window !== "undefined" &&
        (window as unknown as { __STREAMING_DEBUG__?: boolean }).__STREAMING_DEBUG__
      ) {
        console.log(
          "%c[CONTEXT] Handler registered",
          "color: #2196F3",
          { hadPreviousHandler: !!handlersRef.current },
        );
      }
      handlersRef.current = handlers;
      return () => {
        // Only unregister if this is still the current handler
        if (handlersRef.current === handlers) {
          if (
            typeof window !== "undefined" &&
            (window as unknown as { __STREAMING_DEBUG__?: boolean }).__STREAMING_DEBUG__
          ) {
            console.log("%c[CONTEXT] Handler unregistered", "color: #FF5722");
          }
          handlersRef.current = null;
        }
      };
    },
    [],
  );

  const setCurrentMessageId = useCallback((messageId: string | null) => {
    currentMessageIdRef.current = messageId;
  }, []);

  const dispatchAugment = useCallback((augment: AugmentEvent) => {
    if (
      typeof window !== "undefined" &&
      (window as unknown as { __STREAMING_DEBUG__?: boolean }).__STREAMING_DEBUG__
    ) {
      console.log(
        "%c[CONTEXT] dispatchAugment called",
        "color: #4CAF50",
        {
          hasHandler: !!handlersRef.current,
          augment: { blockIndex: augment.blockIndex, type: augment.type },
        },
      );
    }
    handlersRef.current?.onAugment(augment);
  }, []);

  const dispatchPending = useCallback((pending: PendingEvent) => {
    if (
      typeof window !== "undefined" &&
      (window as unknown as { __STREAMING_DEBUG__?: boolean }).__STREAMING_DEBUG__
    ) {
      console.log(
        "%c[CONTEXT] dispatchPending called",
        "color: #FF9800",
        {
          hasHandler: !!handlersRef.current,
          htmlLength: pending.html.length,
        },
      );
    }
    handlersRef.current?.onPending(pending);
  }, []);

  const dispatchStreamEnd = useCallback(() => {
    handlersRef.current?.onStreamEnd();
    // Clear current message ID after stream ends
    currentMessageIdRef.current = null;
  }, []);

  const value: StreamingMarkdownContextValue = {
    registerStreamingHandler,
    setCurrentMessageId,
    dispatchAugment,
    dispatchPending,
    dispatchStreamEnd,
  };

  return (
    <StreamingMarkdownContext.Provider value={value}>
      {children}
    </StreamingMarkdownContext.Provider>
  );
}

/**
 * Hook to access the streaming markdown context.
 * Returns null if not within a provider (for graceful degradation).
 */
export function useStreamingMarkdownContext(): StreamingMarkdownContextValue | null {
  return useContext(StreamingMarkdownContext);
}
