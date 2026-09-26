import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type { AppConfig } from '../config/env';

/**
 * Object storage abstraction. Keys are opaque, never user-controlled paths, and objects are never
 * publicly readable: downloads go through an authorized API endpoint.
 */
export interface StorageProvider {
  readonly name: string;
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  /** Creates the bucket/directory if necessary. Called once on startup. */
  ensureReady(): Promise<void>;
}

export class S3StorageProvider implements StorageProvider {
  readonly name = 's3';
  private readonly client: S3Client;

  constructor(private readonly options: Extract<AppConfig['storage'], { driver: 's3' }>) {
    this.client = new S3Client({
      region: options.region,
      ...(options.endpoint ? { endpoint: options.endpoint } : {}),
      forcePathStyle: options.forcePathStyle,
      ...(options.accessKeyId && options.secretAccessKey
        ? {
            credentials: {
              accessKeyId: options.accessKeyId,
              secretAccessKey: options.secretAccessKey,
            },
          }
        : {}),
    });
  }

  async ensureReady(): Promise<void> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.options.bucket }));
      return;
    } catch {
      // Missing, or HEAD not permitted by this S3 implementation; try to create it.
    }
    try {
      await this.client.send(new CreateBucketCommand({ Bucket: this.options.bucket }));
    } catch (error) {
      const name = error instanceof Error ? error.name : '';
      if (name !== 'BucketAlreadyOwnedByYou' && name !== 'BucketAlreadyExists') throw error;
    }
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.options.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        ServerSideEncryption: this.options.endpoint ? undefined : 'AES256',
      }),
    );
  }

  async get(key: string): Promise<Buffer> {
    const result = await this.client.send(
      new GetObjectCommand({ Bucket: this.options.bucket, Key: key }),
    );
    if (!result.Body) throw new Error(`Object ${key} has no body`);
    return Buffer.from(await result.Body.transformToByteArray());
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.options.bucket, Key: key }));
  }
}

/** Filesystem storage for tests and single-node development. */
export class LocalStorageProvider implements StorageProvider {
  readonly name = 'local';
  private readonly root: string;

  constructor(directory: string) {
    this.root = resolve(directory);
  }

  private pathFor(key: string): string {
    const full = resolve(this.root, key);
    if (!full.startsWith(this.root + sep)) throw new Error('Invalid storage key');
    return full;
  }

  async ensureReady(): Promise<void> {
    await mkdir(this.root, { recursive: true });
  }

  async put(key: string, body: Buffer): Promise<void> {
    const path = this.pathFor(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, body);
  }

  get(key: string): Promise<Buffer> {
    return readFile(this.pathFor(key));
  }

  async delete(key: string): Promise<void> {
    await rm(this.pathFor(key), { force: true });
  }
}

export function createStorageProvider(config: AppConfig['storage']): StorageProvider {
  return config.driver === 's3'
    ? new S3StorageProvider(config)
    : new LocalStorageProvider(config.directory);
}
