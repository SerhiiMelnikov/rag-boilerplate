import { describe, it, expect } from "vitest";
import { PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { createObjectStore, type S3Like } from "./storage";

function fakeClient() {
  const sent: unknown[] = [];
  const client: S3Like = {
    async send(command: unknown) {
      sent.push(command);
      if (command instanceof GetObjectCommand) {
        return { Body: { transformToByteArray: async () => new Uint8Array([1, 2, 3]) }, ContentType: "image/png" };
      }
      return {};
    },
  };
  return { client, sent };
}

describe("createObjectStore", () => {
  it("put sends a PutObjectCommand with bucket/key/body/content-type", async () => {
    const { client, sent } = fakeClient();
    const store = createObjectStore(client, "imgs");
    await store.put("images/a.png", Buffer.from("x"), "image/png");
    expect(sent[0]).toBeInstanceOf(PutObjectCommand);
    expect((sent[0] as PutObjectCommand).input).toMatchObject({ Bucket: "imgs", Key: "images/a.png", ContentType: "image/png" });
  });

  it("get returns bytes + content type from a GetObjectCommand", async () => {
    const { client, sent } = fakeClient();
    const store = createObjectStore(client, "imgs");
    const out = await store.get("images/a.png");
    expect(sent[0]).toBeInstanceOf(GetObjectCommand);
    expect(out.contentType).toBe("image/png");
    expect([...out.body]).toEqual([1, 2, 3]);
  });

  it("delete sends a DeleteObjectCommand", async () => {
    const { client, sent } = fakeClient();
    const store = createObjectStore(client, "imgs");
    await store.delete("images/a.png");
    expect(sent[0]).toBeInstanceOf(DeleteObjectCommand);
    expect((sent[0] as DeleteObjectCommand).input).toMatchObject({ Bucket: "imgs", Key: "images/a.png" });
  });
});
