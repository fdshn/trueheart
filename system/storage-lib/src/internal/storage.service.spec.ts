import {
  assertAvatarUploadPolicy,
  assertPostMediaUploadPolicy,
  StorageService,
} from './storage.service';

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
