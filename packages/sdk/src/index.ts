export { configure, getConfig, resetConfig, DEFAULT_API_URL } from "./config.js";
export type { AventerConfig } from "./config.js";
export { emit, buildEvent } from "./emit.js";
export type { EmitOptions, EmitResult } from "./emit.js";

export type {
  AgentEventContext,
  AgentEventType,
  AgentEventV1,
  EmitInput,
} from "@aventer/schema";
