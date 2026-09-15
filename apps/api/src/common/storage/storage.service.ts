import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable, Logger } from '@nestjs/common';

/**
 * S3-compatible object storage service.
 *
 * Works with AWS S3, MinIO and Backblaze B2.
 * All presigned URLs default to a 15-minute expiry for security.
 */
@Injectable()
export class StorageService {
  private readonly client: S3Client;
  private readonly logger = new Logger(StorageService.name);

  /** Bucket names allowed by this instance (read from env at boot). */
  private readonly allowedBuckets: Set<string>;

  /** Maximum presigned-URL lifetime (seconds). Hard cap regardless of caller request. */
  private static readonly MAX_PRESIGN_EXPIRY = 900; // 15 min

  constructor() {
    const endpoint = process.env['S3_ENDPOINT'];
    const region = process.env['S3_REGION'] || 'us-east-1';
    const accessKey = process.env['S3_ACCESS_KEY'];
    const secretKey = process.env['S3_SECRET_KEY'];

    if (!endpoint) {
      throw new Error('S3_ENDPOINT is required');
    }

    if (!accessKey || !secretKey) {
      throw new Error('S3_ACCESS_KEY and S3_SECRET_KEY are required');
    }

    this.client = new S3Client({
      endpoint,
      region,
      credentials: {
        accessKeyId: accessKey,
        secretAccessKey: secretKey,
      },

      // Required for reliable compatibility with MinIO and Backblaze B2.
      forcePathStyle: true,
    });

    // Collect allowed buckets from env so we can validate every call.
    const mediaBucket = process.env['S3_MEDIA_BUCKET'] || 'scs-media';
    const uploadsBucket = process.env['S3_UPLOADS_BUCKET'] || 'scs-uploads';
    this.allowedBuckets = new Set([mediaBucket, uploadsBucket]);
  }

  // ── Bucket validation ────────────────────────────────────────

  private assertBucketAllowed(bucket: string): void {
    if (!this.allowedBuckets.has(bucket)) {
      throw new Error(
        `Bucket "${bucket}" is not in the allowed set ([${[...this.allowedBuckets].join(', ')}])`,
      );
    }
  }

  // ── Core operations ──────────────────────────────────────────

  async putObject(params: {
    bucket: string;
    key: string;
    body: Buffer | Uint8Array | string;
    contentType?: string;
    metadata?: Record<string, string>;
  }) {
    this.assertBucketAllowed(params.bucket);

    await this.client.send(
      new PutObjectCommand({
        Bucket: params.bucket,
        Key: params.key,
        Body: params.body,
        ContentType: params.contentType,
        Metadata: params.metadata,
      }),
    );

    this.logger.debug(`putObject ${params.bucket}/${params.key}`);

    return {
      bucket: params.bucket,
      key: params.key,
    };
  }

  async getObject(bucket: string, key: string) {
    this.assertBucketAllowed(bucket);
    return this.client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      }),
    );
  }

  async headObject(bucket: string, key: string) {
    this.assertBucketAllowed(bucket);
    return this.client.send(
      new HeadObjectCommand({
        Bucket: bucket,
        Key: key,
      }),
    );
  }

  async exists(bucket: string, key: string): Promise<boolean> {
    try {
      await this.headObject(bucket, key);
      return true;
    } catch {
      return false;
    }
  }

  async deleteObject(bucket: string, key: string) {
    this.assertBucketAllowed(bucket);
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: bucket,
        Key: key,
      }),
    );
    this.logger.debug(`deleteObject ${bucket}/${key}`);
  }

  // ── Presigned URLs ───────────────────────────────────────────

  /**
   * Generate a presigned GET (download) URL.
   * Expiry is clamped to {@link MAX_PRESIGN_EXPIRY} (15 min) for security.
   */
  async createPresignedGetUrl(
    bucket: string,
    key: string,
    expiresInSeconds = 900,
  ) {
    this.assertBucketAllowed(bucket);
    const safeExpiry = Math.min(expiresInSeconds, StorageService.MAX_PRESIGN_EXPIRY);
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      }),
      { expiresIn: safeExpiry },
    );
  }

  /**
   * Generate a presigned PUT (upload) URL so browsers / mobile apps
   * can upload directly to S3 without proxying through the API.
   * Expiry is clamped to {@link MAX_PRESIGN_EXPIRY} (15 min) for security.
   */
  async createPresignedPutUrl(
    bucket: string,
    key: string,
    contentType: string,
    expiresInSeconds = 900,
  ) {
    this.assertBucketAllowed(bucket);
    const safeExpiry = Math.min(expiresInSeconds, StorageService.MAX_PRESIGN_EXPIRY);
    return getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        ContentType: contentType,
      }),
      { expiresIn: safeExpiry },
    );
  }
}
