import { randomUUID } from "crypto";
import { createWriteStream } from "fs";
import { mkdir, open, unlink } from "fs/promises";
import path from "path";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

// Blob storage abstraction. Local filesystem is the default; set
// NINE_T_STORAGE_DRIVER=s3 plus the NINE_T_S3_* variables for S3-compatible
// storage (AWS, MinIO, R2, ...). Metadata (storageKey) is unchanged, so
// switching drivers only affects where new blobs land — existing blobs stay
// where they were written.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const localDir = path.join(
  process.env.NINE_T_DATA_DIR
    ? path.resolve(process.env.NINE_T_DATA_DIR)
    : path.join(process.cwd(), "data"),
  "objects",
);

export function newStorageKey(): string {
  return randomUUID();
}

export function validStorageKey(key: unknown): key is string {
  return typeof key === "string" && UUID_RE.test(key);
}

export type BlobRange = { offset: number; length: number };
export type BlobData = { body: Buffer; total: number };
export type BlobBody = NodeJS.ReadableStream | ReadableStream<Uint8Array>;

// File Upload bodies arrive as web streams (File.stream()); the S3 SDK can
// only hash Node streams, so normalize here for every caller.
function toNodeStream(body: BlobBody): NodeJS.ReadableStream {
  const b = body as unknown as Record<string, unknown>;
  if (b && typeof b.pipe === "function") return body as NodeJS.ReadableStream;
  if (b && typeof (body as ReadableStream<Uint8Array>).getReader === "function")
    return Readable.fromWeb(body as never) as unknown as NodeJS.ReadableStream;
  throw new Error("Unsupported body stream");
}

async function streamToBuffer(
  body: AsyncIterable<Uint8Array> | undefined,
): Promise<Buffer> {
  if (!body) return Buffer.alloc(0);
  const chunks: Buffer[] = [];
  for await (const chunk of body as AsyncIterable<Uint8Array>)
    chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

const localStore = {
  async put(
    key: string,
    body: BlobBody,
    _opts?: { size?: number; contentType?: string },
  ) {
    await mkdir(localDir, { recursive: true });
    await pipeline(
      toNodeStream(body) as never,
      createWriteStream(path.join(localDir, path.basename(key)), {
        mode: 0o600,
      }) as never,
    );
  },
  async get(key: string, range?: BlobRange): Promise<BlobData> {
    const file = await open(path.join(localDir, path.basename(key)), "r");
    try {
      const stat = await file.stat();
      const offset = range?.offset ?? 0;
      if (offset > stat.size) throw new Error("Invalid offset");
      const length = Math.min(range?.length ?? stat.size, stat.size - offset);
      const buffer = Buffer.alloc(length);
      const { bytesRead } = await file.read(buffer, 0, length, offset);
      return { body: buffer.subarray(0, bytesRead), total: stat.size };
    } finally {
      await file.close();
    }
  },
  async del(key: string) {
    await unlink(path.join(localDir, path.basename(key)));
  },
};

type S3Config = {
  endpoint: string;
  region: string;
  bucket: string;
  accessKey: string;
  secretKey: string;
  prefix: string;
  forcePathStyle: boolean;
};

function s3Config(): S3Config {
  const endpoint = process.env.NINE_T_S3_ENDPOINT || "";
  const bucket = process.env.NINE_T_S3_BUCKET || "";
  const accessKey = process.env.NINE_T_S3_ACCESS_KEY || "";
  const secretKey = process.env.NINE_T_S3_SECRET_KEY || "";
  if (!endpoint || !bucket || !accessKey || !secretKey)
    throw new Error(
      "S3 storage needs NINE_T_S3_ENDPOINT, NINE_T_S3_BUCKET, NINE_T_S3_ACCESS_KEY and NINE_T_S3_SECRET_KEY.",
    );
  let prefix = process.env.NINE_T_S3_PREFIX ?? "9t/";
  if (prefix && !prefix.endsWith("/")) prefix += "/";
  return {
    endpoint,
    region: process.env.NINE_T_S3_REGION || "us-east-1",
    bucket,
    accessKey,
    secretKey,
    prefix,
    forcePathStyle: process.env.NINE_T_S3_FORCE_PATH_STYLE !== "false",
  };
}

let s3Client: S3Client | null = null;
function s3(): { client: S3Client; config: S3Config } {
  const config = s3Config();
  if (!s3Client)
    s3Client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      credentials: {
        accessKeyId: config.accessKey,
        secretAccessKey: config.secretKey,
      },
      forcePathStyle: config.forcePathStyle,
    });
  return { client: s3Client, config };
}

const s3Store = {
  async put(
    key: string,
    body: BlobBody,
    opts?: { size?: number; contentType?: string },
  ) {
    const { client, config } = s3();
    await client.send(
      new PutObjectCommand({
        Bucket: config.bucket,
        Key: config.prefix + key,
        Body: toNodeStream(body) as never,
        ...(opts?.size ? { ContentLength: opts.size } : {}),
        ...(opts?.contentType ? { ContentType: opts.contentType } : {}),
      }),
    );
  },
  async get(key: string, range?: BlobRange): Promise<BlobData> {
    const { client, config } = s3();
    const offset = range?.offset ?? 0;
    if (offset < 0 || !Number.isSafeInteger(offset))
      throw new Error("Invalid offset");
    const res = await client.send(
      new GetObjectCommand({
        Bucket: config.bucket,
        Key: config.prefix + key,
        ...(range
          ? { Range: `bytes=${offset}-${offset + range.length - 1}` }
          : {}),
      }),
    );
    const body = await streamToBuffer(
      res.Body as AsyncIterable<Uint8Array> | undefined,
    );
    // ContentRange: "bytes 0-262143/524288" — the total is authoritative.
    const total = res.ContentRange?.split("/")[1]
      ? Number(res.ContentRange.split("/")[1])
      : (res.ContentLength ?? body.length);
    if (offset > total) throw new Error("Invalid offset");
    return { body, total };
  },
  async del(key: string) {
    const { client, config } = s3();
    await client.send(
      new DeleteObjectCommand({ Bucket: config.bucket, Key: config.prefix + key }),
    );
  },
};

export type BlobStore = typeof localStore;

export function storageDriver(): "local" | "s3" {
  return process.env.NINE_T_STORAGE_DRIVER === "s3" ? "s3" : "local";
}

export function getBlobStore(): BlobStore {
  return storageDriver() === "s3" ? s3Store : localStore;
}

export async function putBlob(
  key: string,
  body: BlobBody,
  opts?: { size?: number; contentType?: string },
): Promise<void> {
  if (!validStorageKey(key)) throw new Error("Invalid storage key");
  return getBlobStore().put(key, body, opts);
}

export async function getBlob(key: string, range?: BlobRange): Promise<BlobData> {
  if (!validStorageKey(key)) throw new Error("Invalid storage key");
  return getBlobStore().get(key, range);
}

export async function delBlob(key: string): Promise<void> {
  if (!validStorageKey(key)) throw new Error("Invalid storage key");
  return getBlobStore().del(key);
}
