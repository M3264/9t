import { randomInt, randomUUID } from "crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "fs/promises";
import path from "path";

export type ObjectType = "snippet" | "file" | "link";
export type NineTObject = {
  id: string;
  type: ObjectType;
  name: string;
  content?: string;
  language?: string;
  url?: string;
  mimeType?: string;
  sizeBytes?: number;
  storageKey?: string;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  expiresAt?: string;
  board?: { x: number; y: number };
};
export type AppConfig = {
  initialized: boolean;
  modules: {
    snippets: boolean;
    files: boolean;
    links: boolean;
    board: boolean;
  };
  exposure: "lan" | "public" | "hybrid";
  domain: string | null;
  theme: "system" | "light" | "dark";
  maxSizeMb: number;
  trashRetentionDays: number;
};
export type Share = {
  id: string;
  token: string;
  objectId: string;
  createdAt: string;
  expiresAt?: string;
  accessCount: number;
  passwordHash?: string;
  passwordSalt?: string;
};
export type ApiToken = {
  name: string;
  hash: string;
  createdAt: string;
  lastUsedAt?: string;
};
export type PairRequest = {
  name: string;
  /** 5-digit session number shown on both phone and web for verification. */
  sessionNumber: string;
  /** SHA-256 hex of the phone's claim token (the token itself is never stored). */
  clientTokenHash: string;
  createdAt: string;
  expiresAt: string;
  status: "pending" | "approved" | "denied";
  device?: { id: string; key: string; instanceId: string; createdAt: string };
};
export type Data = {
  instanceId?: string;
  devices?: Record<
    string,
    { name: string; key: string; createdAt: string; lastSeenAt?: string }
  >;
  pairRequests?: Record<string, PairRequest>;
  config: AppConfig;
  user?: { username: string; passwordHash: string; salt: string };
  sessions: Record<string, { expiresAt: string; deviceId?: string }>;
  apiTokens?: Record<string, ApiToken>;
  objects: NineTObject[];
  shares: Record<string, Share>;
};

const root = process.env.NINE_T_DATA_DIR
  ? path.resolve(process.env.NINE_T_DATA_DIR)
  : path.join(process.cwd(), "data");
const dbPath = path.join(root, "9t.json");
export const uploadDir = path.join(root, "objects");
const initial: Data = {
  config: {
    initialized: false,
    modules: { snippets: true, files: true, links: true, board: false },
    exposure: "public",
    domain: null,
    theme: "system",
    maxSizeMb: 500,
    trashRetentionDays: 7,
  },
  sessions: {},
  apiTokens: {},
  objects: [],
  shares: {},
};
let queue = Promise.resolve();

async function ensure() {
  await mkdir(uploadDir, { recursive: true });
  try {
    await readFile(dbPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    await writeFile(dbPath, JSON.stringify(initial, null, 2), { mode: 0o600 });
  }
}
export async function readData(): Promise<Data> {
  await ensure();
  return JSON.parse(await readFile(dbPath, "utf8"));
}
export async function mutate<T>(
  fn: (data: Data) => T | Promise<T>,
): Promise<T> {
  let result!: T;
  const operation = queue.then(async () => {
    const data = await readData();
    result = await fn(data);
    const tmp = `${dbPath}.${randomUUID()}.tmp`;
    await writeFile(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
    await rename(tmp, dbPath);
  });
  // Keep each caller's error, but let subsequent operations run.
  queue = operation.then(
    () => {},
    () => {},
  );
  await operation;
  return result;
}
// Short memorable IDs for user-visible objects (e.g. "kxqt"). Unambiguous
// lowercase letters only — no i/l/o. Callers must pass existing IDs so the
// result is unique; retries until it is.
const SHORT_ID_CHARS = "abcdefghjkmnpqrstuvwxyz";
export function shortId(taken: Set<string>): string {
  for (;;) {
    let id = "";
    for (let i = 0; i < 4; i++) id += SHORT_ID_CHARS[randomInt(SHORT_ID_CHARS.length)];
    if (!taken.has(id)) return id;
  }
}
export async function addObject(
  input: Omit<NineTObject, "id" | "createdAt" | "updatedAt" | "pinned">,
) {
  const now = new Date().toISOString();
  return mutate((d) => {
    const obj: NineTObject = {
      ...input,
      id: shortId(new Set(d.objects.map((o) => o.id))),
      pinned: false,
      createdAt: now,
      updatedAt: now,
    };
    d.objects.unshift(obj);
    return obj;
  });
}
export async function purgeObject(id: string) {
  await mutate(async (d) => {
    const obj = d.objects.find((x) => x.id === id);
    // Dynamic import keeps store.ts dependency-free (see tests/store.test.mjs,
    // which loads this module standalone). Falls back to local unlink if the
    // blob store cannot load.
    if (obj?.storageKey && /^[0-9a-f-]{36}$/i.test(obj.storageKey)) {
      try {
        const { delBlob } = await import("./storage");
        await delBlob(obj.storageKey).catch(() => {});
      } catch {
        await unlink(path.join(uploadDir, path.basename(obj.storageKey))).catch(
          () => {},
        );
      }
    }
    d.objects = d.objects.filter((x) => x.id !== id);
  });
}
export async function sweepExpired() {
  const now = Date.now(),
    d = await readData();
  const expired = d.objects
    .filter(
      (o) =>
        (o.expiresAt && Date.parse(o.expiresAt) <= now) ||
        (o.deletedAt &&
          Date.parse(o.deletedAt) + d.config.trashRetentionDays * 864e5 <= now),
    )
    .map((o) => o.id);
  for (const id of expired) await purgeObject(id);
  await mutate((data) => {
    for (const [key, share] of Object.entries(data.shares))
      if (
        expired.includes(share.objectId) ||
        (share.expiresAt && Date.parse(share.expiresAt) <= now)
      )
        delete data.shares[key];
  });
  return expired.length;
}
