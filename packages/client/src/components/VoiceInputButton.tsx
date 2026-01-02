import {
  type ForwardedRef,
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
} from "react";
import { useModelSettings } from "../hooks/useModelSettings";
import { useSpeechRecognition } from "../hooks/useSpeechRecognition";

export interface VoiceInputButtonRef {
  /** Stop listening and return any pending interim text */
  stopAndFinalize: () => string;
  /** Toggle listening on/off */
  toggle: () => void;
  /** Whether currently listening */
  isListening: boolean;
  /** Whether voice input is available (supported and enabled) */
  isAvailable: boolean;
}

interface VoiceInputButtonProps {
  /** Callback when final transcript is received - appends to input */
  onTranscript: (text: string) => void;
  /** Callback for interim results - shows live preview */
  onInterimTranscript?: (text: string) => void;
  /** Whether the button should be disabled */
  disabled?: boolean;
  /** Additional class name */
  className?: string;
}

/**
 * Microphone button for voice input using Web Speech API.
 * Only renders when:
 * 1. Web Speech API is supported (Chrome/Edge)
 * 2. Voice input is enabled in settings
 */
export const VoiceInputButton = forwardRef(function VoiceInputButton(
  {
    onTranscript,
    onInterimTranscript,
    disabled,
    className = "",
  }: VoiceInputButtonProps,
  ref: ForwardedRef<VoiceInputButtonRef>,
) {
  const { voiceInputEnabled } = useModelSettings();

  const handleResult = useCallback(
    (transcript: string) => {
      onTranscript(transcript);
    },
    [onTranscript],
  );

  const handleInterim = useCallback(
    (transcript: string) => {
      onInterimTranscript?.(transcript);
    },
    [onInterimTranscript],
  );

  const {
    isSupported,
    isListening,
    toggleListening,
    stopListening,
    error,
    interimTranscript,
  } = useSpeechRecognition({
    onResult: handleResult,
    onInterimResult: handleInterim,
  });

  const isAvailable = isSupported && voiceInputEnabled;

  // Expose methods and state to parent
  useImperativeHandle(
    ref,
    () => ({
      stopAndFinalize: () => {
        const pending = interimTranscript;
        if (isListening) {
          stopListening();
        }
        return pending;
      },
      toggle: toggleListening,
      isListening,
      isAvailable,
    }),
    [
      interimTranscript,
      isListening,
      stopListening,
      toggleListening,
      isAvailable,
    ],
  );

  // Clear interim when listening stops
  useEffect(() => {
    if (!isListening && interimTranscript) {
      onInterimTranscript?.("");
    }
  }, [isListening, interimTranscript, onInterimTranscript]);

  // Don't render if not supported or disabled in settings
  if (!isAvailable) {
    return null;
  }

  return (
    <button
      type="button"
      className={`voice-input-button ${isListening ? "listening" : ""} ${className}`}
      onClick={toggleListening}
      disabled={disabled}
      title={
        error
          ? error
          : isListening
            ? "Stop voice input (Ctrl+Space)"
            : "Start voice input (Ctrl+Space)"
      }
      aria-label={isListening ? "Stop voice input" : "Start voice input"}
      aria-pressed={isListening}
    >
      {isListening ? (
        // Recording indicator - animated bars
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
          className="voice-input-recording"
        >
          <rect x="4" y="8" width="3" height="8" rx="1" className="bar bar-1" />
          <rect
            x="10.5"
            y="5"
            width="3"
            height="14"
            rx="1"
            className="bar bar-2"
          />
          <rect
            x="17"
            y="8"
            width="3"
            height="8"
            rx="1"
            className="bar bar-3"
          />
        </svg>
      ) : (
        // Microphone icon
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
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
          <line x1="12" y1="19" x2="12" y2="23" />
          <line x1="8" y1="23" x2="16" y2="23" />
        </svg>
      )}
    </button>
  );
});
