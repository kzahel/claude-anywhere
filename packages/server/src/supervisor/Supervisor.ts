import { randomUUID } from "node:crypto";
import type { ClaudeSDK, UserMessage } from "../sdk/types.js";
import { Process } from "./Process.js";
import type { ProcessInfo, ProcessOptions } from "./types.js";
import { encodeProjectId } from "./types.js";

export interface SupervisorOptions {
  sdk: ClaudeSDK;
  idleTimeoutMs?: number;
}

export class Supervisor {
  private processes: Map<string, Process> = new Map();
  private sessionToProcess: Map<string, string> = new Map(); // sessionId -> processId
  private sdk: ClaudeSDK;
  private idleTimeoutMs?: number;

  constructor(options: SupervisorOptions) {
    this.sdk = options.sdk;
    this.idleTimeoutMs = options.idleTimeoutMs;
  }

  async startSession(
    projectPath: string,
    message: UserMessage,
  ): Promise<Process> {
    const projectId = encodeProjectId(projectPath);

    // Start new SDK session
    const iterator = this.sdk.startSession({ cwd: projectPath });

    // Create process with a temporary session ID (will be updated from SDK)
    const sessionId = randomUUID(); // Temporary - real SDK provides this

    const options: ProcessOptions = {
      projectPath,
      projectId,
      sessionId,
      idleTimeoutMs: this.idleTimeoutMs,
    };

    const process = new Process(iterator, options);

    this.registerProcess(process);

    // Queue the initial message
    process.queueMessage(message);

    return process;
  }

  async resumeSession(
    sessionId: string,
    projectPath: string,
    message: UserMessage,
  ): Promise<Process> {
    // Check if already have a process for this session
    const existingProcessId = this.sessionToProcess.get(sessionId);
    if (existingProcessId) {
      const existingProcess = this.processes.get(existingProcessId);
      if (existingProcess) {
        // Queue message to existing process
        existingProcess.queueMessage(message);
        return existingProcess;
      }
    }

    const projectId = encodeProjectId(projectPath);

    // Resume SDK session
    const iterator = this.sdk.startSession({
      cwd: projectPath,
      resume: sessionId,
    });

    const options: ProcessOptions = {
      projectPath,
      projectId,
      sessionId,
      idleTimeoutMs: this.idleTimeoutMs,
    };

    const process = new Process(iterator, options);

    this.registerProcess(process);
    process.queueMessage(message);

    return process;
  }

  getProcess(processId: string): Process | undefined {
    return this.processes.get(processId);
  }

  getProcessForSession(sessionId: string): Process | undefined {
    const processId = this.sessionToProcess.get(sessionId);
    if (!processId) return undefined;
    return this.processes.get(processId);
  }

  getAllProcesses(): Process[] {
    return Array.from(this.processes.values());
  }

  getProcessInfoList(): ProcessInfo[] {
    return this.getAllProcesses().map((p) => p.getInfo());
  }

  async abortProcess(processId: string): Promise<boolean> {
    const process = this.processes.get(processId);
    if (!process) return false;

    await process.abort();
    this.unregisterProcess(process);
    return true;
  }

  private registerProcess(process: Process): void {
    this.processes.set(process.id, process);
    this.sessionToProcess.set(process.sessionId, process.id);

    // Listen for completion to auto-cleanup
    process.subscribe((event) => {
      if (event.type === "complete") {
        this.unregisterProcess(process);
      }
    });
  }

  private unregisterProcess(process: Process): void {
    this.processes.delete(process.id);
    this.sessionToProcess.delete(process.sessionId);
  }
}
