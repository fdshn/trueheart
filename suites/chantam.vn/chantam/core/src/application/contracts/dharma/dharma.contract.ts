import {
  IDharmaContent,
  IDharmaContentSummary,
  IDharmaRecitation,
} from '@/domain/ports/repository';
import {
  DharmaContentType,
  DharmaHubEntry,
} from '@chantam.vn/chantam.core-lib/models';
import { IUseCase } from '@chantam/service.common-lib';

/** Một entry trên Dharma Hub (UI-DHARMA-01). */
export interface IDharmaHubEntryDto {
  readonly entry: DharmaHubEntry;
  readonly label: string;
  /**
   * Đường API client gọi khi bấm vào entry.
   *
   * Trả từ server thay vì để client đóng cứng bảy đường: `MERIT` trỏ sang `/merit-units` —
   * một phân hệ KHÁC (UC-DHARMA-05 nói tái dùng §3.3.11), và đó đúng là loại ánh xạ client
   * sẽ ghi sai nếu phải tự nhớ.
   */
  readonly path: string;
  /** `null` khi entry không đếm được gì (ví dụ Diễn đàn trước khi có chủ đề nào). */
  readonly itemCount: number | null;
}

export interface IGetDharmaHubCommand {
  readonly placeholder?: never;
}

export interface IGetDharmaHubResult {
  readonly entries: IDharmaHubEntryDto[];
}

export interface IGetDharmaHubUseCase extends IUseCase<
  IGetDharmaHubCommand,
  IGetDharmaHubResult
> {}

export const IGetDharmaHubUseCase = Symbol('IGetDharmaHubUseCase');

export interface IWriteDharmaContentInput {
  readonly contentType: string;
  readonly category?: string;
  readonly title: string;
  readonly slug?: string;
  readonly summary?: string;
  readonly bodyText?: string;
  readonly audioUrl?: string;
  readonly coverUrl?: string;
  readonly displayOrder?: number;
  readonly isFeatured?: boolean;
  readonly isPublished?: boolean;
}

export interface ICreateDharmaContentCommand extends IWriteDharmaContentInput {
  readonly actorUserId: string;
}

export interface ICreateDharmaContentUseCase extends IUseCase<
  ICreateDharmaContentCommand,
  IDharmaContent
> {}

export const ICreateDharmaContentUseCase = Symbol(
  'ICreateDharmaContentUseCase',
);

export interface IUpdateDharmaContentCommand extends Partial<IWriteDharmaContentInput> {
  readonly actorUserId: string;
  readonly contentId: string;
}

export interface IUpdateDharmaContentUseCase extends IUseCase<
  IUpdateDharmaContentCommand,
  IDharmaContent
> {}

export const IUpdateDharmaContentUseCase = Symbol(
  'IUpdateDharmaContentUseCase',
);

export interface IDharmaContentPageResult {
  readonly items: IDharmaContentSummary[];
  readonly total: number;
}

export interface IListPublicDharmaContentsCommand {
  readonly limit: number;
  readonly offset: number;
  readonly contentType?: DharmaContentType;
  readonly category?: string;
  readonly featuredOnly?: boolean;
}

export interface IListPublicDharmaContentsUseCase extends IUseCase<
  IListPublicDharmaContentsCommand,
  IDharmaContentPageResult
> {}

export const IListPublicDharmaContentsUseCase = Symbol(
  'IListPublicDharmaContentsUseCase',
);

export interface IListAdminDharmaContentsCommand {
  readonly actorUserId: string;
  readonly limit: number;
  readonly offset: number;
  readonly contentType?: DharmaContentType;
  readonly includeDrafts: boolean;
}

export interface IListAdminDharmaContentsUseCase extends IUseCase<
  IListAdminDharmaContentsCommand,
  IDharmaContentPageResult
> {}

export const IListAdminDharmaContentsUseCase = Symbol(
  'IListAdminDharmaContentsUseCase',
);

export interface IGetDharmaContentCommand {
  readonly idOrSlug: string;
}

export interface IGetDharmaContentResult {
  readonly content: IDharmaContent;
  /** Số lượt tụng ĐÃ HOÀN TẤT — đếm lúc đọc, không phải cột lưu sẵn. */
  readonly completedRecitationCount: number;
  /** `true` chỉ với `SUTRA` đã xuất bản (UC-DHARMA-02). */
  readonly isRecitable: boolean;
}

export interface IGetDharmaContentUseCase extends IUseCase<
  IGetDharmaContentCommand,
  IGetDharmaContentResult
> {}

export const IGetDharmaContentUseCase = Symbol('IGetDharmaContentUseCase');

export interface IDeleteDharmaContentCommand {
  readonly actorUserId: string;
  readonly contentId: string;
}

export interface IDeleteDharmaContentResult {
  readonly deleted: true;
}

export interface IDeleteDharmaContentUseCase extends IUseCase<
  IDeleteDharmaContentCommand,
  IDeleteDharmaContentResult
> {}

export const IDeleteDharmaContentUseCase = Symbol(
  'IDeleteDharmaContentUseCase',
);

export interface IStartRecitationCommand {
  readonly actorUserId: string;
  readonly contentId: string;
}

export interface IStartRecitationResult {
  readonly recitation: IDharmaRecitation;
}

export interface IStartRecitationUseCase extends IUseCase<
  IStartRecitationCommand,
  IStartRecitationResult
> {}

export const IStartRecitationUseCase = Symbol('IStartRecitationUseCase');

export interface ICompleteRecitationCommand {
  readonly actorUserId: string;
  readonly recitationId: string;
}

export interface ICompleteRecitationUseCase extends IUseCase<
  ICompleteRecitationCommand,
  IStartRecitationResult
> {}

export const ICompleteRecitationUseCase = Symbol('ICompleteRecitationUseCase');

export interface IListOwnRecitationsCommand {
  readonly actorUserId: string;
  readonly limit: number;
  readonly offset: number;
}

export interface IListOwnRecitationsResult {
  readonly items: IDharmaRecitation[];
  readonly total: number;
}

export interface IListOwnRecitationsUseCase extends IUseCase<
  IListOwnRecitationsCommand,
  IListOwnRecitationsResult
> {}

export const IListOwnRecitationsUseCase = Symbol('IListOwnRecitationsUseCase');
