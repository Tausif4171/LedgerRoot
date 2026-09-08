import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { environment } from "../config/env.js";
export interface ObjectStore {
  put(key: string, bytes: Buffer, mime: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  url(key: string): Promise<string>;
}
export class Storage implements ObjectStore {
  private env = environment();
  private client = new S3Client({
    maxAttempts: 2,
    requestHandler: { connectionTimeout: 5000, requestTimeout: 20000 },
    endpoint: this.env.S3_ENDPOINT,
    region: this.env.S3_REGION,
    forcePathStyle: true,
    credentials: { accessKeyId: this.env.S3_ACCESS_KEY, secretAccessKey: this.env.S3_SECRET_KEY },
  });
  async ensureBucket() {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.env.S3_BUCKET }));
    } catch (error) {
      if ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode !== 404)
        throw error;
      await this.client.send(new CreateBucketCommand({ Bucket: this.env.S3_BUCKET }));
    }
  }
  async put(key: string, bytes: Buffer, mime: string) {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.env.S3_BUCKET,
        Key: key,
        Body: bytes,
        ContentType: mime,
        IfNoneMatch: "*",
      }),
    );
  }
  async get(key: string) {
    const object = await this.client.send(
      new GetObjectCommand({ Bucket: this.env.S3_BUCKET, Key: key }),
    );
    if (!object.Body) throw new Error("Object unavailable");
    return Buffer.from(await object.Body.transformToByteArray());
  }
  async url(key: string) {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.env.S3_BUCKET,
        Key: key,
        ResponseCacheControl: "private, no-store",
      }),
      { expiresIn: 60 },
    );
  }
  async cleanup(referenced: (key: string) => Promise<boolean>) {
    let token: string | undefined;
    do {
      const page = await this.client.send(
        new ListObjectsV2Command({ Bucket: this.env.S3_BUCKET, ContinuationToken: token }),
      );
      for (const obj of page.Contents ?? [])
        if (
          obj.Key &&
          obj.LastModified &&
          Date.now() - obj.LastModified.getTime() > 86400000 &&
          !(await referenced(obj.Key))
        )
          await this.client.send(
            new DeleteObjectCommand({ Bucket: this.env.S3_BUCKET, Key: obj.Key }),
          );
      token = page.NextContinuationToken;
    } while (token);
  }
}
