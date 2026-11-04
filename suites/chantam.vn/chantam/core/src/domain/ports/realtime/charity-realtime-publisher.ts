import { CharityRealtimeSection } from '@chantam.vn/chantam.core-lib/models';

/**
 * Tín hiệu realtime của dự án từ thiện (CHARITY-PROJECT-LIFECYCLE §3.15).
 *
 * **Chỉ là tín hiệu, không mang dữ liệu**: `{ campaignId, sections, version }`. Client thấy tín
 * hiệu (hoặc vừa nối lại) thì gọi lại REST của đúng phần đó — REST là nguồn sự thật, nên lộ
 * dữ liệu qua socket là không thể và mất tín hiệu thì chỉ chậm chứ không sai.
 *
 * **Chỉ gọi SAU khi transaction đã commit** (như chat). Gộp theo dự án: nhiều tín hiệu trong
 * một giây thành một.
 */
export interface ICharityRealtimePublisher {
  /**
   * `public`: mọi người đang xem dự án (đã đăng nhập). `workspace`: ban tổ chức, coordinator,
   * Admin. Thay đổi công khai phát cả hai phòng.
   */
  signal(
    campaignId: string,
    sections: readonly CharityRealtimeSection[],
    audience: 'public' | 'workspace',
  ): void;
}

export const ICharityRealtimePublisher = Symbol('ICharityRealtimePublisher');
