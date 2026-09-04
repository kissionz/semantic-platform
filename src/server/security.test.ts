import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SecretBox, hashPassword, sessionDigest, verifyPassword } from "./security.js";
import { Store } from "./store.js";

const roots: string[] = [];
const temporaryRoot = () => {
  const root = mkdtempSync(path.join(tmpdir(), "semantic-platform-test-"));
  roots.push(root);
  return root;
};

afterEach(() => {
  delete process.env.SEMANTIC_ADMIN_PASSWORD;
  delete process.env.SEMANTIC_CREDENTIAL_KEY;
  while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe("platform security", () => {
  it("hashes passwords and session tokens", () => {
    const passwordHash = hashPassword("a-long-production-password");
    expect(passwordHash).not.toContain("a-long-production-password");
    expect(verifyPassword("a-long-production-password", passwordHash)).toBe(true);
    expect(verifyPassword("different-password", passwordHash)).toBe(false);
    expect(sessionDigest("session-token")).not.toContain("session-token");
  });

  it("encrypts and authenticates stored credentials", () => {
    const secretBox = new SecretBox(temporaryRoot());
    const envelope = secretBox.encrypt({ accessId: "id", accessKey: "private-value" });
    expect(envelope).not.toContain("private-value");
    expect(secretBox.decrypt(envelope)).toEqual({ accessId: "id", accessKey: "private-value" });
  });

  it("creates an authenticated admin session in a fresh store", () => {
    const store = new Store(temporaryRoot());
    const password = store.initialPassword!;
    const principal = store.authenticate("admin", password);
    expect(principal?.role).toBe("ADMIN");
    const token = store.createSession(principal!.id);
    expect(store.principal(token)?.username).toBe("admin");
    store.revokeSession(token);
    expect(store.principal(token)).toBeNull();
    store.close();
  });

  it("keeps configured bootstrap passwords out of the startup handoff", () => {
    process.env.SEMANTIC_ADMIN_PASSWORD = "configured-password-123";
    const store = new Store(temporaryRoot());
    expect(store.initialPassword).toBeUndefined();
    expect(store.authenticate("admin", "configured-password-123")?.role).toBe("ADMIN");
    store.close();
  });
});
