import {
  assertAvatarUploadPolicy,
  assertCampaignMediaUploadPolicy,
  assertIntroThumbnailUploadPolicy,
  assertIntroVideoUploadPolicy,
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

describe('assertCampaignMediaUploadPolicy', () => {
  const base = { userId: '11111111-1111-1111-1111-111111111111' };
  it('nhận ảnh 5MB và video 25MB', () => {
    expect(() =>
      assertCampaignMediaUploadPolicy({
        ...base,
        contentType: 'image/png',
        contentLength: 5 * 1024 * 1024,
      }),
    ).not.toThrow();
    expect(() =>
      assertCampaignMediaUploadPolicy({
        ...base,
        contentType: 'video/webm',
        contentLength: 25 * 1024 * 1024,
      }),
    ).not.toThrow();
  });
  it('từ chối PDF, ảnh > 5MB, video > 25MB', () => {
    expect(() =>
      assertCampaignMediaUploadPolicy({
        ...base,
        contentType: 'application/pdf',
        contentLength: 10,
      }),
    ).toThrow();
    expect(() =>
      assertCampaignMediaUploadPolicy({
        ...base,
        contentType: 'image/jpeg',
        contentLength: 5 * 1024 * 1024 + 1,
      }),
    ).toThrow();
    expect(() =>
      assertCampaignMediaUploadPolicy({
        ...base,
        contentType: 'video/mp4',
        contentLength: 25 * 1024 * 1024 + 1,
      }),
    ).toThrow();
  });
});

describe('StorageService.createCampaignMediaUpload', () => {
  it('sinh key dưới users/<userId>/campaign-media/ và ký ContentLength', async () => {
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
        publicBaseUrl: 'https://cdn.chantam.test/',
        uploadExpiresInSeconds: 300,
      } as never,
    );
    const result = await storage.createCampaignMediaUpload({
      userId: '11111111-1111-1111-1111-111111111111',
      contentType: 'video/quicktime',
      contentLength: 1000,
    });
    expect(result.key).toMatch(
      /^users\/11111111-1111-1111-1111-111111111111\/campaign-media\/[0-9a-f-]{36}\.mov$/,
    );
    expect(result.publicUrl).toBe(`https://cdn.chantam.test/${result.key}`);
    expect(capturedCommand?.input?.ContentLength).toBe(1000);
  });
});

describe('StorageService.confirmCampaignMediaUpload', () => {
  const userId = '11111111-1111-1111-1111-111111111111';
  const client = { send: jest.fn() };
  const storage = new StorageService(
    client as never,
    {
      bucket: 'chantam-test',
      publicBaseUrl: 'https://cdn.chantam.test',
    } as never,
  );
  beforeEach(() => client.send.mockReset());
  it('từ chối key của người khác TRƯỚC HeadObject', async () => {
    await expect(
      storage.confirmCampaignMediaUpload(
        userId,
        'users/someone-else/campaign-media/a.webp',
      ),
    ).rejects.toThrow();
    expect(client.send).not.toHaveBeenCalled();
  });
  it('từ chối key của chính mình nhưng sai namespace (media bài đăng)', async () => {
    await expect(
      storage.confirmCampaignMediaUpload(
        userId,
        `users/${userId}/posts/p1/media/a.webp`,
      ),
    ).rejects.toThrow();
    expect(client.send).not.toHaveBeenCalled();
  });
  it('ảnh hợp lệ trả IMAGE kèm publicUrl', async () => {
    client.send.mockResolvedValueOnce({
      ContentType: 'image/webp',
      ContentLength: 1000,
    });
    const key = `users/${userId}/campaign-media/a.webp`;
    await expect(
      storage.confirmCampaignMediaUpload(userId, key),
    ).resolves.toEqual({
      mediaType: 'IMAGE',
      publicUrl: `https://cdn.chantam.test/${key}`,
    });
  });
  it('video hợp lệ trả VIDEO', async () => {
    client.send.mockResolvedValueOnce({
      ContentType: 'video/mp4',
      ContentLength: 20 * 1024 * 1024,
    });
    await expect(
      storage.confirmCampaignMediaUpload(
        userId,
        `users/${userId}/campaign-media/a.mp4`,
      ),
    ).resolves.toMatchObject({ mediaType: 'VIDEO' });
  });
  it('object không tồn tại thì StorageValidationError, không phải lỗi SDK thô', async () => {
    client.send.mockRejectedValueOnce(
      Object.assign(new Error('NotFound'), {
        name: 'NotFound',
        $metadata: { httpStatusCode: 404 },
      }),
    );
    await expect(
      storage.confirmCampaignMediaUpload(
        userId,
        `users/${userId}/campaign-media/missing.webp`,
      ),
    ).rejects.toMatchObject({ name: 'StorageValidationError' });
  });
  it('lỗi mạng khác vẫn ném nguyên dạng', async () => {
    client.send.mockRejectedValueOnce(
      Object.assign(new Error('boom'), {
        name: 'TimeoutError',
        $metadata: { httpStatusCode: 503 },
      }),
    );
    await expect(
      storage.confirmCampaignMediaUpload(
        userId,
        `users/${userId}/campaign-media/a.webp`,
      ),
    ).rejects.toMatchObject({ name: 'TimeoutError' });
  });
  it('NoSuchKey với status 503 vẫn ném nguyên dạng', async () => {
    client.send.mockRejectedValueOnce(
      Object.assign(new Error('temporarily unavailable'), {
        name: 'NoSuchKey',
        $metadata: { httpStatusCode: 503 },
      }),
    );

    await expect(
      storage.confirmCampaignMediaUpload(
        userId,
        `users/${userId}/campaign-media/outage.webp`,
      ),
    ).rejects.toMatchObject({ name: 'NoSuchKey' });
  });
});

