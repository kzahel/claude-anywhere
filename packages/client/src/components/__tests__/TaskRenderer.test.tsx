import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AgentContentProvider } from "../../contexts/AgentContentContext";
import { SessionMetadataProvider } from "../../contexts/SessionMetadataContext";
import type { AgentContentMap } from "../../hooks/useSession";
import type { Message } from "../../types";

// Sample agent messages for testing
const sampleAgentMessages: Message[] = [
  {
    id: "msg-1",
    type: "assistant",
    role: "assistant",
    content: [{ type: "text", text: "Searching for tree files..." }],
  },
  {
    id: "msg-2",
    type: "assistant",
    role: "assistant",
    content: [
      {
        type: "tool_use",
        id: "tool-1",
        name: "Grep",
        input: { pattern: "tree" },
      },
    ],
  },
  {
    id: "msg-3",
    type: "user",
    role: "user",
    content: [
      {
        type: "tool_result",
        tool_use_id: "tool-1",
        content: "Found 5 matches",
      },
    ],
  },
];

// Wrapper component with AgentContentProvider and SessionMetadataProvider
function TestWrapper({
  children,
  agentContent = {},
  toolUseToAgent = new Map(),
}: {
  children: React.ReactNode;
  agentContent?: AgentContentMap;
  toolUseToAgent?: Map<string, string>;
}) {
  return (
    <SessionMetadataProvider
      projectId="proj-1"
      projectPath="/test/project"
      sessionId="session-1"
    >
      <AgentContentProvider
        agentContent={agentContent}
        setAgentContent={() => {}}
        toolUseToAgent={toolUseToAgent}
        projectId="proj-1"
        sessionId="session-1"
      >
        {children}
      </AgentContentProvider>
    </SessionMetadataProvider>
  );
}

describe("AgentContentProvider", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders children correctly", () => {
    render(
      <TestWrapper>
        <div data-testid="test-child">Hello</div>
      </TestWrapper>,
    );

    expect(screen.getByTestId("test-child")).toBeDefined();
  });

  it("provides agent content through context", () => {
    const agentContent: AgentContentMap = {
      "agent-abc123": {
        messages: sampleAgentMessages,
        status: "completed",
      },
    };

    render(
      <TestWrapper agentContent={agentContent}>
        <div>Test</div>
      </TestWrapper>,
    );

    // Provider renders without error
    expect(screen.getByText("Test")).toBeDefined();
  });

  it("provides empty content for unknown agent", () => {
    const agentContent: AgentContentMap = {};

    render(
      <TestWrapper agentContent={agentContent}>
        <div>Test</div>
      </TestWrapper>,
    );

    // Provider renders without error even with empty content
    expect(screen.getByText("Test")).toBeDefined();
  });
});

describe("AgentContent data structures", () => {
  it("tracks agent messages correctly", () => {
    const agentContent: AgentContentMap = {
      "agent-1": {
        messages: [
          { id: "m1", type: "assistant", content: "Hello" },
          { id: "m2", type: "assistant", content: "World" },
        ],
        status: "running",
      },
      "agent-2": {
        messages: [{ id: "m3", type: "assistant", content: "Done" }],
        status: "completed",
      },
    };

    expect(agentContent["agent-1"]?.messages.length).toBe(2);
    expect(agentContent["agent-2"]?.status).toBe("completed");
    expect(agentContent["agent-3"]).toBeUndefined();
  });

  it("supports different agent statuses", () => {
    const statuses = ["pending", "running", "completed", "failed"] as const;

    for (const status of statuses) {
      const content: AgentContentMap = {
        agent: { messages: [], status },
      };
      expect(content.agent?.status).toBe(status);
    }
  });
});
