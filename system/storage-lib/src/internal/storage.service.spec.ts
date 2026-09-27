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
  const validImageRequest = {
    userId: '11111111-1111-1111-1111-111111111111',
    postId: '22222222-2222-2222-2222-222222222222',
    contentType: 'image/webp',
    contentLength: 5 * 1024 * 1024,
  };

  const validVideoRequest = {
    userId: '11111111-1111-1111-1111-111111111111',
    postId: '22222222-2222-2222-2222-222222222222',
    contentType: 'video/quicktime',
    contentLength: 25 * 1024 * 1024,
  };

  it('nhận ảnh JPEG/PNG/WebP không quá 5MB cho đúng post', () => {
    expect(() => assertPostMediaUploadPolicy(validImageRequest)).not.toThrow();
  });

  it('nhận video MP4/QuickTime/WebM không quá 25MB cho đúng post', () => {
    expect(() => assertPostMediaUploadPolicy(validVideoRequest)).not.toThrow();
    expect(() =>
      assertPostMediaUploadPolicy({
        ...validVideoRequest,
        contentType: 'video/mp4',
        contentLength: 10 * 1024 * 1024,
      }),
    ).not.toThrow();
  });

  it.each([
    { ...validImageRequest, contentLength: 5 * 1024 * 1024 + 1 },
    { ...validVideoRequest, contentLength: 25 * 1024 * 1024 + 1 },
    { ...validImageRequest, contentType: 'application/pdf' },
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

  it('chấp nhận video <= 25MB', async () => {
    client.send.mockReset();
    client.send.mockResolvedValueOnce({
      ContentType: 'video/quicktime',
      ContentLength: 20 * 1024 * 1024,
    });

    await expect(
      storage.confirmPostMediaUpload(
        userId,
        postId,
        `users/${userId}/posts/${postId}/media/a.mov`,
      ),
    ).resolves.toBeUndefined();
  });

  it('từ chối và xoá video > 25MB', async () => {
    client.send.mockReset();
    client.send.mockResolvedValueOnce({
      ContentType: 'video/mp4',
      ContentLength: 26 * 1024 * 1024,
    });
    client.send.mockResolvedValueOnce({ Errors: [] }); // DeleteObjects

    await expect(
      storage.confirmPostMediaUpload(
        userId,
        postId,
        `users/${userId}/posts/${postId}/media/a.mp4`,
      ),
    ).rejects.toThrow();
  });
});

describe('StorageService.createAvatarUpload', () => {
  it('KÝ LUÔN ContentLength vào PutObjectCommand', async () => {
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
    // Thiếu dòng này thì con số client khai chỉ là lời khai: xin đường tải cho
    // 1 KB rồi PUT 500 MB vẫn trôi, và không bản ghi nào trong database nhắc
    // rằng object đó tồn tại.
    //
    // Spec cũ cố ý KHÔNG ký, với ghi chú "tránh lỗi signed headers". Đã dựng
    // lại trên MinIO thật để kiểm: PUT đúng số đã khai trả 200, PUT lớn hơn trả
    // 403 và object không hề được tạo. Xem `npm run test:media-policy`.
    expect(capturedCommand?.input?.ContentLength).toBe(97008);
  });
});
