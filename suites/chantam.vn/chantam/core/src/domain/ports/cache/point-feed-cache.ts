import { IPointFeedResponseDto } from '@chantam.vn/chantam.core-lib/dto';

/**
 * Đệm ngắn của bảng tin điểm CHUNG (CR 22/11/2026) — mọi người xem cùng thấy một bản trong
 * vài giây, database không phải trả lời từng lượt hỏi. Không được ném: Redis chết chỉ là chậm
 * thêm một truy vấn.
 */
export interface IPointFeedCache {
  read(key: string): Promise<IPointFeedResponseDto | null>;
  write(key: string, value: IPointFeedResponseDto): Promise<void>;
}

export const IPointFeedCache = Symbol('IPointFeedCache');
