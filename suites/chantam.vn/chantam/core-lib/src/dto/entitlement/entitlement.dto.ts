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
