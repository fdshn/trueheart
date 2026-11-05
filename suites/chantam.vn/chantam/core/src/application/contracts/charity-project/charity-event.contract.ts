import {
  ICharityEventStep,
  ICharityEventStepPatch,
  ICharityPost,
} from '@/domain/ports/repository';
import {
  CharityPostAuthorRole,
  CharityPostMediaType,
} from '@chantam.vn/chantam.core-lib/models';
import { IUseCase } from '@chantam/service.common-lib';
import { IStorageUploadResult } from '@chantam/service.storage-lib';
import { ICharityProjectCommand } from './charity-project.contract';

/** Dự án từ thiện 4 giai đoạn — đợt 3 (CHARITY-PROJECT-LIFECYCLE §3.5, §3.15). */

export interface ICharityEventStepView extends ICharityEventStep {
  label: string;
}

export interface IGetCharityEventStepsUseCase extends IUseCase<
  { idOrSlug: string },
  ICharityEventStepView[]
> {}
export const IGetCharityEventStepsUseCase = Symbol(
  'IGetCharityEventStepsUseCase',
);

export interface IUpdateCharityEventStepCommand extends ICharityProjectCommand {
  readonly stepId: string;
  readonly patch: ICharityEventStepPatch;
}
export interface IUpdateCharityEventStepUseCase extends IUseCase<
  IUpdateCharityEventStepCommand,
  ICharityEventStepView
> {}
export const IUpdateCharityEventStepUseCase = Symbol(
  'IUpdateCharityEventStepUseCase',
);

export interface ICharityPostQuotaView {
  /** `null` = chưa được đăng vào dự án này lúc này. */
  role: CharityPostAuthorRole | null;
  canPost: boolean;
  image: { used: number; limit: number };
  video: { used: number; limit: number };
  /** Đầu ngày (giờ Việt Nam) đang tính quota. */
  windowStartsAt: Date;
}
export interface IGetCharityPostQuotaUseCase extends IUseCase<
  ICharityProjectCommand,
  ICharityPostQuotaView
> {}
export const IGetCharityPostQuotaUseCase = Symbol(
  'IGetCharityPostQuotaUseCase',
);

export interface IRequestCharityPostUploadCommand extends ICharityProjectCommand {
  readonly contentType: string;
  readonly contentLength: number;
}
export interface IRequestCharityPostUploadUseCase extends IUseCase<
  IRequestCharityPostUploadCommand,
  {
    upload: IStorageUploadResult;
    quota: { mediaType: CharityPostMediaType; used: number; limit: number };
  }
> {}
export const IRequestCharityPostUploadUseCase = Symbol(
  'IRequestCharityPostUploadUseCase',
);

export interface ICreateCharityPostCommand extends ICharityProjectCommand {
  readonly body: string | null;
  readonly mediaKeys: string[];
}
export interface ICreateCharityPostUseCase extends IUseCase<
  ICreateCharityPostCommand,
  ICharityPost
> {}
export const ICreateCharityPostUseCase = Symbol('ICreateCharityPostUseCase');

export interface IListCharityPostsCommand {
  readonly idOrSlug: string;
  readonly beforePostId: string | null;
  readonly limit: number;
}
export interface IListCharityPostsUseCase extends IUseCase<
  IListCharityPostsCommand,
  { posts: ICharityPost[]; nextBefore: string | null }
> {}
export const IListCharityPostsUseCase = Symbol('IListCharityPostsUseCase');

export interface IDeleteCharityPostCommand extends ICharityProjectCommand {
  readonly postId: string;
}
export interface IDeleteCharityPostUseCase extends IUseCase<
  IDeleteCharityPostCommand,
  { deleted: true }
> {}
export const IDeleteCharityPostUseCase = Symbol('IDeleteCharityPostUseCase');
