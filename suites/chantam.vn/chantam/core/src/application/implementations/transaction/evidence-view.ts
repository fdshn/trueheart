import { IGiftEvidenceItem } from '@/application/contracts/transaction';
import { IGiftEvidenceRef } from '@/domain/ports/repository';

/**
 * Ảnh bằng chứng kèm URL mở được.
 *
 * Dùng CHUNG cho hai bên trong cuộc và cho Admin: hai bản dựng URL riêng là hai chỗ
 * để một bên thấy ảnh còn bên kia thấy link chết. Bucket công khai, nên URL là
 * `storage.publicBaseUrl` + key — cùng kiểu URL ảnh bài đăng, không phải URL ký có hạn.
 */
export function toEvidenceItems(
  publicBaseUrl: string,
  refs: readonly IGiftEvidenceRef[],
): IGiftEvidenceItem[] {
  const base = publicBaseUrl.replace(/\/$/, '');
  return refs.map((item) => ({
    kind: item.kind,
    slot: item.slot,
    url: `${base}/${item.storageKey}`,
    uploadedBy: item.uploadedBy,
    createdAt: item.createdAt,
  }));
}
