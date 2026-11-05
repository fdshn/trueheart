import { ICharityParticipation } from '@/domain/ports/repository';
import {
  CharityParticipationDecision,
  CharityParticipationStatus,
} from '@chantam.vn/chantam.core-lib/models';
import { IUseCase } from '@chantam/service.common-lib';
import { ICharityProjectCommand } from './charity-project.contract';

/**
 * Dự án từ thiện — đợt 5a: vòng đời participant (CHARITY-PROJECT-LIFECYCLE §3.11, chốt 05/11).
 * Tham gia độc lập với đóng góp; ảnh/clip sự kiện và chấm điểm chỉ cho người đã check-in.
 */

export interface IListCharityParticipationsCommand extends ICharityProjectCommand {
  readonly status: CharityParticipationStatus | null;
}
export interface IListCharityParticipationsUseCase extends IUseCase<
  IListCharityParticipationsCommand,
  ICharityParticipation[]
> {}
export const IListCharityParticipationsUseCase = Symbol(
  'IListCharityParticipationsUseCase',
);

export interface IDecideCharityParticipationCommand extends ICharityProjectCommand {
  readonly participationId: string;
  readonly action: CharityParticipationDecision;
  readonly reason: string | null;
}
export interface IDecideCharityParticipationUseCase extends IUseCase<
  IDecideCharityParticipationCommand,
  ICharityParticipation
> {}
export const IDecideCharityParticipationUseCase = Symbol(
  'IDecideCharityParticipationUseCase',
);

export interface ICheckInCharityParticipationCommand extends ICharityProjectCommand {
  readonly participationId: string;
}
export interface ICheckInCharityParticipationUseCase extends IUseCase<
  ICheckInCharityParticipationCommand,
  ICharityParticipation
> {}
export const ICheckInCharityParticipationUseCase = Symbol(
  'ICheckInCharityParticipationUseCase',
);

/** Lượt tham gia của chính người gọi — `null` khi chưa từng đăng ký. */
export interface IGetMyCharityParticipationUseCase extends IUseCase<
  ICharityProjectCommand,
  ICharityParticipation | null
> {}
export const IGetMyCharityParticipationUseCase = Symbol(
  'IGetMyCharityParticipationUseCase',
);
