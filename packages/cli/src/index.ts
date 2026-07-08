#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { Command } from "commander";
import {
  loadCredentials,
  loadProjectConfig,
  saveCredentials,
  saveProjectConfig,
} from "./config.js";

const program = new Command();

program
  .name("aventer")
  .description("CLI for Aventer — event layer for production AI agents")
  .version("0.0.1");

program
  .command("init")
  .description("Initialize Aventer in the current project")
  .option("--agent-id <id>", "Default agent ID", "default")
  .option("--api-url <url>", "API base URL", "http://localhost:3001")
  .action(async (options: { agentId: string; apiUrl: string }) => {
    const projectId = `proj_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
    await saveProjectConfig({
      projectId,
      agentId: options.agentId,
      apiUrl: options.apiUrl,
    });
    console.log(`Created .aventer/config.json (project: ${projectId})`);
    console.log("Next: run `aventer login` to authenticate.");
  });

program
  .command("login")
  .description("Save API credentials locally")
  .requiredOption("--api-key <key>", "Aventer API key")
  .option("--email <email>", "Account email for reference")
  .action(async (options: { apiKey: string; email?: string }) => {
    await saveCredentials({ apiKey: options.apiKey, email: options.email });
    console.log("Credentials saved to ~/.aventer/credentials.json");
  });

program
  .command("listen")
  .description("Receive webhook events locally (Phase 1 stub — prints to stdout)")
  .argument("[port]", "Local port", "3000")
  .action(async (port: string) => {
    const project = await loadProjectConfig();
    const credentials = await loadCredentials();

    if (!credentials?.apiKey) {
      console.error("No credentials found. Run `aventer login --api-key <key>` first.");
      process.exit(1);
    }

    const server = createServer(async (req, res) => {
      if (req.method !== "POST") {
        res.writeHead(405).end();
        return;
      }

      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(chunk as Buffer);
      }
      const body = Buffer.concat(chunks).toString("utf8");

      console.log("\n--- Aventer event received ---");
      console.log("Headers:", JSON.stringify(req.headers, null, 2));
      try {
        console.log("Body:", JSON.stringify(JSON.parse(body), null, 2));
      } catch {
        console.log("Body:", body);
      }
      console.log("------------------------------\n");

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ received: true }));
    });

    server.listen(Number(port), () => {
      console.log(`Listening on http://localhost:${port}`);
      if (project) {
        console.log(`Project: ${project.projectId} (agent: ${project.agentId})`);
      }
      console.log("Tunnel delivery wiring comes in Phase 2.");
    });
  });

program
  .command("status")
  .description("Show local Aventer configuration")
  .action(async () => {
    const project = await loadProjectConfig();
    const credentials = await loadCredentials();

    if (!project && !credentials) {
      console.log("Not configured. Run `aventer init` then `aventer login`.");
      return;
    }

    if (project) {
      console.log("Project:", project.projectId);
      console.log("Agent ID:", project.agentId);
      console.log("API URL:", project.apiUrl);
    }
    if (credentials) {
      console.log("API key:", `${credentials.apiKey.slice(0, 8)}...`);
      if (credentials.email) console.log("Email:", credentials.email);
    }
  });

program.parse();
