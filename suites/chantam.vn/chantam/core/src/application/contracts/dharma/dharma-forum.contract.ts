import {
  IDharmaDedication,
  IDharmaThread,
  IPublicDedication,
} from '@/domain/ports/repository';
import { DharmaThreadStatus } from '@chantam.vn/chantam.core-lib/models';
import { IUseCase } from '@chantam/service.common-lib';

export interface ICreateThreadCommand {
  readonly actorUserId: string;
  readonly title: string;
  readonly bodyText: string;
  readonly category?: string;
}

export interface IThreadResult {
  readonly thread: IDharmaThread;
}

export interface ICreateThreadUseCase extends IUseCase<
  ICreateThreadCommand,
  IThreadResult
> {}

export const ICreateThreadUseCase = Symbol('ICreateThreadUseCase');

export interface IListPublicThreadsCommand {
  readonly limit: number;
  readonly offset: number;
  readonly category?: string;
}

export interface IThreadPageResult {
  readonly items: IDharmaThread[];
  readonly total: number;
}

export interface IListPublicThreadsUseCase extends IUseCase<
  IListPublicThreadsCommand,
  IThreadPageResult
> {}

export const IListPublicThreadsUseCase = Symbol('IListPublicThreadsUseCase');

export interface IGetThreadCommand {
  readonly threadId: string;
}

export interface IGetThreadUseCase extends IUseCase<
  IGetThreadCommand,
  IThreadResult
> {}

export const IGetThreadUseCase = Symbol('IGetThreadUseCase');

export interface IListAdminThreadsCommand {
  readonly actorUserId: string;
  readonly limit: number;
  readonly offset: number;
  readonly status?: DharmaThreadStatus;
}

export interface IListAdminThreadsUseCase extends IUseCase<
  IListAdminThreadsCommand,
  IThreadPageResult
> {}

export const IListAdminThreadsUseCase = Symbol('IListAdminThreadsUseCase');

/**
 * Một lượt kiểm duyệt: đổi trạng thái, khoá bình luận, ghim.
 *
 * Ba việc một endpoint vì UC-DHARMA-03 liệt kê chúng trong một câu và cả ba cùng ghi một dấu
 * vết `moderatedBy`/`moderatedAt`. Tách ba endpoint là ba lượt ghi dấu vết cho một quyết định.
 */
export interface IModerateThreadCommand {
  readonly actorUserId: string;
  readonly threadId: string;
  readonly status?: DharmaThreadStatus;
  readonly isLocked?: boolean;
  readonly isPinned?: boolean;
  readonly note?: string;
}

export interface IModerateThreadUseCase extends IUseCase<
  IModerateThreadCommand,
  IThreadResult
> {}

export const IModerateThreadUseCase = Symbol('IModerateThreadUseCase');

export interface ICreateDedicationCommand {
  readonly actorUserId: string;
  readonly text: string;
  readonly dedicateeName?: string;
  readonly recitationId?: string;
  readonly isPublic?: boolean;
  readonly isAnonymous?: boolean;
}

export interface IDedicationResult {
  readonly dedication: IDharmaDedication;
}

export interface ICreateDedicationUseCase extends IUseCase<
  ICreateDedicationCommand,
  IDedicationResult
> {}

export const ICreateDedicationUseCase = Symbol('ICreateDedicationUseCase');

export interface IListPublicDedicationsCommand {
  readonly limit: number;
  readonly offset: number;
}

export interface IListPublicDedicationsResult {
  readonly items: IPublicDedication[];
  readonly total: number;
}

export interface IListPublicDedicationsUseCase extends IUseCase<
  IListPublicDedicationsCommand,
  IListPublicDedicationsResult
> {}

export const IListPublicDedicationsUseCase = Symbol(
  'IListPublicDedicationsUseCase',
);

export interface IListOwnDedicationsCommand {
  readonly actorUserId: string;
  readonly limit: number;
  readonly offset: number;
}

export interface IListOwnDedicationsResult {
  readonly items: IDharmaDedication[];
  readonly total: number;
}

export interface IListOwnDedicationsUseCase extends IUseCase<
  IListOwnDedicationsCommand,
  IListOwnDedicationsResult
> {}

export const IListOwnDedicationsUseCase = Symbol('IListOwnDedicationsUseCase');
