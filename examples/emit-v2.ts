import { configure, emit, verify } from "@aventer/sdk";

async function main() {
  configure({
    apiKey:
      process.env.AVENTER_API_KEY ??
      process.env.AVENTER_BETA_API_KEY ??
      "avn_beta_dev_key_change_me",
    apiUrl: process.env.AVENTER_API_URL ?? "http://localhost:3001",
    agentId: "example-agent",
    orgId: "example-org",
  });

  const runId = `run_${Date.now()}`;
  const taskId = `task_${Date.now()}`;
  const emitOpts = { run_id: runId };

  console.log("Emitting task.started (agent-v2)…");
  await emit("task.started", { task_id: taskId }, emitOpts);

  await new Promise((r) => setTimeout(r, 500));

  console.log("Emitting task.completed…");
  await emit(
    "task.completed",
    {
      task_id: taskId,
      summary: "Example agent run",
      duration_ms: 4200,
      tokens: { input: 3000, output: 1200, total: 4200 },
      cost_usd: 0.042,
      correctness: "unknown",
    },
    emitOpts
  );

  console.log("Running verify() — golden-set pass…");
  const verified = await verify({
    task_id: taskId,
    run_id: runId,
    evaluator: "golden-set-example",
    evaluator_type: "golden_set",
    score: 0.95,
    threshold: 0.8,
    verdict: "pass",
    evidence: { matched_cases: 19, total_cases: 20 },
  });

  console.log("Done:", {
    run_id: runId,
    correctness: verified.correctness,
    eval_events: verified.events.length,
  });
  console.log(`Fetch run summary: GET /v1/runs/${runId}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
