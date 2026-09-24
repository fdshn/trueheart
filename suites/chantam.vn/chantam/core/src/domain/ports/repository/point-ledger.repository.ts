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
}

export const IPointLedgerRepository = Symbol('IPointLedgerRepository');
