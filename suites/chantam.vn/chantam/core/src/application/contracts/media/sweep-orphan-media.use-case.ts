import { IUseCase } from '@chantam/service.common-lib';

export interface ISweepOrphanMediaCommand {
  /**
   * Chỉ báo cáo, không xoá gì.
   *
   * Mặc định của CLI là `true`: job này xoá dữ liệu không hoàn tác được, và
   * danh sách nguồn key thiếu một dòng là xoá sạch ảnh của cả một phân hệ. Phải
   * gõ rõ `--apply` mới xoá thật.
   */
  readonly dryRun?: boolean;
  /** Object phải già hơn ngần này giờ mới bị coi là mồ côi. Mặc định 24. */
  readonly minAgeHours?: number;
  /**
   * Chỉ quét dưới tiền tố này. Mặc định `users/` — toàn bộ vùng của ứng dụng.
   *
   * Thu hẹp được thì dọn theo từng người khi có sự cố, và script kiểm chạy
   * được mà không đụng tới object của phần còn lại.
   */
  readonly prefix?: string;
}

export interface ISweepOrphanMediaResult {
  readonly scanned: number;
  readonly orphans: number;
  readonly deleted: number;
  readonly reclaimedBytes: number;
  /** Số key đang được database trỏ tới — để soi khi con số mồ côi bất thường. */
  readonly liveKeys: number;
  readonly dryRun: boolean;
}

export interface ISweepOrphanMediaUseCase extends IUseCase<
  ISweepOrphanMediaCommand,
  ISweepOrphanMediaResult
> {}

export const ISweepOrphanMediaUseCase = Symbol('ISweepOrphanMediaUseCase');
