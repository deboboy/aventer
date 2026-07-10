import { AGENT_V1_SPEC, AGENT_V2_SPEC, type AgentSpecVersion } from "@aventer/schema";

export const DEFAULT_API_URL = "https://api.aventer.dev";

export type AventerConfig = {
  apiKey?: string;
  apiUrl?: string;
  agentId?: string;
  orgId?: string;
  runId?: string;
  /** Default spec for new events. Defaults to agent-v2. */
  specVersion?: AgentSpecVersion;
};

let config: AventerConfig = {};

export function configure(options: AventerConfig): void {
  config = { ...config, ...options };
}

export function getConfig(): Readonly<AventerConfig> {
  return config;
}

export function getSpecVersion(): AgentSpecVersion {
  return config.specVersion ?? AGENT_V2_SPEC;
}

export function resetConfig(): void {
  config = {};
}

export { AGENT_V1_SPEC, AGENT_V2_SPEC };
