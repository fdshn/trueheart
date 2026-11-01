import {
  AttributionPlatforms,
  AttributionRiskStatuses,
} from '@chantam.vn/chantam.core-lib/consts';
import {
  IClaimAttributionResponseDto,
  ICreateAttributionLinkDto,
  ICreateAttributionLinkResponseDto,
  IListAttributionClaimsResponseDto,
  IRecordAttributionClickResponseDto,
  IResolveAttributionResponseDto,
  IReviewAttributionClaimResponseDto,
  IRevokeAttributionLinksDto,
  IRevokeAttributionLinksResponseDto,
} from '@chantam.vn/chantam.core-lib/dto';
import { IUseCase } from '@chantam/service.common-lib';

export interface ICreateAttributionLinkCommand {
  userId: string;
  link: ICreateAttributionLinkDto;
}
export interface ICreateAttributionLinkUseCase extends IUseCase<
  ICreateAttributionLinkCommand,
  ICreateAttributionLinkResponseDto
> {}
export const ICreateAttributionLinkUseCase = Symbol(
  'ICreateAttributionLinkUseCase',
);

export interface IRecordAttributionClickCommand {
  code: string;
  clientIp: string;
  userAgent: string | null;
}
export interface IRecordAttributionClickUseCase extends IUseCase<
  IRecordAttributionClickCommand,
  IRecordAttributionClickResponseDto
> {}
export const IRecordAttributionClickUseCase = Symbol(
  'IRecordAttributionClickUseCase',
);

export interface IResolveAttributionCommand {
  token: string;
  installId: string;
  platform: AttributionPlatforms;
  clientIp: string;
}
export interface IResolveAttributionUseCase extends IUseCase<
  IResolveAttributionCommand,
  IResolveAttributionResponseDto
> {}
export const IResolveAttributionUseCase = Symbol('IResolveAttributionUseCase');

export interface IClaimAttributionCommand {
  userId: string;
  attributionToken: string;
  clientIp: string;
}
export interface IClaimAttributionUseCase extends IUseCase<
  IClaimAttributionCommand,
  IClaimAttributionResponseDto
> {}
export const IClaimAttributionUseCase = Symbol('IClaimAttributionUseCase');

export interface IListAttributionClaimsCommand {
  riskStatus?: AttributionRiskStatuses;
  page?: number;
  pageSize?: number;
}
export interface IListAttributionClaimsUseCase extends IUseCase<
  IListAttributionClaimsCommand,
  IListAttributionClaimsResponseDto
> {}
export const IListAttributionClaimsUseCase = Symbol(
  'IListAttributionClaimsUseCase',
);

export interface IReviewAttributionClaimCommand {
  reviewerId: string;
  claimId: string;
  decision: 'APPROVE' | 'REJECT';
  note: string;
}
export interface IReviewAttributionClaimUseCase extends IUseCase<
  IReviewAttributionClaimCommand,
  IReviewAttributionClaimResponseDto
> {}
export const IReviewAttributionClaimUseCase = Symbol(
  'IReviewAttributionClaimUseCase',
);

export interface IRevokeAttributionLinksCommand {
  actorId: string;
  revocation: IRevokeAttributionLinksDto;
}
export interface IRevokeAttributionLinksUseCase extends IUseCase<
  IRevokeAttributionLinksCommand,
  IRevokeAttributionLinksResponseDto
> {}
export const IRevokeAttributionLinksUseCase = Symbol(
  'IRevokeAttributionLinksUseCase',
);
