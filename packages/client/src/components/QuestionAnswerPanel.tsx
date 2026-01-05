import { useCallback, useEffect, useRef, useState } from "react";
import { useQuestionOtherDrafts } from "../hooks/useDrafts";
import type { InputRequest } from "../types";
import type { AskUserQuestionInput, Question } from "./renderers/tools/types";

interface Props {
  request: InputRequest;
  sessionId: string;
  onSubmit: (answers: Record<string, string>) => Promise<void>;
  onDeny: () => Promise<void>;
}

/**
 * Panel for answering AskUserQuestion tool calls.
 * Shows one question at a time with tabs to navigate between them.
 */
export function QuestionAnswerPanel({
  request,
  sessionId,
  onSubmit,
  onDeny,
}: Props) {
  const input = request.toolInput as AskUserQuestionInput;
  const questions = input?.questions || [];

  const [currentTab, setCurrentTab] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  // Persist "Other" text inputs to localStorage keyed by sessionId
  const [otherTexts, setOtherText, clearOtherTexts] =
    useQuestionOtherDrafts(sessionId);
  const [submitting, setSubmitting] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const otherInputRef = useRef<HTMLInputElement>(null);

  const currentQuestion = questions[currentTab];
  const isLastQuestion = currentTab === questions.length - 1;
  const currentAnswer = currentQuestion
    ? answers[currentQuestion.question]
    : undefined;
  const isOtherSelected = currentAnswer === "__other__";

  // Check if all questions are answered
  const allAnswered = questions.every((q) => {
    const answer = answers[q.question];
    if (!answer) return false;
    if (answer === "__other__") {
      return (otherTexts[q.question] || "").trim().length > 0;
    }
    return true;
  });

  // Focus the "other" input when it's selected and scroll it into view
  useEffect(() => {
    if (isOtherSelected && otherInputRef.current) {
      otherInputRef.current.focus();
      // Scroll input into view after a short delay to allow keyboard to open
      setTimeout(() => {
        otherInputRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      }, 100);
    }
  }, [isOtherSelected]);

  const handleSelectOption = useCallback(
    (optionLabel: string) => {
      if (!currentQuestion) return;
      setAnswers((prev) => ({
        ...prev,
        [currentQuestion.question]: optionLabel,
      }));
    },
    [currentQuestion],
  );

  const handleOtherTextChange = useCallback(
    (text: string) => {
      if (!currentQuestion) return;
      setOtherText(currentQuestion.question, text);
    },
    [currentQuestion, setOtherText],
  );

  const advanceToNext = useCallback(() => {
    if (!isLastQuestion) {
      setCurrentTab((prev) => prev + 1);
    }
  }, [isLastQuestion]);

  const handleSubmit = useCallback(async () => {
    if (!allAnswered || submitting) return;

    // Build final answers, replacing __other__ with actual text
    const finalAnswers: Record<string, string> = {};
    for (const q of questions) {
      const answer = answers[q.question];
      if (answer === "__other__") {
        finalAnswers[q.question] = otherTexts[q.question] || "";
      } else if (answer) {
        finalAnswers[q.question] = answer;
      }
    }

    setSubmitting(true);
    try {
      await onSubmit(finalAnswers);
      // Clear "Other" drafts from localStorage on successful submit
      clearOtherTexts();
    } finally {
      setSubmitting(false);
    }
  }, [
    allAnswered,
    submitting,
    questions,
    answers,
    otherTexts,
    onSubmit,
    clearOtherTexts,
  ]);

  const handleDeny = useCallback(async () => {
    setSubmitting(true);
    try {
      await onDeny();
    } finally {
      setSubmitting(false);
    }
  }, [onDeny]);

  // Keyboard handling
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (submitting) return;

      // Escape to deny
      if (e.key === "Escape") {
        e.preventDefault();
        handleDeny();
        return;
      }

      // Enter behavior depends on context
      if (e.key === "Enter" && !e.shiftKey) {
        // If "other" is selected and has text, or a regular option is selected
        const hasCurrentAnswer = currentAnswer && currentAnswer !== "__other__";
        const hasOtherAnswer =
          currentAnswer === "__other__" &&
          (otherTexts[currentQuestion?.question || ""] || "").trim().length > 0;

        if (hasCurrentAnswer || hasOtherAnswer) {
          e.preventDefault();
          if (isLastQuestion && allAnswered) {
            handleSubmit();
          } else {
            advanceToNext();
          }
        }
      }

      // Tab/Shift+Tab to navigate between question tabs (when not in input)
      if (e.key === "Tab" && !isOtherSelected) {
        e.preventDefault();
        if (e.shiftKey) {
          setCurrentTab((prev) => Math.max(0, prev - 1));
        } else {
          setCurrentTab((prev) => Math.min(questions.length - 1, prev + 1));
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    submitting,
    currentAnswer,
    currentQuestion,
    otherTexts,
    isLastQuestion,
    allAnswered,
    isOtherSelected,
    questions.length,
    handleDeny,
    handleSubmit,
    advanceToNext,
  ]);

  if (!questions.length) {
    return (
      <div className="question-panel-wrapper">
        <div className="question-panel">
          <div className="question-panel-empty">No questions to answer</div>
        </div>
      </div>
    );
  }

  return (
    <div className="question-panel-wrapper">
      {/* Floating toggle button */}
      <button
        type="button"
        className="question-panel-toggle"
        onClick={() => setCollapsed(!collapsed)}
        aria-label={
          collapsed ? "Expand question panel" : "Collapse question panel"
        }
        aria-expanded={!collapsed}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={collapsed ? "chevron-up" : "chevron-down"}
          aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {!collapsed && (
        <div className="question-panel">
          {/* Tab bar */}
          <div className="question-tabs">
            {questions.map((q, idx) => {
              const isActive = idx === currentTab;
              const isAnswered = !!answers[q.question];
              return (
                <button
                  key={q.question}
                  type="button"
                  className={`question-tab ${isActive ? "active" : ""} ${isAnswered ? "answered" : ""}`}
                  onClick={() => setCurrentTab(idx)}
                >
                  {isAnswered && <span className="question-tab-check">✓</span>}
                  {q.header}
                </button>
              );
            })}
          </div>

          {/* Current question */}
          {currentQuestion && (
            <div className="question-content">
              <div className="question-text">{currentQuestion.question}</div>

              <div className="question-options-list">
                {currentQuestion.options.map((option) => {
                  const isSelected = currentAnswer === option.label;
                  return (
                    <button
                      key={option.label}
                      type="button"
                      className={`question-option-btn ${isSelected ? "selected" : ""}`}
                      onClick={() => handleSelectOption(option.label)}
                    >
                      <span className="question-option-radio">
                        {currentQuestion.multiSelect
                          ? isSelected
                            ? "☑"
                            : "☐"
                          : isSelected
                            ? "●"
                            : "○"}
                      </span>
                      <div className="question-option-text">
                        <span className="question-option-label">
                          {option.label}
                        </span>
                        {option.description && (
                          <span className="question-option-desc">
                            {option.description}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}

                {/* Other option */}
                <button
                  type="button"
                  className={`question-option-btn other ${isOtherSelected ? "selected" : ""}`}
                  onClick={() => handleSelectOption("__other__")}
                >
                  <span className="question-option-radio">
                    {isOtherSelected ? "●" : "○"}
                  </span>
                  <div className="question-option-text">
                    <span className="question-option-label">Other</span>
                  </div>
                </button>

                {/* Other text input */}
                {isOtherSelected && (
                  <div className="question-other-input">
                    <input
                      ref={otherInputRef}
                      type="text"
                      placeholder="Type your answer..."
                      value={otherTexts[currentQuestion.question] || ""}
                      onChange={(e) => handleOtherTextChange(e.target.value)}
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="question-actions">
            <button
              type="button"
              className="question-btn deny"
              onClick={handleDeny}
              disabled={submitting}
            >
              Cancel
              <kbd>esc</kbd>
            </button>

            {isLastQuestion ? (
              <button
                type="button"
                className="question-btn submit"
                onClick={handleSubmit}
                disabled={!allAnswered || submitting}
              >
                Submit
                <kbd>↵</kbd>
              </button>
            ) : (
              <button
                type="button"
                className="question-btn next"
                onClick={advanceToNext}
                disabled={!currentAnswer || submitting}
              >
                Next
                <kbd>↵</kbd>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
