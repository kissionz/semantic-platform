import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./api";

afterEach(() => vi.unstubAllGlobals());

describe("api request headers", () => {
  it("does not declare JSON content for a bodyless mutation", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ published: {} }), { status: 200 })));

    await api.publish();

    const [, options] = vi.mocked(fetch).mock.calls[0];
    const headers = new Headers(options?.headers);
    expect(options?.body).toBeUndefined();
    expect(headers.has("Content-Type")).toBe(false);
  });

  it("declares JSON content when a request contains a JSON body", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ found: false }), { status: 200 })));

    await api.findTable("fact_sales");

    const [, options] = vi.mocked(fetch).mock.calls[0];
    expect(new Headers(options?.headers).get("Content-Type")).toBe("application/json");
    expect(options?.body).toBe(JSON.stringify({ tableName: "fact_sales" }));
  });
});
