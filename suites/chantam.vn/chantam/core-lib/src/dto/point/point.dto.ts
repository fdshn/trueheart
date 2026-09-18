import { IPaginationMetaDto } from '@chantam/service.common-lib/dto';

export interface IPointSummaryDto {
  balance: number;
  lifetime: number;
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
  balanceAfter: number;
  lifetimeAfter: number;
  source: string;
  reason: string | null;
  createdAt: Date;
}

export interface IGetOwnPointLedgerResponseDto {
  entries: IPointLedgerEntryDto[];
  meta: IPaginationMetaDto;
}
