import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

export type Envelope = { iv: string; data: string };
// Direction and request ID bind replies to requests; AES-GCM authenticates both
// the server identity and payload, including on an offline HTTP LAN connection.
export function seal(key: string, aad: string, value: unknown): Envelope {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(key, "base64"), iv);
  cipher.setAAD(Buffer.from(aad));
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(value)),
    cipher.final(),
    cipher.getAuthTag(),
  ]);
  return { iv: iv.toString("base64"), data: encrypted.toString("base64") };
}
export function unseal(key: string, aad: string, envelope: Envelope): unknown {
  const iv = Buffer.from(envelope.iv, "base64"),
    data = Buffer.from(envelope.data, "base64");
  if (iv.length !== 12 || data.length < 16) throw new Error("Invalid envelope");
  const cipher = createDecipheriv(
    "aes-256-gcm",
    Buffer.from(key, "base64"),
    iv,
  );
  cipher.setAAD(Buffer.from(aad));
  cipher.setAuthTag(data.subarray(-16));
  return JSON.parse(
    Buffer.concat([
      cipher.update(data.subarray(0, -16)),
      cipher.final(),
    ]).toString("utf8"),
  );
}
