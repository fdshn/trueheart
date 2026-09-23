import { ContentSubjectTypes } from '@chantam.vn/chantam.core-lib/consts';

export interface IRecordShareParams {
  readonly subjectType: ContentSubjectTypes;
  readonly subjectId: string;
  readonly userId: string;
  /** Kênh người dùng chọn, tối đa 40 ký tự. `null` khi client không gửi. */
  readonly channel: string | null;
}

export interface IRecordShareResult {
  /** Tổng lượt chia sẻ sau lần ghi, đọc từ cột đếm trên chủ thể. */
  readonly shareCount: number;
}

export interface IContentShareRepository {
  /**
   * Ghi một lượt chia sẻ và tăng `share_count` trong **cùng transaction**.
   *
   * Append-only: cùng một người chia sẻ hai lần là hai dòng — đây là đếm lượt
   * mở khay, không phải "đã từng chia sẻ hay chưa".
   */
  recordShare(params: IRecordShareParams): Promise<IRecordShareResult>;
}

export const IContentShareRepository = Symbol('IContentShareRepository');
