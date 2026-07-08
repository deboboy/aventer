export const DEFAULT_API_URL = "https://api.aventer.dev";

export type AventerConfig = {
  apiKey?: string;
  apiUrl?: string;
  agentId?: string;
  orgId?: string;
  runId?: string;
};

let config: AventerConfig = {};

export function configure(options: AventerConfig): void {
  config = { ...config, ...options };
}

export function getConfig(): Readonly<AventerConfig> {
  return config;
}

export function resetConfig(): void {
  config = {};
}
