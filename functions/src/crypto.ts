import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { ENCRYPTION_KEY } from "./config";

function key(): Buffer {
  const k = Buffer.from(ENCRYPTION_KEY.value(), "base64");
  if (k.length !== 32) throw new Error("ENCRYPTION_KEY 必須是 32 bytes 的 base64");
  return k;
}

/** AES-256-GCM；格式 v1:iv:tag:ciphertext（皆 base64） */
export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), enc.toString("base64")].join(":");
}

export function decrypt(payload: string): string {
  const [version, iv, tag, enc] = payload.split(":");
  if (version !== "v1") throw new Error(`未知的加密版本 ${version}`);
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(enc, "base64")), decipher.final()]).toString("utf8");
}
