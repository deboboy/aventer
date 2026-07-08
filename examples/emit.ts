import { configure, emit } from "@aventer/sdk";

async function main() {
  configure({
    apiKey: process.env.AVENTER_API_KEY ?? "avn_beta_dev_key_change_me",
    apiUrl: process.env.AVENTER_API_URL ?? "http://localhost:3001",
    agentId: "example-agent",
    orgId: "example-org",
  });

  const taskId = `task_${Date.now()}`;

  console.log("Emitting task.started…");
  await emit("task.started", { task_id: taskId });

  await new Promise((r) => setTimeout(r, 500));

  console.log("Emitting task.completed…");
  const result = await emit("task.completed", {
    task_id: taskId,
    tokens: 4200,
  });

  console.log("Done:", result.event.id);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
