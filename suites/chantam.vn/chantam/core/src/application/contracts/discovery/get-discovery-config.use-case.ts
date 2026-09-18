import { IDiscoveryConfigResponseDto } from '@chantam.vn/chantam.core-lib/dto';
import { IUseCase } from '@chantam/service.common-lib';

export interface IGetDiscoveryConfigCommand {}

export interface IGetDiscoveryConfigResult extends IDiscoveryConfigResponseDto {}

export interface IGetDiscoveryConfigUseCase extends IUseCase<
  IGetDiscoveryConfigCommand,
  IGetDiscoveryConfigResult
> {}

export const IGetDiscoveryConfigUseCase = Symbol('IGetDiscoveryConfigUseCase');
