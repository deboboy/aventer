import { createHmac, timingSafeEqual } from "node:crypto";

/** Retry delays after each failed attempt (attempt 1 = immediate). */
export const RETRY_DELAYS_MS = [0, 5_000, 15_000, 60_000, 300_000, 900_000] as const;

export const MAX_DELIVERY_ATTEMPTS = RETRY_DELAYS_MS.length;

export function nextRetryDelayMs(attemptCount: number): number | null {
  if (attemptCount >= MAX_DELIVERY_ATTEMPTS) return null;
  return RETRY_DELAYS_MS[attemptCount] ?? null;
}

export function validateSubscriberUrl(urlString: string): string {
  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    throw new Error("invalid_url");
  }

  if (url.protocol !== "https:") {
    throw new Error("https_required");
  }

  const host = url.hostname.toLowerCase();
  const blocked =
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "0.0.0.0" ||
    host === "::1" ||
    host.endsWith(".local") ||
    host === "metadata.google.internal" ||
    /^(10\.|192\.168\.|169\.254\.)/.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host);

  if (blocked) {
    throw new Error("private_url_blocked");
  }

  return url.toString();
}

export function signWebhookPayload(
  secret: string,
  body: string,
  timestamp: number
): string {
  return createHmac("sha256", secret)
    .update(`${timestamp}.${body}`)
    .digest("hex");
}

export function buildSignatureHeader(secret: string, body: string, timestamp: number): string {
  return `v1=${signWebhookPayload(secret, body, timestamp)}`;
}

export function verifyWebhookSignature(
  secret: string,
  body: string,
  timestamp: number,
  signatureHeader: string,
  toleranceSeconds = 300
): boolean {
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > toleranceSeconds) return false;

  const expected = `v1=${signWebhookPayload(secret, body, timestamp)}`;
  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function webhookHeaders(
  secret: string,
  body: string,
  eventId: string
): Record<string, string> {
  const timestamp = Math.floor(Date.now() / 1000);
  return {
    "Content-Type": "application/json",
    "X-Aventer-Timestamp": String(timestamp),
    "X-Aventer-Signature": buildSignatureHeader(secret, body, timestamp),
    "X-Aventer-Event-Id": eventId,
    "User-Agent": "Aventer-Webhook/0.1",
  };
}
