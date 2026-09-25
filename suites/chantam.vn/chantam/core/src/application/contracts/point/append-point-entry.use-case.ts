import { IUseCase } from '@chantam/service.common-lib';

export interface IAppendPointEntryCommand {
  userId: string;
  ruleCode: string;
  referenceType: string;
  referenceId: string;
  idempotencyKey: string;
  actor: string;
  source: string;
  /**
   * Lý do, ghi thẳng vào `point_ledger.reason`.
   *
   * Cột này có sẵn từ migration đầu nhưng chưa nơi nào ghi. Với khoản CỘNG thì
   * mã rule đã đủ giải thích; với khoản TRỪ thì không — người bị trừ điểm sẽ
   * hỏi vì sao, và "SHIP_UNPAID_PENALTY" không phải một câu trả lời.
   */
  reason?: string;
  /**
   * Nhân số điểm của rule với phần trăm này (0–100). Bỏ trống là 100%.
   *
   * Dùng cho F40: rule `GIFT_COMPLETED` giữ mức TRẦN của một lượt trao, còn số
   * thực nhận là trần đó nhân với mức chính xác người nhận chấm.
   *
   * Chỉ áp cho khoản CỘNG. Một khoản phạt "nhân 60%" không có nghĩa nghiệp vụ
   * nào, và cho phép nó là mở đường giảm nhẹ hình phạt bằng một tham số không ai
   * nhìn thấy.
   *
   * Kết quả LÀM TRÒN về số nguyên: 56 × 43% = 24,08 → 24. Điểm là số nguyên ở
   * mọi nơi khác trong hệ thống, nên giữ phần thập phân ở đúng một chỗ sẽ làm
   * mọi phép đối soát lệch.
   *
   * `0%` vẫn GHI một bút toán delta = 0, không phải bỏ qua. Bút toán đó là bằng
   * chứng "lượt trao này đã được chấm, và chấm 0" — nó chiếm khoá chống trùng
   * nên job áp mức mặc định sau này không trả thưởng cho một lượt bị chấm 0.
   */
  multiplierPercent?: number;
}

export interface IAppendPointEntryResult {
  entryId: number;
  /** Mức thay đổi của bút toán này. Âm là khoản trừ. */
  delta: number;
  /** Số điểm TIÊU ĐƯỢC sau bút toán. Kẹp ở 0. */
  balance: number;
  /** Giá trị THẬT sau bút toán, có thể âm. */
  rawBalance: number;
  lifetime: number;
  /**
   * `false` khi `idempotencyKey` đã tồn tại, tức bút toán này đã ghi từ trước
   * và lần gọi hiện tại KHÔNG đổi gì.
   *
   * Nơi gọi cần phân biệt để không báo với người dùng rằng vừa trừ điểm trong
   * khi thực ra không trừ thêm đồng nào.
   */
  applied: boolean;
}

export interface IAppendPointEntryUseCase extends IUseCase<
  IAppendPointEntryCommand,
  IAppendPointEntryResult
> {}

export const IAppendPointEntryUseCase = Symbol('IAppendPointEntryUseCase');
