import { IAdminAccessSummary } from '@/domain/ports/repository';
import { IUseCase } from '@chantam/service.common-lib';

export interface IGetOwnAdminAccessCommand {
  actorUserId: string;
  username: string;
}

export interface IGetOwnAdminAccessResult extends IAdminAccessSummary {
  userId: string;
  username: string;
}

export interface IGetOwnAdminAccessUseCase extends IUseCase<
  IGetOwnAdminAccessCommand,
  IGetOwnAdminAccessResult
> {}

export const IGetOwnAdminAccessUseCase = Symbol('IGetOwnAdminAccessUseCase');
