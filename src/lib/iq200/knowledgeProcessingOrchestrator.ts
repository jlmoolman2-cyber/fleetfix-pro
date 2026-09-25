import "server-only";

import { createHash } from "node:crypto";
import { CloudTasksClient } from "@google-cloud/tasks";

export const CLOUD_TASKS_MAX_DELIVERY_ATTEMPTS = 3;
export const PROCESSING_TASK_PATH = "/api/iq200/knowledge/documents/process";

const RESOURCE_ID_PATTERN = /^[a-z][a-z0-9-]{0,62}$/;
const SERVER_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const ENQUEUE_GENERATION_PATTERN = /^[1-9][0-9]{0,18}$/;

export type ProcessingTaskIdentity = { companyId: string; documentId: string; enqueueGeneration: number };
export type ProcessingTaskEnvironment = Readonly<Record<string, string | undefined>>;
export type ProcessingTaskConfig = {
  project: string;
  location: string;
  queue: string;
  targetUrl: string;
  targetOrigin: string;
  workerSecret: string;
};
export type ProcessingTaskRequest = {
  parent: string;
  task: {
    name: string;
    httpRequest: {
      httpMethod: "POST";
      url: string;
      headers: { Authorization: string };
    };
  };
};
export interface ProcessingTaskTransport {
  queuePath(project: string, location: string, queue: string): string;
  createTask(request: ProcessingTaskRequest): Promise<unknown>;
}
export type ProcessingTaskEnqueueResult = { enqueued: boolean; duplicate: boolean };

export class KnowledgeProcessingEnqueueError extends Error {
  readonly code: "CONFIG_MISSING" | "CONFIG_INVALID" | "ENQUEUE_FAILED";

  constructor(code: KnowledgeProcessingEnqueueError["code"]) {
    super("Processing task could not be queued.");
    this.name = "KnowledgeProcessingEnqueueError";
    this.code = code;
  }
}

function requiredEnvironmentValue(environment: ProcessingTaskEnvironment, key: string): string {
  const value = environment[key]?.trim();
  if (!value) throw new KnowledgeProcessingEnqueueError("CONFIG_MISSING");
  return value;
}

export function readProcessingTaskConfig(environment: ProcessingTaskEnvironment = process.env): ProcessingTaskConfig {
  const config = {
    project: requiredEnvironmentValue(environment, "IQ200_CLOUD_TASKS_PROJECT"),
    location: requiredEnvironmentValue(environment, "IQ200_CLOUD_TASKS_LOCATION"),
    queue: requiredEnvironmentValue(environment, "IQ200_CLOUD_TASKS_QUEUE"),
    targetUrl: requiredEnvironmentValue(environment, "IQ200_PROCESSING_TARGET_URL"),
    targetOrigin: requiredEnvironmentValue(environment, "IQ200_PROCESSING_TARGET_ORIGIN"),
    workerSecret: requiredEnvironmentValue(environment, "IQ200_PROCESSING_WORKER_SECRET"),
  };
  if (!RESOURCE_ID_PATTERN.test(config.project) || !RESOURCE_ID_PATTERN.test(config.location) || !RESOURCE_ID_PATTERN.test(config.queue)) {
    throw new KnowledgeProcessingEnqueueError("CONFIG_INVALID");
  }
  let target: URL;
  let expectedOrigin: URL;
  try {
    target = new URL(config.targetUrl);
    expectedOrigin = new URL(config.targetOrigin);
  } catch {
    throw new KnowledgeProcessingEnqueueError("CONFIG_INVALID");
  }
  if (
    expectedOrigin.protocol !== "https:" ||
    expectedOrigin.username ||
    expectedOrigin.password ||
    expectedOrigin.pathname !== "/" ||
    expectedOrigin.search ||
    expectedOrigin.hash ||
    expectedOrigin.origin !== config.targetOrigin ||
    target.protocol !== "https:" ||
    target.origin !== expectedOrigin.origin ||
    target.username ||
    target.password ||
    target.search ||
    target.hash ||
    target.pathname !== PROCESSING_TASK_PATH
  ) {
    throw new KnowledgeProcessingEnqueueError("CONFIG_INVALID");
  }
  return { ...config, targetUrl: target.toString(), targetOrigin: expectedOrigin.origin };
}

export function deterministicProcessingTaskId(identity: ProcessingTaskIdentity): string {
  if (
    !SERVER_ID_PATTERN.test(identity.companyId) ||
    !SERVER_ID_PATTERN.test(identity.documentId) ||
    !Number.isSafeInteger(identity.enqueueGeneration) ||
    !ENQUEUE_GENERATION_PATTERN.test(String(identity.enqueueGeneration))
  ) {
    throw new KnowledgeProcessingEnqueueError("CONFIG_INVALID");
  }
  const digest = createHash("sha256").update(`${identity.companyId}:${identity.documentId}:${identity.enqueueGeneration}`, "utf8").digest("hex").slice(0, 32);
  return `iq200-process-${digest}`;
}

function buildProcessingTaskRequest(
  transport: Pick<ProcessingTaskTransport, "queuePath">,
  config: ProcessingTaskConfig,
  identity: ProcessingTaskIdentity,
): ProcessingTaskRequest {
  const parent = transport.queuePath(config.project, config.location, config.queue);
  return {
    parent,
    task: {
      name: `${parent}/tasks/${deterministicProcessingTaskId(identity)}`,
      httpRequest: {
        httpMethod: "POST",
        url: config.targetUrl,
        headers: { Authorization: `Bearer ${config.workerSecret}` },
      },
    },
  };
}

function isAlreadyExists(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: unknown }).code;
  return code === 6 || code === "ALREADY_EXISTS";
}

let defaultTransport: ProcessingTaskTransport | undefined;
function cloudTasksTransport(): ProcessingTaskTransport {
  if (!defaultTransport) defaultTransport = new CloudTasksClient() as ProcessingTaskTransport;
  return defaultTransport;
}

export async function enqueueKnowledgeProcessingTask(
  identity: ProcessingTaskIdentity,
  options: { environment?: ProcessingTaskEnvironment; transport?: ProcessingTaskTransport } = {},
): Promise<ProcessingTaskEnqueueResult> {
  const config = readProcessingTaskConfig(options.environment);
  const transport = options.transport || cloudTasksTransport();
  const request = buildProcessingTaskRequest(transport, config, identity);
  try {
    await transport.createTask(request);
    return { enqueued: true, duplicate: false };
  } catch (error) {
    if (isAlreadyExists(error)) return { enqueued: false, duplicate: true };
    throw new KnowledgeProcessingEnqueueError("ENQUEUE_FAILED");
  }
}

export function processingEnqueueDiagnostic(error: unknown): { event: "iq200_processing_enqueue_failed"; code: string } {
  return {
    event: "iq200_processing_enqueue_failed",
    code: error instanceof KnowledgeProcessingEnqueueError ? error.code : "UNEXPECTED",
  };
}
