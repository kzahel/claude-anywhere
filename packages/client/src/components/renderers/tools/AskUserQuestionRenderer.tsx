import { useEffect, useState } from "react";
import type { ZodError } from "zod";
import { useSchemaValidationContext } from "../../../contexts/SchemaValidationContext";
import { validateToolResult } from "../../../lib/validateToolResult";
import { SchemaWarning } from "../../SchemaWarning";
import type {
  AskUserQuestionInput,
  AskUserQuestionResult,
  Question,
  ToolRenderer,
} from "./types";

/**
 * Single question display
 */
function QuestionDisplay({
  question,
  selectedAnswer,
}: {
  question: Question;
  selectedAnswer?: string;
}) {
  return (
    <div className="question-item">
      <div className="question-header">
        <span className="badge">{question.header}</span>
        <span className="question-text">{question.question}</span>
      </div>
      <ul className="question-options">
        {question.options.map((option) => {
          const isSelected = selectedAnswer === option.label;
          return (
            <li
              key={option.label}
              className={`question-option ${isSelected ? "question-option-selected" : ""}`}
            >
              <span className="question-option-indicator">
                {question.multiSelect
                  ? isSelected
                    ? "☑"
                    : "☐"
                  : isSelected
                    ? "●"
                    : "○"}
              </span>
              <div className="question-option-content">
                <span className="question-option-label">{option.label}</span>
                {option.description && (
                  <span className="question-option-desc">
                    {option.description}
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * AskUserQuestion tool use - shows questions to be asked
 */
function AskUserQuestionToolUse({ input }: { input: AskUserQuestionInput }) {
  return (
    <div className="question-tool-use">
      {input.questions.map((q, i) => (
        <QuestionDisplay key={`${q.header}-${i}`} question={q} />
      ))}
    </div>
  );
}

/**
 * AskUserQuestion tool result - shows questions with selected answers
 */
function AskUserQuestionToolResult({
  result,
  isError,
}: {
  result: AskUserQuestionResult;
  isError: boolean;
}) {
  const { enabled, reportValidationError, isToolIgnored } =
    useSchemaValidationContext();
  const [validationErrors, setValidationErrors] = useState<ZodError | null>(
    null,
  );

  useEffect(() => {
    if (enabled && result) {
      const validation = validateToolResult("AskUserQuestion", result);
      if (!validation.valid && validation.errors) {
        setValidationErrors(validation.errors);
        reportValidationError("AskUserQuestion", validation.errors);
      } else {
        setValidationErrors(null);
      }
    }
  }, [enabled, result, reportValidationError]);

  const showValidationWarning =
    enabled && validationErrors && !isToolIgnored("AskUserQuestion");

  if (isError) {
    const errorResult = result as unknown as { content?: unknown } | undefined;
    return (
      <div className="question-error">
        {showValidationWarning && validationErrors && (
          <SchemaWarning toolName="AskUserQuestion" errors={validationErrors} />
        )}
        {typeof result === "object" && errorResult?.content
          ? String(errorResult.content)
          : "Question failed"}
      </div>
    );
  }

  if (!result || !result.questions) {
    return (
      <div className="question-empty">
        {showValidationWarning && validationErrors && (
          <SchemaWarning toolName="AskUserQuestion" errors={validationErrors} />
        )}
        No questions
      </div>
    );
  }

  return (
    <div className="question-result">
      {showValidationWarning && validationErrors && (
        <SchemaWarning toolName="AskUserQuestion" errors={validationErrors} />
      )}
      {result.questions.map((q, i) => {
        // Find the answer by matching the question text
        const answer = result.answers?.[q.question];
        return (
          <QuestionDisplay
            key={`${q.header}-${i}`}
            question={q}
            selectedAnswer={answer}
          />
        );
      })}
    </div>
  );
}

export const askUserQuestionRenderer: ToolRenderer<
  AskUserQuestionInput,
  AskUserQuestionResult
> = {
  tool: "AskUserQuestion",

  renderToolUse(input, _context) {
    return <AskUserQuestionToolUse input={input as AskUserQuestionInput} />;
  },

  renderToolResult(result, isError, _context) {
    return (
      <AskUserQuestionToolResult
        result={result as AskUserQuestionResult}
        isError={isError}
      />
    );
  },

  getUseSummary(input) {
    const questions = (input as AskUserQuestionInput).questions;
    return `${questions?.length || 0} question${questions?.length === 1 ? "" : "s"}`;
  },

  getResultSummary(result: AskUserQuestionResult, isError: boolean): string {
    if (isError) return "Error";
    const answered = Object.keys(result?.answers || {}).length;
    const questionCount = result?.questions?.length || 0;
    // If no answers yet but we have questions, show question count instead
    if (answered === 0 && questionCount > 0) {
      return `${questionCount} question${questionCount === 1 ? "" : "s"}`;
    }
    return `${answered} answered`;
  },
};
