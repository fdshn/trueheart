import { ClassifiedStatusActions } from '@chantam.vn/chantam.core-lib/consts';
import { IPostEntity } from '@chantam.vn/chantam.core-lib/entities';
import { IUseCase } from '@chantam/service.common-lib';

export interface IUpdateClassifiedStatusCommand {
  userId: string;
  postId: string;
  status: `${ClassifiedStatusActions}`;
}

export interface IUpdateClassifiedStatusResult {
  post: IPostEntity;
}

export interface IUpdateClassifiedStatusUseCase extends IUseCase<
  IUpdateClassifiedStatusCommand,
  IUpdateClassifiedStatusResult
> {}

export const IUpdateClassifiedStatusUseCase = Symbol(
  'IUpdateClassifiedStatusUseCase',
);
