import { memo } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Props {
  text: string;
}

export const TextBlock = memo(function TextBlock({ text }: Props) {
  return (
    <div className="text-block">
      <Markdown remarkPlugins={[remarkGfm]}>{text}</Markdown>
    </div>
  );
});
