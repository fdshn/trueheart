import {
  IRenewPostParamsDto,
  IRenewPostResponseDto,
} from '@chantam.vn/chantam.core-lib/dto';
import { IUseCase } from '@chantam/service.common-lib';

export interface IRenewPostCommand extends IRenewPostParamsDto {
  userId: string;
}

export interface IRenewPostResult extends IRenewPostResponseDto {}

export interface IRenewPostUseCase extends IUseCase<
  IRenewPostCommand,
  IRenewPostResult
> {}

export const IRenewPostUseCase = Symbol('IRenewPostUseCase');
