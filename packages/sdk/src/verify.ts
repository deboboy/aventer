import { randomUUID } from "node:crypto";
import {
  type AgentEventV2,
  type CorrectnessStatus,
  verifyInputSchema,
  type VerifyInput,
} from "@aventer/schema";
import { getConfig } from "./config.js";
import { buildEvent, postEvent, type EmitOptions } from "./emit.js";

export type VerifyResult = {
  events: AgentEventV2[];
  correctness: CorrectnessStatus;
  verdict: VerifyInput["verdict"];
};

export async function verify(
  input: VerifyInput,
  options: EmitOptions = {}
): Promise<VerifyResult> {
  const parsed = verifyInputSchema.parse(input);
  const cfg = getConfig();
  const run_id = parsed.run_id ?? cfg.runId ?? `run_${randomUUID().replace(/-/g, "")}`;
  const agent_id = parsed.agent_id ?? cfg.agentId ?? "default";
  const eval_id = `eval_${randomUUID().replace(/-/g, "")}`;
  const context = {
    ...(parsed.trace_id ? { trace_id: parsed.trace_id } : {}),
    ...(parsed.span_id ? { span_id: parsed.span_id } : {}),
  };

  const events: AgentEventV2[] = [];
  const started = buildEvent({
    type: "eval.started",
    run_id,
    agent_id,
    context: Object.keys(context).length > 0 ? context : undefined,
    data: {
      eval_id,
      task_id: parsed.task_id,
      evaluator: parsed.evaluator,
      evaluator_type: parsed.evaluator_type,
    },
  });
  events.push(started);
  await postEvent(started, options);

  const completed = buildEvent({
    type: "eval.completed",
    run_id,
    agent_id,
    context: Object.keys(context).length > 0 ? context : undefined,
    data: {
      eval_id,
      task_id: parsed.task_id,
      run_id,
      evaluator: parsed.evaluator,
      evaluator_type: parsed.evaluator_type,
      verdict: parsed.verdict,
      score: parsed.score,
      threshold: parsed.threshold,
      input_hash: parsed.input_hash,
      output_hash: parsed.output_hash,
      evidence: parsed.evidence,
      trace_id: parsed.trace_id,
    },
  });
  events.push(completed);
  await postEvent(completed, options);

  if (parsed.verdict === "inconclusive") {
    return { events, correctness: "pending", verdict: parsed.verdict };
  }

  const verdictType = parsed.verdict === "pass" ? "task.verified" : "task.rejected";
  const correctness: CorrectnessStatus =
    parsed.verdict === "pass" ? "verified" : "failed";

  const verdictEvent = buildEvent({
    type: verdictType,
    run_id,
    agent_id,
    context: Object.keys(context).length > 0 ? context : undefined,
    data: {
      task_id: parsed.task_id,
      correctness,
      correctness_score: parsed.score,
      correctness_source: parsed.evaluator,
      eval_id,
    },
  });
  events.push(verdictEvent);
  await postEvent(verdictEvent, options);

  return { events, correctness, verdict: parsed.verdict };
}

export type { VerifyInput };