describe('StorageService · thư viện ảnh CMS (CMS A2)', () => {
  const adminId = '22222222-2222-2222-2222-222222222222';

  it('chỉ nhận ảnh, sinh key dưới users/<adminId>/cms-media/', async () => {
    const { getSignedUrl } = jest.requireMock(
      '@aws-sdk/s3-request-presigner',
    ) as { getSignedUrl: jest.Mock };
    getSignedUrl.mockResolvedValue('https://mock-storage.local/upload-url');
    const storage = new StorageService(
      {} as never,
      {
        bucket: 'chantam-test',
        publicBaseUrl: 'https://cdn.chantam.test/',
      } as never,
    );

    const result = await storage.createCmsMediaUpload({
      userId: adminId,
      contentType: 'image/png',
      contentLength: 1000,
    });
    expect(result.key).toMatch(
      /^users\/22222222-2222-2222-2222-222222222222\/cms-media\/[0-9a-f-]{36}\.png$/,
    );
    expect(result.publicUrl).toBe(`https://cdn.chantam.test/${result.key}`);

    await expect(
      storage.createCmsMediaUpload({
        userId: adminId,
        contentType: 'video/mp4',
        contentLength: 1000,
      }),
    ).rejects.toMatchObject({ name: 'StorageValidationError' });
    await expect(
      storage.createCmsMediaUpload({
        userId: adminId,
        contentType: 'image/webp',
        contentLength: 5 * 1024 * 1024 + 1,
      }),
    ).rejects.toMatchObject({ name: 'StorageValidationError' });
  });

  it('xác nhận: sai tiền tố từ chối trước HeadObject; ảnh hợp lệ trả URL', async () => {
    const client = { send: jest.fn() };
    const storage = new StorageService(
      client as never,
      {
        bucket: 'chantam-test',
        publicBaseUrl: 'https://cdn.chantam.test',
      } as never,
    );

    await expect(
      storage.confirmCmsMediaUpload(
        adminId,
        `users/${adminId}/campaign-media/a.webp`,
      ),
    ).rejects.toThrow();
    expect(client.send).not.toHaveBeenCalled();

    client.send.mockResolvedValueOnce({
      ContentType: 'image/webp',
      ContentLength: 1000,
    });
    const key = `users/${adminId}/cms-media/a.webp`;
    await expect(storage.confirmCmsMediaUpload(adminId, key)).resolves.toEqual({
      contentType: 'image/webp',
      publicUrl: `https://cdn.chantam.test/${key}`,
    });
  });
});

