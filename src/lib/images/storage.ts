import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

export interface ObjectStore {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<{ body: Buffer; contentType: string }>;
  delete(key: string): Promise<void>;
}

// Minimal `send`-based shape so unit tests can inject a fake S3 client.
export interface S3Like {
  send(command: unknown): Promise<unknown>;
}

// Build the real S3 client from env. S3_ENDPOINT + S3_FORCE_PATH_STYLE support
// MinIO locally; region/credentials come from the standard S3_* vars.
function buildClient(): S3Client {
  const endpoint = process.env.S3_ENDPOINT;
  return new S3Client({
    ...(endpoint ? { endpoint } : {}),
    region: process.env.S3_REGION || "us-east-1",
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
    },
  });
}

export function createObjectStore(
  client: S3Like = buildClient(),
  bucket: string = process.env.S3_BUCKET ?? "rag-images",
): ObjectStore {
  return {
    async put(key, body, contentType) {
      await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }));
    },
    async get(key) {
      const res = (await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }))) as {
        Body?: { transformToByteArray(): Promise<Uint8Array> };
        ContentType?: string;
      };
      const bytes = await res.Body!.transformToByteArray();
      return { body: Buffer.from(bytes), contentType: res.ContentType ?? "application/octet-stream" };
    },
    async delete(key) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },
  };
}

// Memoized singleton for app use (built lazily so tests can inject instead).
let singleton: ObjectStore | null = null;
export function getObjectStore(): ObjectStore {
  if (!singleton) singleton = createObjectStore();
  return singleton;
}
