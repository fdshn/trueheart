import { assertAvatarUploadPolicy } from './storage.service';

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
