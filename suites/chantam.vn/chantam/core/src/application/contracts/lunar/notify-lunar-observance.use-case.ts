import { IUseCase } from '@chantam/service.common-lib/use-case';

export interface INotifyLunarObservanceCommand {
  readonly dryRun?: boolean;
  /** Bỏ trống thì lấy thời điểm hiện tại. Có mặt để kiểm chứng. */
  readonly at?: Date;
  /** Số người mỗi lô. Mặc định 500. */
  readonly batchSize?: number;
}

export interface INotifyLunarObservanceResult {
  /** Ngày âm lịch đã xét, dạng `dd/MM`. */
  readonly lunarDate: string;
  readonly observance: 'FULL_MOON' | 'NEW_MOON' | null;
  readonly holidayName: string | null;
  /**
   * `true` khi hôm nay không phải mốc nào và cũng không có ngày lễ — job thoát sớm.
   *
   * Trường riêng, không để lẫn với `notified: 0`: hai thứ nghĩa khác nhau. Một là "hôm nay
   * không có gì để nhắc" (đúng với ~25 ngày mỗi tháng), một là "có mốc mà không gửi được
   * cho ai". Người đọc log cron phải phân biệt được.
   */
  readonly skipped: boolean;
  readonly audience: number;
  readonly notified: number;
  /**
   * Số người đã có thông báo của đúng ngày này từ trước.
   *
   * Khoá chống trùng gắn ngày âm lịch, nên chạy lại job trong cùng ngày là vô hại — và con
   * số này nói rõ nó đã vô hại thật, chứ không phải gửi trùng mà không ai biết.
   */
  readonly alreadySent: number;
  readonly failed: number;
}

export interface INotifyLunarObservanceUseCase extends IUseCase<
  INotifyLunarObservanceCommand,
  INotifyLunarObservanceResult
> {}

export const INotifyLunarObservanceUseCase = Symbol(
  'INotifyLunarObservanceUseCase',
);
