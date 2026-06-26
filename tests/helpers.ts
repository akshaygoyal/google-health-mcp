import { vi } from "vitest";
import type { Env } from "../src/auth.js";

export function makeKv(store: Record<string, string> = {}): KVNamespace {
  const data = { ...store };
  return {
    get: vi.fn(async (key: string) => data[key] ?? null),
    put: vi.fn(async (key: string, value: string) => { data[key] = value; }),
    delete: vi.fn(async (key: string) => { delete data[key]; }),
    list: vi.fn(async () => ({ keys: [], list_complete: true, cursor: "" })),
    getWithMetadata: vi.fn(async (key: string) => ({ value: data[key] ?? null, metadata: null })),
  } as unknown as KVNamespace;
}

export function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    HEALTH_TOKENS: makeKv(),
    MCP_SHARED_SECRET: "test-secret",
    GOOGLE_CLIENT_ID: "test-client-id",
    GOOGLE_CLIENT_SECRET: "test-client-secret",
    ...overrides,
  };
}

export function mockFetchOk(body: unknown): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      json: async () => body,
      text: async () => JSON.stringify(body),
    }))
  );
}

export function mockFetchError(status: number, body: string): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: false,
      status,
      text: async () => body,
    }))
  );
}
