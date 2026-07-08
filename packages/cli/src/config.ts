import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export const CONFIG_DIR = join(process.cwd(), ".aventer");
export const CONFIG_FILE = join(CONFIG_DIR, "config.json");
export const CREDENTIALS_FILE = join(homedir(), ".aventer", "credentials.json");

export type ProjectConfig = {
  projectId: string;
  agentId: string;
  apiUrl: string;
};

export type Credentials = {
  apiKey: string;
  email?: string;
};

export async function loadProjectConfig(): Promise<ProjectConfig | null> {
  try {
    const raw = await readFile(CONFIG_FILE, "utf8");
    return JSON.parse(raw) as ProjectConfig;
  } catch {
    return null;
  }
}

export async function saveProjectConfig(config: ProjectConfig): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true });
  await writeFile(CONFIG_FILE, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

export async function loadCredentials(): Promise<Credentials | null> {
  try {
    const raw = await readFile(CREDENTIALS_FILE, "utf8");
    return JSON.parse(raw) as Credentials;
  } catch {
    return null;
  }
}

export async function saveCredentials(credentials: Credentials): Promise<void> {
  const dir = join(homedir(), ".aventer");
  await mkdir(dir, { recursive: true });
  await writeFile(CREDENTIALS_FILE, `${JSON.stringify(credentials, null, 2)}\n`, "utf8");
}
