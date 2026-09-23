import { IAdminPostSummary } from '@/domain/ports/repository';
import { IPublicPostMediaDto } from '@chantam.vn/chantam.core-lib/dto';
import { IUseCase } from '@chantam/service.common-lib';

export interface IGetAdminPostCommand {
  actorUserId: string;
  postId: string;
}

export interface IGetAdminPostResult {
  post: IAdminPostSummary;
  media: IPublicPostMediaDto[];
}

export interface IGetAdminPostUseCase extends IUseCase<
  IGetAdminPostCommand,
  IGetAdminPostResult
> {}

export const IGetAdminPostUseCase = Symbol('IGetAdminPostUseCase');
