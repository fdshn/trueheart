import { UserRanks } from '../../consts';

export interface IEntitlementDto {
  code: string;
  allowed: boolean;
  limit: number | null;
  used: number;
  remaining: number | null;
  reasonCode: string | null;
}

export interface IEntitlementsSummaryDto {
  rank: UserRanks;
  policyRevisionId: number;
  capabilities: IEntitlementDto[];
}

export interface IGetOwnEntitlementsResponseDto {
  entitlements: IEntitlementsSummaryDto;
}

/** Giá trị của một capability tại một bậc rank. */
export interface IEntitlementPolicyRankValueDto {
  rank: UserRanks;
  allowed: boolean;
  /** `null` nghĩa là không giới hạn số lượng, khác hẳn với `0` là cấm hẳn. */
  limit: number | null;
}

export interface IEntitlementPolicyCapabilityDto {
  code: string;
  /** Tắt ở đây là tắt cho mọi rank, bất kể từng rank cho phép hay không. */
  enabled: boolean;
  ranks: IEntitlementPolicyRankValueDto[];
}

export interface IEntitlementPolicyRevisionDto {
  revisionId: number;
  effectiveFrom: Date;
  changeReason: string | null;
  capabilities: IEntitlementPolicyCapabilityDto[];
}

export interface IGetEntitlementPolicyResponseDto {
  policy: IEntitlementPolicyRevisionDto;
}

export interface IPublishEntitlementPolicyResponseDto {
  policy: IEntitlementPolicyRevisionDto;
}