describe('clip giới thiệu trên hồ sơ (PR #46 §3.3)', () => {
  const userId = '11111111-1111-1111-1111-111111111111';
  const MB = 1024 * 1024;

  it('chính sách: video mp4/quicktime tối đa 50 MB; ảnh bìa tối đa 2 MB', () => {
    const video = (contentType: string, contentLength: number) => () =>
      assertIntroVideoUploadPolicy({ userId, contentType, contentLength });
    const cover = (contentType: string, contentLength: number) => () =>
      assertIntroThumbnailUploadPolicy({ userId, contentType, contentLength });

    expect(video('video/mp4', 50 * MB)).not.toThrow();
    expect(video('video/quicktime', 10 * MB)).not.toThrow();
    expect(video('video/webm', MB)).toThrow();
    expect(video('image/jpeg', MB)).toThrow();
    expect(video('video/mp4', 50 * MB + 1)).toThrow();
    expect(cover('image/webp', 2 * MB)).not.toThrow();
    expect(cover('image/webp', 2 * MB + 1)).toThrow();
    expect(cover('video/mp4', MB)).toThrow();
  });

  it('xin đường tải: key nằm trong không gian của chính người đó, ký kích thước', async () => {
    let captured: any = null;
    const { getSignedUrl } = jest.requireMock(
      '@aws-sdk/s3-request-presigner',
    ) as { getSignedUrl: jest.Mock };
    getSignedUrl.mockImplementation((_client: unknown, cmd: any) => {
      captured = cmd;
      return Promise.resolve('https://mock-storage.local/upload-url');
    });
    const storage = new StorageService(
      {} as never,
      { bucket: 'b', publicBaseUrl: 'https://cdn.test' } as never,
    );

    const video = await storage.createIntroVideoUpload({
      userId,
      contentType: 'video/mp4',
      contentLength: 3 * MB,
    });
    expect(video.key).toMatch(
      new RegExp(`^users/${userId}/intro-videos/[0-9a-f-]+\\.mp4$`),
    );
    expect(captured?.input?.ContentLength).toBe(3 * MB);

    const cover = await storage.createIntroThumbnailUpload({
      userId,
      contentType: 'image/jpeg',
      contentLength: 100_000,
    });
    expect(cover.key).toMatch(
      new RegExp(`^users/${userId}/intro-thumbnails/[0-9a-f-]+\\.jpeg$`),
    );
  });

  it('xác nhận: key của người khác bị từ chối trước HeadObject; object đúng trả URL công khai', async () => {
    const client = { send: jest.fn() };
    const storage = new StorageService(
      client as never,
      { bucket: 'b', publicBaseUrl: 'https://cdn.test/' } as never,
    );

    await expect(
      storage.confirmIntroVideoUpload(
        userId,
        'users/99999999-9999-9999-9999-999999999999/intro-videos/a.mp4',
      ),
    ).rejects.toThrow();
    expect(client.send).not.toHaveBeenCalled();

    client.send.mockResolvedValueOnce({
      ContentType: 'video/mp4',
      ContentLength: 20 * MB,
    });
    await expect(
      storage.confirmIntroVideoUpload(
        userId,
        `users/${userId}/intro-videos/a.mp4`,
      ),
    ).resolves.toBe(`https://cdn.test/users/${userId}/intro-videos/a.mp4`);
  });

  it('xác nhận: video lớn hơn 50 MB bị từ chối và xoá', async () => {
    const client = { send: jest.fn() };
    client.send.mockResolvedValueOnce({
      ContentType: 'video/mp4',
      ContentLength: 51 * MB,
    });
    client.send.mockResolvedValueOnce({ Errors: [] });
    const storage = new StorageService(
      client as never,
      { bucket: 'b', publicBaseUrl: 'https://cdn.test' } as never,
    );

    await expect(
      storage.confirmIntroVideoUpload(
        userId,
        `users/${userId}/intro-videos/a.mp4`,
      ),
    ).rejects.toThrow();
  });
});
