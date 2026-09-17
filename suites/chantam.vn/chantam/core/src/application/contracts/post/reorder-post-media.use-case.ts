import {
  IReorderPostMediaBodyDto,
  IReorderPostMediaResponseDto,
} from '@chantam.vn/chantam.core-lib/dto';
import { IUseCase } from '@chantam/service.common-lib';

export interface IReorderPostMediaCommand extends IReorderPostMediaBodyDto {
  postId: string;
  userId: string;
}

export interface IReorderPostMediaResult extends IReorderPostMediaResponseDto {}

export interface IReorderPostMediaUseCase extends IUseCase<
  IReorderPostMediaCommand,
  IReorderPostMediaResult
> {}

export const IReorderPostMediaUseCase = Symbol('IReorderPostMediaUseCase');
