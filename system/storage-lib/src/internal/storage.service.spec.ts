import {
  assertAvatarUploadPolicy,
  assertPostMediaUploadPolicy,
  StorageService,
} from './storage.service';

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn(),
}));

describe('assertAvatarUploadPolicy', () => {
  it('chỉ nhận ảnh JPEG/PNG/WebP không quá 5MB', () => {
    expect(() =>
      assertAvatarUploadPolicy({
        userId: 'u1',
        contentType: 'image/webp',
        contentLength: 5 * 1024 * 1024,
      }),
    ).not.toThrow();
  });

  it('từ chối content type không phải ảnh', () => {
    expect(() =>
      assertAvatarUploadPolicy({
        userId: 'u1',
        contentType: 'application/pdf',
        contentLength: 1024,
      }),
    ).toThrow();
  });

  it('từ chối ảnh lớn hơn giới hạn', () => {
    expect(() =>
      assertAvatarUploadPolicy({
        userId: 'u1',
        contentType: 'image/png',
        contentLength: 5 * 1024 * 1024 + 1,
      }),
    ).toThrow();
  });
});

describe('assertPostMediaUploadPolicy', () => {
  const validRequest = {
    userId: '11111111-1111-1111-1111-111111111111',
    postId: '22222222-2222-2222-2222-222222222222',
    contentType: 'image/webp',
    contentLength: 5 * 1024 * 1024,
  };

  it('nhận ảnh JPEG/PNG/WebP không quá 5MB cho đúng post', () => {
    expect(() => assertPostMediaUploadPolicy(validRequest)).not.toThrow();
  });

  it.each([
    { ...validRequest, contentType: 'video/mp4' },
    { ...validRequest, contentLength: 5 * 1024 * 1024 + 1 },
  ])('từ chối post media sai policy', (request) => {
    expect(() => assertPostMediaUploadPolicy(request)).toThrow();
  });
});

describe('StorageService.confirmPostMediaUpload', () => {
  const userId = '11111111-1111-1111-1111-111111111111';
  const postId = '22222222-2222-2222-2222-222222222222';
  const client = { send: jest.fn() };
  const storage = new StorageService(
    client as never,
    {
      bucket: 'chantam-test',
      publicBaseUrl: 'http://localhost:9000/chantam-test',
    } as never,
  );

  it('từ chối key khác user hoặc post trước HeadObject', async () => {
    await expect(
      storage.confirmPostMediaUpload(
        userId,
        postId,
        `users/${userId}/posts/33333333-3333-3333-3333-333333333333/media/a.webp`,
      ),
    ).rejects.toThrow();

    expect(client.send).not.toHaveBeenCalled();
  });
});

describe('StorageService.createAvatarUpload', () => {
  it('tạo upload url mà không ép ContentLength vào PutObjectCommand để tránh lỗi signed headers', async () => {
    let capturedCommand: any = null;
    const { getSignedUrl } = jest.requireMock(
      '@aws-sdk/s3-request-presigner',
    ) as { getSignedUrl: jest.Mock };
    getSignedUrl.mockImplementation((_client: unknown, cmd: any) => {
      capturedCommand = cmd;
      return Promise.resolve('https://mock-storage.local/upload-url');
    });

    const storage = new StorageService(
      {} as never,
      {
        bucket: 'chantam-test',
        publicBaseUrl: 'https://cdn.chantam.test',
        uploadExpiresInSeconds: 300,
      } as never,
    );

    const result = await storage.createAvatarUpload({
      userId: '11111111-1111-1111-1111-111111111111',
      contentType: 'image/jpeg',
      contentLength: 97008,
    });

    expect(result.uploadUrl).toBe('https://mock-storage.local/upload-url');
    expect(capturedCommand?.input?.Bucket).toBe('chantam-test');
    expect(capturedCommand?.input?.ContentType).toBe('image/jpeg');
    expect(capturedCommand?.input?.ContentLength).toBeUndefined();
  });
});
