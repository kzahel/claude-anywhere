import { useCallback, useEffect, useRef, useState } from "react";
import { computeSpeechDelta } from "../lib/speechRecognition";

// Web Speech API types (not included in lib.dom by default)
interface SpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  readonly transcript: string;
  readonly confidence: number;
}

interface SpeechRecognitionResultList {
  readonly length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  readonly error:
    | "no-speech"
    | "aborted"
    | "audio-capture"
    | "network"
    | "not-allowed"
    | "service-not-allowed"
    | "bad-grammar"
    | "language-not-supported";
  readonly message: string;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onstart: ((this: SpeechRecognition, ev: Event) => void) | null;
  onend: ((this: SpeechRecognition, ev: Event) => void) | null;
  onerror:
    | ((this: SpeechRecognition, ev: SpeechRecognitionErrorEvent) => void)
    | null;
  onresult:
    | ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => void)
    | null;
  start(): void;
  stop(): void;
  abort(): void;
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognition;
}

// Extend Window interface for vendor-prefixed API
declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

export interface UseSpeechRecognitionOptions {
  /** Language for recognition (default: browser default) */
  lang?: string;
  /** Callback when final transcript is available */
  onResult?: (transcript: string) => void;
  /** Callback for interim results (live transcription) */
  onInterimResult?: (transcript: string) => void;
  /** Callback when recognition ends */
  onEnd?: () => void;
  /** Callback on error */
  onError?: (error: string) => void;
}

export interface UseSpeechRecognitionReturn {
  /** Whether the Web Speech API is supported */
  isSupported: boolean;
  /** Whether currently listening */
  isListening: boolean;
  /** Current interim transcript (updates in real-time) */
  interimTranscript: string;
  /** Start listening */
  startListening: () => void;
  /** Stop listening */
  stopListening: () => void;
  /** Toggle listening state */
  toggleListening: () => void;
  /** Last error message */
  error: string | null;
}

/**
 * Get the SpeechRecognition constructor if available.
 */
function getSpeechRecognition(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
}

/**
 * Hook for using the Web Speech Recognition API.
 * Only works in Chrome/Edge browsers.
 */
export function useSpeechRecognition(
  options: UseSpeechRecognitionOptions = {},
): UseSpeechRecognitionReturn {
  const { lang, onResult, onInterimResult, onEnd, onError } = options;

  const [isSupported] = useState(() => !!getSpeechRecognition());
  const [isListening, setIsListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const isStoppingRef = useRef(false);
  // Track the last final transcript to compute deltas on mobile
  // Mobile Chrome marks cumulative results as isFinal, so we need to dedupe
  const lastFinalTranscriptRef = useRef<string>("");

  // Store callbacks in refs to avoid recreating recognition on callback changes
  const onResultRef = useRef(onResult);
  const onInterimResultRef = useRef(onInterimResult);
  const onEndRef = useRef(onEnd);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onResultRef.current = onResult;
    onInterimResultRef.current = onInterimResult;
    onEndRef.current = onEnd;
    onErrorRef.current = onError;
  }, [onResult, onInterimResult, onEnd, onError]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
        recognitionRef.current = null;
      }
    };
  }, []);

  const startListening = useCallback(() => {
    const SpeechRecognitionAPI = getSpeechRecognition();
    if (!SpeechRecognitionAPI) {
      setError("Speech recognition not supported");
      return;
    }

    // Clean up any existing instance
    if (recognitionRef.current) {
      recognitionRef.current.abort();
    }

    setError(null);
    setInterimTranscript("");
    isStoppingRef.current = false;
    lastFinalTranscriptRef.current = "";

    const recognition = new SpeechRecognitionAPI();
    recognitionRef.current = recognition;

    // Configure for streaming
    recognition.continuous = true;
    recognition.interimResults = true;
    if (lang) {
      recognition.lang = lang;
    }

    recognition.onstart = () => {
      setIsListening(true);
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interimText = "";
      let latestFinal = "";

      // Find the latest (highest index) final result - on mobile each result
      // is a complete transcript, not a fragment to concatenate
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        if (result) {
          const transcript = result[0]?.transcript ?? "";
          if (result.isFinal) {
            latestFinal = transcript;
          } else {
            interimText += transcript;
          }
        }
      }

      // Compute delta: what's new since last final result
      const deltaTranscript = computeSpeechDelta(
        latestFinal,
        lastFinalTranscriptRef.current,
      );
      if (deltaTranscript) {
        lastFinalTranscriptRef.current = latestFinal;
      }

      // Trim interim text to avoid visual shifting from leading/trailing spaces
      const trimmedInterim = interimText.trim();
      if (trimmedInterim) {
        setInterimTranscript(trimmedInterim);
        onInterimResultRef.current?.(trimmedInterim);
      } else if (interimText && !trimmedInterim) {
        // Clear interim if it was just whitespace
        setInterimTranscript("");
      }

      const trimmedDelta = deltaTranscript.trim();
      if (trimmedDelta) {
        setInterimTranscript("");
        onResultRef.current?.(trimmedDelta);
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      // Don't report aborted as an error (happens on manual stop)
      if (event.error === "aborted") {
        return;
      }

      let errorMessage = "Speech recognition error";
      switch (event.error) {
        case "no-speech":
          errorMessage = "No speech detected";
          break;
        case "audio-capture":
          errorMessage = "No microphone found";
          break;
        case "not-allowed":
          errorMessage = "Microphone permission denied";
          break;
        case "network":
          errorMessage = "Network error during recognition";
          break;
        default:
          errorMessage = `Error: ${event.error}`;
      }

      setError(errorMessage);
      onErrorRef.current?.(errorMessage);
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
      setInterimTranscript("");

      // Auto-restart if not manually stopped (handles Chrome's ~60s timeout)
      if (!isStoppingRef.current && recognitionRef.current === recognition) {
        try {
          recognition.start();
        } catch {
          // Ignore errors on restart attempt
          onEndRef.current?.();
        }
      } else {
        onEndRef.current?.();
      }
    };

    try {
      recognition.start();
    } catch (err) {
      setError("Failed to start speech recognition");
      onErrorRef.current?.("Failed to start speech recognition");
    }
  }, [lang]);

  const stopListening = useCallback(() => {
    isStoppingRef.current = true;
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsListening(false);
    setInterimTranscript("");
  }, []);

  const toggleListening = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }, [isListening, startListening, stopListening]);

  return {
    isSupported,
    isListening,
    interimTranscript,
    startListening,
    stopListening,
    toggleListening,
    error,
  };
}
