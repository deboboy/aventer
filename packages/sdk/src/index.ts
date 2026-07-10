export {
  configure,
  getConfig,
  getSpecVersion,
  resetConfig,
  DEFAULT_API_URL,
  AGENT_V1_SPEC,
  AGENT_V2_SPEC,
} from "./config.js";
export type { AventerConfig } from "./config.js";
export { emit, buildEvent, postEvent } from "./emit.js";
export type { EmitOptions, EmitResult } from "./emit.js";
export { verify } from "./verify.js";
export type { VerifyResult } from "./verify.js";

export type {
  AgentEvent,
  AgentEventContext,
  AgentEventContextV2,
  AgentEventType,
  AgentEventTypeV2,
  AgentEventV1,
  AgentEventV2,
  CorrectnessStatus,
  EmitInput,
  EvaluatorType,
  EvalVerdict,
  VerifyInput,
} from "@aventer/schema";
