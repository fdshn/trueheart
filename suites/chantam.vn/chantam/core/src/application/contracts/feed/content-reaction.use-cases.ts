import {
  ContentSubjectTypes,
  ReactionKinds,
} from '@chantam.vn/chantam.core-lib/consts';
import {
  IListReactionsResponseDto,
  IReactionSummaryDto,
} from '@chantam.vn/chantam.core-lib/dto';
import { IUseCase } from '@chantam/service.common-lib';

export interface ISetContentReactionCommand {
  userId: string;
  subjectType: ContentSubjectTypes;
  subjectId: string;
  kind: ReactionKinds;
}

export interface ISetContentReactionResult {
  reaction: IReactionSummaryDto;
}

export interface ISetContentReactionUseCase extends IUseCase<
  ISetContentReactionCommand,
  ISetContentReactionResult
> {}

export const ISetContentReactionUseCase = Symbol('ISetContentReactionUseCase');

export interface IRemoveContentReactionCommand {
  userId: string;
  subjectType: ContentSubjectTypes;
  subjectId: string;
}

export interface IRemoveContentReactionResult {
  reaction: IReactionSummaryDto;
}

export interface IRemoveContentReactionUseCase extends IUseCase<
  IRemoveContentReactionCommand,
  IRemoveContentReactionResult
> {}

export const IRemoveContentReactionUseCase = Symbol(
  'IRemoveContentReactionUseCase',
);

export interface IListContentReactionsCommand {
  /** `null` khi gọi ẩn danh — danh sách này công khai. */
  viewerId: string | null;
  subjectType: ContentSubjectTypes;
  subjectId: string;
  kind?: ReactionKinds;
  page?: number;
  pageSize?: number;
}

export type IListContentReactionsResult = IListReactionsResponseDto;

export interface IListContentReactionsUseCase extends IUseCase<
  IListContentReactionsCommand,
  IListContentReactionsResult
> {}

export const IListContentReactionsUseCase = Symbol(
  'IListContentReactionsUseCase',
);
