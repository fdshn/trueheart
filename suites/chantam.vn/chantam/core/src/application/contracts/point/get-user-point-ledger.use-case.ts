import { IGetOwnPointLedgerResponseDto } from '@chantam.vn/chantam.core-lib/dto';
import { IUseCase } from '@chantam/service.common-lib';

/** Sổ điểm của MỘT người dùng, xem từ CMS. */
export interface IGetUserPointLedgerCommand {
  actorUserId: string;
  userId: string;
  page?: number;
  pageSize?: number;
}

export interface IGetUserPointLedgerUseCase extends IUseCase<
  IGetUserPointLedgerCommand,
  IGetOwnPointLedgerResponseDto
> {}

export const IGetUserPointLedgerUseCase = Symbol('IGetUserPointLedgerUseCase');
