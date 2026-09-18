import {
  IGetOwnPointLedgerQueryDto,
  IGetOwnPointLedgerResponseDto,
} from '@chantam.vn/chantam.core-lib/dto';
import { IUseCase } from '@chantam/service.common-lib';

export interface IGetOwnPointLedgerCommand extends IGetOwnPointLedgerQueryDto {
  userId: string;
}

export interface IGetOwnPointLedgerUseCase extends IUseCase<
  IGetOwnPointLedgerCommand,
  IGetOwnPointLedgerResponseDto
> {}

export const IGetOwnPointLedgerUseCase = Symbol('IGetOwnPointLedgerUseCase');
