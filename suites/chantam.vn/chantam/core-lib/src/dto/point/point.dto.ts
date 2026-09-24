import { IPaginationMetaDto } from '@chantam/service.common-lib/dto';

export interface IPointSummaryDto {
  /** Số điểm TIÊU ĐƯỢC. Kẹp ở 0, không bao giờ âm. */
  balance: number;
  /**
   * Giá trị THẬT sau mọi lần cộng/trừ. Âm nghĩa là đang hụt.
   *
   * Bằng `balance` trong trường hợp bình thường. Chỉ khác khi có khoản phạt
   * lớn hơn số dư lúc đó — giao diện nên nói rõ "đang âm N" thay vì để người
   * dùng thấy 0 mà không hiểu vì sao.
   */
  rawBalance: number;
  lifetime: number;
  /** Số lần được cộng điểm. */
  creditCount: number;
  /** Số lần bị trừ điểm. */
  debitCount: number;
}

export interface IGetOwnPointSummaryResponseDto {
  point: IPointSummaryDto;
}

export interface IGetOwnPointLedgerQueryDto {
  page?: number;
  pageSize?: number;
}

export interface IPointLedgerEntryDto {
  entryId: number;
  ruleCode: string;
  ruleVersion: number;
  delta: number;
  /** Số tiêu được ngay sau bút toán này. Kẹp ở 0. */
  balanceAfter: number;
  /**
   * Giá trị THẬT ngay sau bút toán này, có thể âm.
   *
   * Giao diện đọc cặp `delta` + `rawBalanceAfter` để hiện đúng một dòng như
   * "trừ 50 điểm, đang âm 30" — thứ mà `balanceAfter` một mình không nói được.
   */
  rawBalanceAfter: number;
  /**
   * Dòng chữ mô tả sẵn, ví dụ `-50 diem, dang am 30 diem`.
   *
   * Dung o may chu de web va app doc cung mot chuoi. Client muon tu trinh bay
   * thi dung `delta` va `rawBalanceAfter` ben tren.
   */
  note: string;
  lifetimeAfter: number;
  source: string;
  reason: string | null;
  createdAt: Date;
}

export interface IGetOwnPointLedgerResponseDto {
  entries: IPointLedgerEntryDto[];
  meta: IPaginationMetaDto;
}

export interface IAdminPointRuleDto {
  code: string;
  points: number;
  enabled: boolean;
  affectsLifetime: boolean;
  dailyCap: number | null;
  version: number;
  updatedAt: Date;
}

export interface IGetAdminPointRulesResponseDto {
  pointRules: IAdminPointRuleDto[];
}

export interface IPublishAdminPointRuleDto {
  code: string;
  points: number;
  enabled: boolean;
  affectsLifetime: boolean;
  dailyCap: number | null;
  changeReason: string;
}

export interface IPublishAdminPointRuleBodyDto {
  pointRule: IPublishAdminPointRuleDto;
}

export interface IPublishAdminPointRuleResponseDto {
  pointRule: IAdminPointRuleDto;
}

export interface IReversePointEntryDto {
  /** Vì sao hoàn. Bắt buộc — một bút toán đảo mà không có lý do là không giải thích được. */
  reason: string;
}

export interface IReversePointEntryBodyDto {
  reversal: IReversePointEntryDto;
}

export interface IReversePointEntryResponseDto {
  reversal: {
    /** Bút toán HOÀN vừa ghi, không phải bút toán gốc. */
    entryId: number;
    delta: number;
    balance: number;
    rawBalance: number;
    lifetime: number;
  };
}
