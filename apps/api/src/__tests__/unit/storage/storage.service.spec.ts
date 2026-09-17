import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StorageService } from '../../../common/storage/storage.service';

/**
 * Storage service unit tests — cover S3-compatible operations,
 * presigned URL generation, bucket validation, and edge cases.
 */

// Mock the AWS SDK modules before importing StorageService
const sendMock = vi.fn();

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn().mockImplementation(() => ({ send: sendMock })),
  PutObjectCommand: vi.fn().mockImplementation((params) => ({ _type: 'PutObjectCommand', ...params })),
  GetObjectCommand: vi.fn().mockImplementation((params) => ({ _type: 'GetObjectCommand', ...params })),
  HeadObjectCommand: vi.fn().mockImplementation((params) => ({ _type: 'HeadObjectCommand', ...params })),
  DeleteObjectCommand: vi.fn().mockImplementation((params) => ({ _type: 'DeleteObjectCommand', ...params })),
}));

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockResolvedValue('https://presigned.example.com/test'),
}));

function setStorageEnv() {
  process.env['S3_ENDPOINT'] = 'http://localhost:9000';
  process.env['S3_ACCESS_KEY'] = 'test-key';
  process.env['S3_SECRET_KEY'] = 'test-secret';
  process.env['S3_MEDIA_BUCKET'] = 'scs-media';
  process.env['S3_UPLOADS_BUCKET'] = 'scs-uploads';
}

function clearStorageEnv() {
  delete process.env['S3_ENDPOINT'];
  delete process.env['S3_ACCESS_KEY'];
  delete process.env['S3_SECRET_KEY'];
  delete process.env['S3_MEDIA_BUCKET'];
  delete process.env['S3_UPLOADS_BUCKET'];
  delete process.env['S3_REGION'];
}

describe('StorageService', () => {
  beforeEach(() => {
    setStorageEnv();
  });

  afterEach(() => {
    clearStorageEnv();
  });

  describe('constructor', () => {
    it('throws if S3_ENDPOINT is missing', () => {
      delete process.env['S3_ENDPOINT'];
      expect(() => new StorageService()).toThrow('S3_ENDPOINT is required');
    });

    it('throws if S3_ACCESS_KEY is missing', () => {
      delete process.env['S3_ACCESS_KEY'];
      expect(() => new StorageService()).toThrow('S3_ACCESS_KEY and S3_SECRET_KEY are required');
    });

    it('throws if S3_SECRET_KEY is missing', () => {
      delete process.env['S3_SECRET_KEY'];
      expect(() => new StorageService()).toThrow('S3_ACCESS_KEY and S3_SECRET_KEY are required');
    });

    it('constructs successfully with valid env', () => {
      expect(() => new StorageService()).not.toThrow();
    });
  });

  describe('bucket validation', () => {
    it('rejects operations on buckets not in the allowed set', async () => {
      const service = new StorageService();
      await expect(
        service.putObject({ bucket: 'evil-bucket', key: 'test', body: 'data' }),
      ).rejects.toThrow('Bucket "evil-bucket" is not in the allowed set');
    });

    it('rejects getObject on disallowed bucket', async () => {
      const service = new StorageService();
      await expect(service.getObject('evil-bucket', 'key')).rejects.toThrow(
        'Bucket "evil-bucket" is not in the allowed set',
      );
    });

    it('rejects deleteObject on disallowed bucket', async () => {
      const service = new StorageService();
      await expect(service.deleteObject('evil-bucket', 'key')).rejects.toThrow(
        'Bucket "evil-bucket" is not in the allowed set',
      );
    });

    it('rejects presigned GET on disallowed bucket', async () => {
      const service = new StorageService();
      await expect(service.createPresignedGetUrl('evil-bucket', 'key')).rejects.toThrow(
        'Bucket "evil-bucket" is not in the allowed set',
      );
    });

    it('rejects presigned PUT on disallowed bucket', async () => {
      const service = new StorageService();
      await expect(
        service.createPresignedPutUrl('evil-bucket', 'key', 'image/png'),
      ).rejects.toThrow('Bucket "evil-bucket" is not in the allowed set');
    });
  });

  describe('putObject', () => {
    it('calls S3 send with correct params and returns bucket/key', async () => {
      const service = new StorageService();
      sendMock.mockResolvedValueOnce({});

      const result = await service.putObject({
        bucket: 'scs-media',
        key: 'products/test.png',
        body: Buffer.from('test'),
        contentType: 'image/png',
      });

      expect(result).toEqual({ bucket: 'scs-media', key: 'products/test.png' });
      expect(sendMock).toHaveBeenCalledOnce();
    });
  });

  describe('exists', () => {
    it('returns true when headObject succeeds', async () => {
      const service = new StorageService();
      sendMock.mockResolvedValueOnce({ ContentLength: 100 });

      const result = await service.exists('scs-media', 'products/test.png');
      expect(result).toBe(true);
    });

    it('returns false when headObject throws (not found)', async () => {
      const service = new StorageService();
      sendMock.mockRejectedValueOnce(new Error('NoSuchKey'));

      const result = await service.exists('scs-media', 'products/missing.png');
      expect(result).toBe(false);
    });
  });

  describe('presigned URLs', () => {
    it('createPresignedGetUrl returns a signed URL', async () => {
      const service = new StorageService();
      const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');

      const url = await service.createPresignedGetUrl('scs-media', 'products/test.png');
      expect(url).toBe('https://presigned.example.com/test');
      expect(getSignedUrl).toHaveBeenCalled();
    });

    it('createPresignedPutUrl returns a signed URL', async () => {
      const service = new StorageService();
      const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');

      const url = await service.createPresignedPutUrl(
        'scs-uploads',
        'docs/test.pdf',
        'application/pdf',
      );
      expect(url).toBe('https://presigned.example.com/test');
      expect(getSignedUrl).toHaveBeenCalled();
    });

    it('clamps expiry to MAX_PRESIGN_EXPIRY (900s) even if caller requests more', async () => {
      const service = new StorageService();
      const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');

      await service.createPresignedGetUrl('scs-media', 'key', 3600);
      // getSignedUrl should be called with expiresIn = 900, not 3600
      expect(getSignedUrl).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        { expiresIn: 900 },
      );
    });
  });
});
