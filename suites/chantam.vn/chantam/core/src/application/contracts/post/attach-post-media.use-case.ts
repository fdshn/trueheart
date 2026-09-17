import {
  IAttachPostMediaBodyDto,
  IAttachPostMediaResponseDto,
} from '@chantam.vn/chantam.core-lib/dto';
import { IUseCase } from '@chantam/service.common-lib';

export interface IAttachPostMediaCommand extends IAttachPostMediaBodyDto {
  postId: string;
  userId: string;
}

export interface IAttachPostMediaResult extends IAttachPostMediaResponseDto {}

export interface IAttachPostMediaUseCase extends IUseCase<
  IAttachPostMediaCommand,
  IAttachPostMediaResult
> {}

export const IAttachPostMediaUseCase = Symbol('IAttachPostMediaUseCase');
