import { createHash, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { mutate, readData } from "./db";

const COOKIE = "9t_session";
const MAX_PASSWORD_BYTES = 128;
function assertPasswordSize(password: string) {
  if (typeof password !== "string" || !password.length)
    throw new Error("Invalid password.");
  // Prevent scrypt CPU DoS on unbounded input.
  if (Buffer.byteLength(password, "utf8") > MAX_PASSWORD_BYTES * 4)
    throw new Error("Password too long.");
  if (password.length > MAX_PASSWORD_BYTES)
    throw new Error("Password too long.");
}
export function passwordHash(password: string, salt: string) {
  assertPasswordSize(password);
  return scryptSync(password, salt, 64).toString("hex");
}
export function makePassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return { salt, passwordHash: passwordHash(password, salt) };
}
export function verifyPassword(
  password: string,
  salt: string,
  expected: string,
) {
  const a = Buffer.from(passwordHash(password, salt), "hex"),
    b = Buffer.from(expected, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
export async function createSession() {
  const token = randomBytes(32).toString("base64url"),
    key = createHash("sha256").update(token).digest("hex"),
    expires = new Date(Date.now() + 7 * 864e5);
  await mutate((d) => {
    d.sessions[key] = { expiresAt: expires.toISOString() };
  });
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NINE_T_HTTPS === "true",
    path: "/",
    expires,
  });
}
export async function authenticated(req?: Request) {
  const bearer = req?.headers
    .get("authorization")
    ?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (bearer) {
    const hash = createHash("sha256").update(bearer).digest("hex"),
      data = await readData(),
      entry = Object.values(data.apiTokens || {}).find((t) => t.hash === hash);
    if (!entry) return false;
    void mutate((d) => {
      const token = Object.values(d.apiTokens || {}).find(
        (t) => t.hash === hash,
      );
      if (token) token.lastUsedAt = new Date().toISOString();
    });
    return true;
  }
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return false;
  const key = createHash("sha256").update(token).digest("hex"),
    data = await readData(),
    session = data.sessions[key];
  return (
    !!session &&
    new Date(session.expiresAt) > new Date() &&
    (!session.deviceId || !!data.devices?.[session.deviceId])
  );
}
export async function destroySession() {
  const jar = await cookies(),
    token = jar.get(COOKIE)?.value;
  if (token) {
    const key = createHash("sha256").update(token).digest("hex");
    await mutate((d) => {
      delete d.sessions[key];
    });
  }
  jar.delete(COOKIE);
}
export function unauthorized() {
  return Response.json({ error: "unauthorized" }, { status: 401 });
}
