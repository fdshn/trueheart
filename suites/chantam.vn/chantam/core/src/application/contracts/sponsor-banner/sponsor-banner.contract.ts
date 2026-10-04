import { ISponsorBanner } from '@/domain/ports/repository';
import {
  BannerApprovalStatus,
  BannerPlacement,
} from '@chantam.vn/chantam.core-lib/models';
import { IUseCase } from '@chantam/service.common-lib';

/** Thân chung cho lượt tạo và lượt sửa. */
export interface IWriteSponsorBannerInput {
  readonly partnerName: string;
  readonly partnerContact?: string;
  readonly title: string;
  readonly imageUrl: string;
  readonly targetUrl: string;
  readonly placement: string;
  readonly displayOrder?: number;
  readonly startsAt: string;
  readonly endsAt: string;
}

export interface ICreateSponsorBannerCommand extends IWriteSponsorBannerInput {
  readonly actorUserId: string;
}

export interface ICreateSponsorBannerUseCase extends IUseCase<
  ICreateSponsorBannerCommand,
  ISponsorBanner
> {}

export const ICreateSponsorBannerUseCase = Symbol(
  'ICreateSponsorBannerUseCase',
);

export interface IUpdateSponsorBannerCommand extends Partial<IWriteSponsorBannerInput> {
  readonly actorUserId: string;
  readonly bannerId: string;
}

export interface IUpdateSponsorBannerUseCase extends IUseCase<
  IUpdateSponsorBannerCommand,
  ISponsorBanner
> {}

export const IUpdateSponsorBannerUseCase = Symbol(
  'IUpdateSponsorBannerUseCase',
);

export interface IListAdminSponsorBannersCommand {
  readonly actorUserId: string;
  readonly limit: number;
  readonly offset: number;
  readonly placement?: BannerPlacement;
  readonly approvalStatus?: BannerApprovalStatus;
}

export interface ISponsorBannerPageResult {
  readonly items: ISponsorBanner[];
  readonly total: number;
}

export interface IListAdminSponsorBannersUseCase extends IUseCase<
  IListAdminSponsorBannersCommand,
  ISponsorBannerPageResult
> {}

export const IListAdminSponsorBannersUseCase = Symbol(
  'IListAdminSponsorBannersUseCase',
);

export interface IDecideSponsorBannerApprovalCommand {
  readonly actorUserId: string;
  readonly bannerId: string;
  readonly approve: boolean;
  readonly note?: string;
}

export interface IDecideSponsorBannerApprovalUseCase extends IUseCase<
  IDecideSponsorBannerApprovalCommand,
  ISponsorBanner
> {}

export const IDecideSponsorBannerApprovalUseCase = Symbol(
  'IDecideSponsorBannerApprovalUseCase',
);

export interface ISetSponsorBannerActiveCommand {
  readonly actorUserId: string;
  readonly bannerId: string;
  readonly isActive: boolean;
}

export interface ISetSponsorBannerActiveUseCase extends IUseCase<
  ISetSponsorBannerActiveCommand,
  ISponsorBanner
> {}

export const ISetSponsorBannerActiveUseCase = Symbol(
  'ISetSponsorBannerActiveUseCase',
);

export interface IDeleteSponsorBannerCommand {
  readonly actorUserId: string;
  readonly bannerId: string;
}

export interface IDeleteSponsorBannerResult {
  readonly deleted: true;
}

export interface IDeleteSponsorBannerUseCase extends IUseCase<
  IDeleteSponsorBannerCommand,
  IDeleteSponsorBannerResult
> {}

export const IDeleteSponsorBannerUseCase = Symbol(
  'IDeleteSponsorBannerUseCase',
);

/** Bộ trường banner trả cho người dùng cuối — KHÔNG có số liệu và thông tin đối tác. */
export interface IPublicSponsorBannerDto {
  readonly globalId: string;
  readonly title: string;
  readonly imageUrl: string;
  readonly targetUrl: string;
  readonly placement: BannerPlacement;
  readonly displayOrder: number;
  /**
   * Tên đối tác — hiện được, vì quảng cáo phải nói rõ của ai (và đó là yêu cầu pháp lý ở
   * nhiều nơi). Nhưng `partnerContact`, `impressionCount`, `clickCount` thì KHÔNG: số liệu
   * hiệu quả là dữ liệu thương mại giữa Bên A và đối tác.
   */
  readonly partnerName: string;
}

export interface IServeSponsorBannersCommand {
  readonly placement: BannerPlacement;
  readonly limit: number;
}

export interface IServeSponsorBannersResult {
  readonly banners: IPublicSponsorBannerDto[];
}

export interface IServeSponsorBannersUseCase extends IUseCase<
  IServeSponsorBannersCommand,
  IServeSponsorBannersResult
> {}

export const IServeSponsorBannersUseCase = Symbol(
  'IServeSponsorBannersUseCase',
);

export interface IRecordBannerClickCommand {
  readonly bannerId: string;
}

export interface IRecordBannerClickResult {
  /** Đích để client mở — trả lại từ server để client không phải tin bản sao đã cache. */
  readonly targetUrl: string;
}

export interface IRecordBannerClickUseCase extends IUseCase<
  IRecordBannerClickCommand,
  IRecordBannerClickResult
> {}

export const IRecordBannerClickUseCase = Symbol('IRecordBannerClickUseCase');
