/**
 * Pure utility functions for speech recognition processing.
 * Extracted for testability - the main hook uses these internally.
 */

export interface SpeechResult {
  isFinal: boolean;
  transcript: string;
}

export interface ProcessedSpeechResults {
  /** The latest (highest index) final transcript */
  latestFinal: string;
  /** Combined interim text from all non-final results */
  interimText: string;
}

/**
 * Process an array of speech recognition results.
 * On mobile, each result is a complete cumulative transcript.
 * On desktop, results are separate utterances.
 * We take the LAST final result since on mobile that's the most complete.
 */
export function processSpeechResults(
  results: SpeechResult[],
): ProcessedSpeechResults {
  let latestFinal = "";
  let interimText = "";

  for (const result of results) {
    if (result.isFinal) {
      latestFinal = result.transcript;
    } else {
      interimText += result.transcript;
    }
  }

  return { latestFinal, interimText };
}

/**
 * Compute the delta (new text) between the latest final transcript
 * and the previous one.
 *
 * On mobile Chrome, each "final" result is cumulative (e.g., "hello" -> "hello world").
 * We extract just the new part (" world") to avoid duplicating text.
 *
 * On desktop, separate utterances are independent, so we return the whole thing.
 */
export function computeSpeechDelta(
  latestFinal: string,
  previousFinal: string,
): string {
  if (!latestFinal || latestFinal === previousFinal) {
    return "";
  }

  // If latest starts with previous, extract just the new part (mobile behavior)
  if (latestFinal.startsWith(previousFinal)) {
    return latestFinal.slice(previousFinal.length);
  }

  // New utterance - return the whole thing (desktop behavior after pause)
  return latestFinal;
}
