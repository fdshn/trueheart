import {
  IAffiliateEventRow,
  IAffiliatePolicyRevision,
  IAffiliateRewardRow,
} from '@/domain/ports/repository';
import {
  AffiliateGeoStatus,
  IAffiliatePolicy,
} from '@chantam.vn/chantam.core-lib/models';
import { IUseCase } from '@chantam/service.common-lib';

export interface IGetAffiliatePolicyCommand {
  actorUserId: string;
}
export interface IGetAffiliatePolicyResult {
  active: IAffiliatePolicyRevision | null;
  history: IAffiliatePolicyRevision[];
}
export type IGetAffiliatePolicyUseCase = IUseCase<
  IGetAffiliatePolicyCommand,
  IGetAffiliatePolicyResult
>;
export const IGetAffiliatePolicyUseCase = Symbol('IGetAffiliatePolicyUseCase');

export interface IPublishAffiliatePolicyCommand {
  actorUserId: string;
  expectedVersion?: number | null;
  policy: IAffiliatePolicy;
  effectiveAt?: Date;
  reason: string;
}
export type IPublishAffiliatePolicyUseCase = IUseCase<
  IPublishAffiliatePolicyCommand,
  { policy: IAffiliatePolicyRevision }
>;
export const IPublishAffiliatePolicyUseCase = Symbol(
  'IPublishAffiliatePolicyUseCase',
);

export interface IListAffiliateEventsCommand {
  actorUserId: string;
  groupId?: string;
  geoStatus?: AffiliateGeoStatus;
  page?: number;
  pageSize?: number;
}
export interface IListAffiliateEventsResult {
  events: IAffiliateEventRow[];
  meta: unknown;
}
export type IListAffiliateEventsUseCase = IUseCase<
  IListAffiliateEventsCommand,
  IListAffiliateEventsResult
>;
export const IListAffiliateEventsUseCase = Symbol(
  'IListAffiliateEventsUseCase',
);

export interface IGetAffiliateEventRewardsCommand {
  actorUserId: string;
  eventId: string;
}
export type IGetAffiliateEventRewardsUseCase = IUseCase<
  IGetAffiliateEventRewardsCommand,
  { rewards: IAffiliateRewardRow[] }
>;
export const IGetAffiliateEventRewardsUseCase = Symbol(
  'IGetAffiliateEventRewardsUseCase',
);

export interface IReverseAffiliateEventCommand {
  actorUserId: string;
  eventId: string;
  reason: string;
}
export type IReverseAffiliateEventUseCase = IUseCase<
  IReverseAffiliateEventCommand,
  { reversedCount: number; pointsReclaimed: number }
>;
export const IReverseAffiliateEventUseCase = Symbol(
  'IReverseAffiliateEventUseCase',
);
