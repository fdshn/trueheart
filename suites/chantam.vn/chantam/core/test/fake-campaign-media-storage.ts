import { IObjectStorage } from '@chantam/service.storage-lib';
import { randomUUID } from 'node:crypto';

/**
 * Kho lưu trữ giả cho các script DB thật: script đo SQL và ràng buộc, không đo R2.
 * Key đuôi `.mp4` là video, còn lại là ảnh. Vẫn kiểm tiền tố người dùng như bản thật.
 */
export function fakeCampaignMediaStorage(): IObjectStorage {
  return {
    confirmCampaignMediaUpload: async (userId: string, key: string) => {
      if (!key.startsWith(`users/${userId}/campaign-media/`))
        throw new Error(`key ${key} không thuộc ${userId}`);
      return {
        mediaType: key.endsWith('.mp4') ? 'VIDEO' : 'IMAGE',
        publicUrl: `https://cdn.chantam.test/${key}`,
      };
    },
  } as unknown as IObjectStorage;
}

/** Một key ảnh mới tinh dưới namespace của người dùng. */
export function freshMediaKey(userId: string, extension = 'webp'): string {
  return `users/${userId}/campaign-media/${randomUUID()}.${extension}`;
}
