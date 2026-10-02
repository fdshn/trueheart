import {
  IAppendPointEntryCommand,
  IAppendPointEntryResult,
} from '@/application/contracts/point';
import { EntityManager } from 'typeorm';

export interface IPointLedgerSummary {
  /** Số điểm TIÊU ĐƯỢC. Kẹp ở 0, không bao giờ âm. */
  balance: number;
  /**
   * Giá trị THẬT sau mọi lần cộng/trừ. Âm nghĩa là đang hụt.
   *
   * Tách khỏi `balance` vì hai con số trả lời hai câu khác nhau: `balance` là
   * "tiêu được bao nhiêu", `rawBalance` là "đang đứng ở đâu". Gộp làm một thì
   * phạt 50 điểm người đang có 20 sẽ chỉ hiện ra là "về 0", và không ai biết họ
   * hụt 30 hay hụt 300.
   */
  rawBalance: number;
  lifetime: number;
  /** Số lần được cộng điểm. */
  creditCount: number;
  /** Số lần bị trừ điểm. */
  debitCount: number;
}

export interface IPointLedgerEntry {
  entryId: number;
  ruleCode: string;
  ruleVersion: number;
  delta: number;
  balanceAfter: number;
  /** Giá trị thật ngay sau bút toán này. Âm nghĩa là lúc đó đang hụt. */
  rawBalanceAfter: number;
  note: string;
  lifetimeAfter: number;
  source: string;
  reason: string | null;
  createdAt: Date;
}

export interface IPointLedgerPage {
  entries: IPointLedgerEntry[];
  total: number;
}

export interface IPointLedgerHistoryQuery {
  skip: number;
  take: number;
}

export interface IReversePointEntryParams {
  readonly entryId: number;
  readonly actorUserId: string;
  readonly reason: string;
}

export type ReversePointEntryOutcome =
  | {
      status: 'REVERSED';
      /** Chủ tài khoản bị ảnh hưởng — nơi gọi cần để tính lại hạng. */
      userId: string;
      result: IAppendPointEntryResult;
    }
  /** Bút toán không tồn tại. */
  | { status: 'NOT_FOUND' }
  /** Đã hoàn rồi, hoặc chính nó là một bút toán hoàn. */
  | { status: 'NOT_REVERSIBLE' };

export interface IPointLedgerRepository {
  /**
   * Đảo một bút toán đã ghi bằng cách ghi THÊM một bút toán ngược.
   *
   * Không sửa dòng cũ: ledger chỉ ghi thêm, và một trigger ở database chặn mọi
   * UPDATE. Lịch sử phải đọc ra được cả cái sai lẫn cái sửa.
   *
   * Khoá chống trùng theo bút toán gốc, nên hai Admin bấm cùng lúc chỉ hoàn
   * một lần.
   */
  reverseEntry(
    params: IReversePointEntryParams,
  ): Promise<ReversePointEntryOutcome>;
  appendByRule(
    command: IAppendPointEntryCommand,
  ): Promise<IAppendPointEntryResult>;
  /**
   * Ghi một bút toán với số điểm TRUYỀN VÀO, không lấy từ `point_rules`.
   *
   * Cần cho những khoản mà số điểm thay đổi theo từng lần: phạt trượt nhiệm vụ
   * duy trì (mức nằm ở `rank_tiers` theo từng bậc) và đổi vật phẩm bằng điểm
   * (tính từ giá món chia tỷ lệ quy đổi). Cả hai không vừa khuôn `point_rules`
   * vì bảng đó giữ MỘT con số cố định cho mỗi mã.
   *
   * Vẫn append-only, vẫn idempotent, và **bắt buộc có `reason`**: người bị trừ
   * điểm sẽ hỏi vì sao, và một mã rule không phải câu trả lời.
   *
   * `lifetime` không bao giờ giảm theo đường này — khoản trừ là một sự kiện có
   * thật, không phải lời phủ nhận một khoản cộng trước đó. Muốn phủ nhận thì
   * dùng `reversePointEntry`.
   */
  appendAdjustment(command: {
    userId: string;
    /** Mã phân loại, ghi vào `rule_code`. Không cần tồn tại trong `point_rules`. */
    ruleCode: string;
    /** Khác 0. Âm là khoản trừ. */
    delta: number;
    referenceType: string;
    referenceId: string;
    idempotencyKey: string;
    actor: string;
    source: string;
    reason: string;
  }): Promise<IAppendPointEntryResult>;

  /**
   * `appendAdjustment` nhưng chạy TRONG transaction đã mở của nơi gọi.
   *
   * Cần cho những nghiệp vụ mà bút toán phải commit cùng lúc với dữ liệu sinh ra
   * nó: điểm danh (F83) ghi lịch, cập nhật chuỗi và cộng điểm trong một lượt, và
   * một lịch đã đánh dấu mà thiếu điểm là trạng thái không có đường sửa — bảng
   * điểm danh chỉ ghi thêm.
   *
   * Khác `appendByRuleWithinTransaction` ở chỗ số điểm TRUYỀN VÀO chứ không tra
   * `point_rules`: mức của điểm danh nằm ở `check_in_policy_revisions`, và tạo
   * bản sao con số sang `point_rules` là mở đường cho hai nơi nói hai mức.
   */
  appendAdjustmentWithinTransaction(
    manager: EntityManager,
    command: {
      userId: string;
      ruleCode: string;
      delta: number;
      referenceType: string;
      referenceId: string;
      idempotencyKey: string;
      actor: string;
      source: string;
      reason: string;
    },
  ): Promise<IAppendPointEntryResult>;

  appendByRuleWithinTransaction(
    manager: EntityManager,
    command: IAppendPointEntryCommand,
  ): Promise<IAppendPointEntryResult>;
  getSummary(userId: string): Promise<IPointLedgerSummary>;
  getHistory(
    userId: string,
    query: IPointLedgerHistoryQuery,
  ): Promise<IPointLedgerPage>;
  /**
   * Những người đã xác minh SĐT nhưng chưa có bút toán thưởng.
   *
   * Xác minh SĐT và ghi thưởng là hai bước riêng, nên tiến trình chết giữa
   * chừng là mất thưởng vĩnh viễn — người dùng không có cách nào xác minh lại
   * để được thưởng. Đây là đầu vào cho job đối soát chạy từ scheduler ngoài.
   */
  findPhoneVerifiedUsersMissingReward(limit: number): Promise<string[]>;

  /**
   * Người đã hoàn tất onboarding mà thiếu bút toán `ONBOARDING_COMPLETED`.
   *
   * Tín hiệu là `rank <> 'VIEWER'`: đường duy nhất ra khỏi VIEWER là hoàn tất
   * onboarding, nên hạng khác VIEWER đồng nghĩa với đã hoàn tất. Đọc hạng chứ
   * không đọc bảng nhiệm vụ vì hạng là thứ đã commit — còn bảng nhiệm vụ có thể
   * đủ điều kiện mà lần chạy kia chưa kịp ghi gì.
   */
  findOnboardedUsersMissingReward(limit: number): Promise<string[]>;
}

export const IPointLedgerRepository = Symbol('IPointLedgerRepository');
