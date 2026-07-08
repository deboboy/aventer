import { z } from "zod";
import { AGENT_V1_SPEC, BETA_EVENT_TYPES } from "./types.js";

export const agentEventContextSchema = z.object({
  parent_id: z.string().optional(),
  step: z.number().int().nonnegative().optional(),
  framework: z.string().optional(),
});

export const agentEventV1Schema = z.object({
  spec_version: z.literal(AGENT_V1_SPEC),
  id: z.string().regex(/^evt_[a-zA-Z0-9_-]+$/),
  type: z.enum(BETA_EVENT_TYPES),
  timestamp: z.string().datetime(),
  run_id: z.string().min(1),
  agent_id: z.string().min(1),
  org_id: z.string().min(1),
  data: z.record(z.unknown()),
  context: agentEventContextSchema.optional(),
});

export const emitInputSchema = z.object({
  type: z.enum(BETA_EVENT_TYPES),
  data: z.record(z.unknown()),
  run_id: z.string().min(1).optional(),
  agent_id: z.string().min(1).optional(),
  context: agentEventContextSchema.optional(),
});
