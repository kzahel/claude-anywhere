import { memo, useEffect, useState } from "react";
import { ThinkingIndicator } from "./ThinkingIndicator";

const PROCESSING_PHRASES = [
  "Thinking...",
  "Processing...",
  "Cooking...",
  "Analyzing...",
  "Working on it...",
  "Pondering...",
  "Computing...",
  "Crafting...",
];

const ROTATION_INTERVAL_MS = 2000;
const TYPEWRITER_SPEED_MS = 25; // ~40 chars/second = ~240 WPM

interface Props {
  isProcessing: boolean;
}

export const ProcessingIndicator = memo(function ProcessingIndicator({
  isProcessing,
}: Props) {
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [displayedText, setDisplayedText] = useState("");
  const [isTyping, setIsTyping] = useState(true);

  // Rotate phrases
  useEffect(() => {
    if (!isProcessing) {
      setPhraseIndex(0);
      setDisplayedText("");
      setIsTyping(true);
      return;
    }

    const interval = setInterval(() => {
      setPhraseIndex((prev) => (prev + 1) % PROCESSING_PHRASES.length);
      setIsTyping(true);
      setDisplayedText("");
    }, ROTATION_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [isProcessing]);

  // Typewriter effect
  useEffect(() => {
    if (!isProcessing || !isTyping) return;

    const phrase = PROCESSING_PHRASES[phraseIndex] ?? "";
    if (displayedText.length >= phrase.length) {
      setIsTyping(false);
      return;
    }

    const timeout = setTimeout(() => {
      setDisplayedText(phrase.slice(0, displayedText.length + 1));
    }, TYPEWRITER_SPEED_MS);

    return () => clearTimeout(timeout);
  }, [isProcessing, isTyping, phraseIndex, displayedText]);

  if (!isProcessing) {
    return null;
  }

  return (
    <div className="processing-indicator">
      <div className="processing-dot-container">
        <ThinkingIndicator />
      </div>
      <span className="processing-text">
        {displayedText}
        <span className="processing-cursor">|</span>
      </span>
    </div>
  );
});
