import {
  ICharityAppeal,
  ICharityAppealAdminView,
  ICharityAppealEvent,
} from '@/domain/ports/repository';
import {
  CharityAppealStatus,
  CharityAppealTargetType,
} from '@chantam.vn/chantam.core-lib/models';
import { IUseCase } from '@chantam/service.common-lib';
import { ICharityProjectCommand } from './charity-project.contract';

/** Dự án từ thiện 4 giai đoạn — đợt 4b: khiếu nại hai tầng (CHARITY-PROJECT-LIFECYCLE §3.16). */

export interface ISubmitCharityAppealCommand extends ICharityProjectCommand {
  readonly targetType: CharityAppealTargetType;
  /** `EVALUATION` → id lần chấm; `ITEM_VALUE` → id lượt giao nhận. */
  readonly targetId: string;
  readonly requestedValue: number | null;
  readonly description: string;
  readonly evidenceUrls: string[];
}
export interface ISubmitCharityAppealUseCase extends IUseCase<
  ISubmitCharityAppealCommand,
  ICharityAppeal
> {}
export const ISubmitCharityAppealUseCase = Symbol(
  'ISubmitCharityAppealUseCase',
);

export interface ICharityAppealDetail {
  appeal: ICharityAppeal;
  events: ICharityAppealEvent[];
}

export interface IListCharityAppealsUseCase extends IUseCase<
  ICharityProjectCommand,
  ICharityAppeal[]
> {}
export const IListCharityAppealsUseCase = Symbol('IListCharityAppealsUseCase');

export interface IListMyCharityAppealsUseCase extends IUseCase<
  { userId: string },
  ICharityAppeal[]
> {}
export const IListMyCharityAppealsUseCase = Symbol(
  'IListMyCharityAppealsUseCase',
);

export interface IGetCharityAppealCommand {
  readonly userId: string;
  readonly appealId: string;
}
export interface IGetCharityAppealUseCase extends IUseCase<
  IGetCharityAppealCommand,
  ICharityAppealDetail
> {}
export const IGetCharityAppealUseCase = Symbol('IGetCharityAppealUseCase');

export type CharityAppealOrganizerAction = 'ADJUST' | 'KEEP';
export type CharityAppealAppellantAction = 'ACCEPT' | 'ESCALATE';
export type CharityAppealAdminAction = 'ADJUST' | 'KEEP' | 'REJECT';

export interface IActOnCharityAppealCommand {
  readonly userId: string;
  readonly appealId: string;
  readonly action: CharityAppealOrganizerAction | CharityAppealAppellantAction;
  readonly value: number | null;
  readonly reason: string | null;
}
/** Một route cho cả hai bên ở tầng 1: ban tổ chức ADJUST/KEEP, người khiếu nại ACCEPT/ESCALATE. */
export interface IActOnCharityAppealUseCase extends IUseCase<
  IActOnCharityAppealCommand,
  ICharityAppeal
> {}
export const IActOnCharityAppealUseCase = Symbol('IActOnCharityAppealUseCase');

export interface IListAdminCharityAppealsUseCase extends IUseCase<
  {
    userId: string;
    status: CharityAppealStatus | null;
    page: number;
    pageSize: number;
  },
  ICharityAppealAdminView[]
> {}
export const IListAdminCharityAppealsUseCase = Symbol(
  'IListAdminCharityAppealsUseCase',
);

export interface IDecideAdminCharityAppealCommand {
  readonly userId: string;
  readonly appealId: string;
  readonly action: CharityAppealAdminAction | 'REOPEN';
  readonly value: number | null;
  readonly reason: string;
}
export interface IDecideAdminCharityAppealUseCase extends IUseCase<
  IDecideAdminCharityAppealCommand,
  ICharityAppeal
> {}
export const IDecideAdminCharityAppealUseCase = Symbol(
  'IDecideAdminCharityAppealUseCase',
);

export interface IProcessCharityAppealSlaUseCase extends IUseCase<
  { dryRun: boolean; limit: number },
  { escalated: number; autoClosed: number; overdue: number }
> {}
export const IProcessCharityAppealSlaUseCase = Symbol(
  'IProcessCharityAppealSlaUseCase',
);

export interface IProcessCharityPointsUseCase extends IUseCase<
  { dryRun: boolean; limit: number },
  {
    backfilled: number;
    zeroed: number;
    settled: number;
    applied: number;
    deferred: number;
  }
> {}
export const IProcessCharityPointsUseCase = Symbol(
  'IProcessCharityPointsUseCase',
);
