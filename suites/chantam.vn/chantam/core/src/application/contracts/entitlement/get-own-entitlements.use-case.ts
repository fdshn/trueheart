import { IGetOwnEntitlementsResponseDto } from '@chantam.vn/chantam.core-lib/dto';
import { IUseCase } from '@chantam/service.common-lib';

export interface IGetOwnEntitlementsCommand {
  userId: string;
}

export interface IGetOwnEntitlementsUseCase extends IUseCase<
  IGetOwnEntitlementsCommand,
  IGetOwnEntitlementsResponseDto
> {}

export const IGetOwnEntitlementsUseCase = Symbol('IGetOwnEntitlementsUseCase');
