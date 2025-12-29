import { randomUUID } from "node:crypto";
import type { SDKMessage, UserMessage } from "../sdk/types.js";
import type {
  InputRequest,
  ProcessEvent,
  ProcessInfo,
  ProcessOptions,
  ProcessState,
  ProcessStateType,
} from "./types.js";
import { DEFAULT_IDLE_TIMEOUT_MS } from "./types.js";

type Listener = (event: ProcessEvent) => void;

export class Process {
  readonly id: string;
  readonly sessionId: string;
  readonly projectPath: string;
  readonly projectId: string;
  readonly startedAt: Date;

  private queue: UserMessage[] = [];
  private _state: ProcessState = { type: "running" };
  private listeners: Set<Listener> = new Set();
  private idleTimer: NodeJS.Timeout | null = null;
  private idleTimeoutMs: number;
  private iteratorDone = false;

  constructor(
    private sdkIterator: AsyncIterator<SDKMessage>,
    options: ProcessOptions,
  ) {
    this.id = randomUUID();
    this.sessionId = options.sessionId;
    this.projectPath = options.projectPath;
    this.projectId = options.projectId;
    this.startedAt = new Date();
    this.idleTimeoutMs = options.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS;

    // Start processing messages from the SDK
    this.processMessages();
  }

  get state(): ProcessState {
    return this._state;
  }

  get queueDepth(): number {
    return this.queue.length;
  }

  getInfo(): ProcessInfo {
    let stateType: ProcessStateType;
    if (this._state.type === "waiting-input") {
      stateType = "waiting-input";
    } else if (this._state.type === "idle") {
      stateType = "idle";
    } else {
      stateType = "running";
    }

    return {
      id: this.id,
      sessionId: this.sessionId,
      projectId: this.projectId,
      projectPath: this.projectPath,
      state: stateType,
      startedAt: this.startedAt.toISOString(),
      queueDepth: this.queue.length,
    };
  }

  queueMessage(message: UserMessage): number {
    this.queue.push(message);
    // If idle, this should trigger processing the next message
    if (this._state.type === "idle") {
      this.processNextInQueue();
    }
    return this.queue.length;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async abort(): Promise<void> {
    this.clearIdleTimer();

    // Signal completion to subscribers
    this.emit({ type: "complete" });
    this.listeners.clear();
  }

  private async processMessages(): Promise<void> {
    try {
      while (!this.iteratorDone) {
        const result = await this.sdkIterator.next();

        if (result.done) {
          this.iteratorDone = true;
          // Don't transition to idle if we're waiting for input
          if (this._state.type !== "waiting-input") {
            this.transitionToIdle();
          }
          break;
        }

        const message = result.value;
        this.emit({ type: "message", message });

        // Handle special message types
        if (message.type === "system" && message.subtype === "input_request") {
          this.handleInputRequest(message);
        } else if (message.type === "result") {
          this.transitionToIdle();
        }
      }
    } catch (error) {
      this.emit({ type: "error", error: error as Error });
      // Don't transition to idle if we're waiting for input
      if (this._state.type !== "waiting-input") {
        this.transitionToIdle();
      }
    }
  }

  private handleInputRequest(message: SDKMessage): void {
    if (!message.input_request) return;

    const request: InputRequest = {
      id: message.input_request.id,
      sessionId: this.sessionId,
      type: message.input_request.type as InputRequest["type"],
      prompt: message.input_request.prompt,
      options: message.input_request.options,
      timestamp: new Date().toISOString(),
    };

    this.setState({ type: "waiting-input", request });
  }

  private transitionToIdle(): void {
    this.clearIdleTimer();
    this.setState({ type: "idle", since: new Date() });
    this.startIdleTimer();
    this.processNextInQueue();
  }

  private processNextInQueue(): void {
    if (this.queue.length === 0) return;

    const nextMessage = this.queue.shift();
    if (nextMessage) {
      // In real implementation, this would send the message to the SDK
      // For now, we just transition back to running
      this.setState({ type: "running" });
    }
  }

  private startIdleTimer(): void {
    this.idleTimer = setTimeout(() => {
      // Emit completion - Supervisor will clean up
      this.emit({ type: "complete" });
    }, this.idleTimeoutMs);
  }

  private clearIdleTimer(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }

  private setState(state: ProcessState): void {
    this._state = state;
    this.emit({ type: "state-change", state });
  }

  private emit(event: ProcessEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // Ignore listener errors
      }
    }
  }
}
