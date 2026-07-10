import { z } from "zod";
import {
  AGENT_V1_SPEC,
  AGENT_V2_SPEC,
  V1_EVENT_TYPES,
  V2_EVENT_TYPES,
} from "./types.js";

export const agentEventContextSchema = z.object({
  parent_id: z.string().optional(),
  step: z.number().int().nonnegative().optional(),
  framework: z.string().optional(),
});

export const agentEventContextV2Schema = agentEventContextSchema.extend({
  trace_id: z.string().optional(),
  span_id: z.string().optional(),
  environment: z.string().optional(),
});

const eventIdSchema = z.string().regex(/^evt_[a-zA-Z0-9_-]+$/);
const eventTimestampSchema = z.string().datetime();
const runIdSchema = z.string().min(1);
const agentIdSchema = z.string().min(1);
const orgIdSchema = z.string().min(1);
const dataSchema = z.record(z.unknown());

export const agentEventV1Schema = z.object({
  spec_version: z.literal(AGENT_V1_SPEC),
  id: eventIdSchema,
  type: z.enum(V1_EVENT_TYPES),
  timestamp: eventTimestampSchema,
  run_id: runIdSchema,
  agent_id: agentIdSchema,
  org_id: orgIdSchema,
  data: dataSchema,
  context: agentEventContextSchema.optional(),
});

export const agentEventV2Schema = z.object({
  spec_version: z.literal(AGENT_V2_SPEC),
  id: eventIdSchema,
  type: z.enum(V2_EVENT_TYPES),
  timestamp: eventTimestampSchema,
  run_id: runIdSchema,
  agent_id: agentIdSchema,
  org_id: orgIdSchema,
  data: dataSchema,
  context: agentEventContextV2Schema.optional(),
});

export const agentEventSchema = z.discriminatedUnion("spec_version", [
  agentEventV1Schema,
  agentEventV2Schema,
]);

export const emitInputSchema = z.object({
  type: z.enum(V2_EVENT_TYPES),
  data: dataSchema,
  run_id: runIdSchema.optional(),
  agent_id: agentIdSchema.optional(),
  context: agentEventContextV2Schema.optional(),
});

export const verifyInputSchema = z.object({
  task_id: z.string().min(1),
  run_id: runIdSchema.optional(),
  agent_id: agentIdSchema.optional(),
  evaluator: z.string().min(1),
  evaluator_type: z.enum(["golden_set", "llm_judge", "human", "rule", "custom"]),
  score: z.number().min(0).max(1),
  threshold: z.number().min(0).max(1).optional(),
  verdict: z.enum(["pass", "fail", "inconclusive"]),
  evidence: dataSchema.optional(),
  input_hash: z.string().optional(),
  output_hash: z.string().optional(),
  trace_id: z.string().optional(),
  span_id: z.string().optional(),
});
