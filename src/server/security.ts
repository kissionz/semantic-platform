import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const digest = scryptSync(password, salt, 32);
  return `scrypt:${salt.toString("base64")}:${digest.toString("base64")}`;
}

export function verifyPassword(password: string, encoded: string): boolean {
  const [algorithm, saltText, digestText] = encoded.split(":");
  if (algorithm !== "scrypt" || !saltText || !digestText) return false;
  const expected = Buffer.from(digestText, "base64");
  const actual = scryptSync(password, Buffer.from(saltText, "base64"), expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function sessionDigest(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export class SecretBox {
  private readonly key: Buffer;

  constructor(stateRoot: string) {
    const configured = process.env.SEMANTIC_CREDENTIAL_KEY;
    if (configured) {
      const key = Buffer.from(configured, "base64");
      if (key.length !== 32) throw new Error("SEMANTIC_CREDENTIAL_KEY 必须是 32 字节 Base64 密钥");
      this.key = key;
      return;
    }
    const keyPath = path.join(stateRoot, "credential.key");
    fs.mkdirSync(stateRoot, { recursive: true, mode: 0o700 });
    if (!fs.existsSync(keyPath)) {
      fs.writeFileSync(keyPath, randomBytes(32), { mode: 0o600 });
    }
    this.key = fs.readFileSync(keyPath);
    if (this.key.length !== 32) throw new Error("本地凭据密钥损坏");
  }

  encrypt(value: unknown): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
    return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), ciphertext.toString("base64")].join(":");
  }

  decrypt<T>(envelope: string): T {
    const [version, ivText, tagText, valueText] = envelope.split(":");
    if (version !== "v1" || !ivText || !tagText || !valueText) throw new Error("凭据格式无效");
    const decipher = createDecipheriv("aes-256-gcm", this.key, Buffer.from(ivText, "base64"));
    decipher.setAuthTag(Buffer.from(tagText, "base64"));
    return JSON.parse(Buffer.concat([decipher.update(Buffer.from(valueText, "base64")), decipher.final()]).toString("utf8")) as T;
  }
}
