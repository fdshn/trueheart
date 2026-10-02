import {
  IHomeBanner,
  IHomeFloatingBanner,
  IHomeLayout,
  IHomePopup,
  IHomeSection,
  IHomeTheme,
} from '@chantam.vn/chantam.core-lib/models';
import { IUseCase } from '@chantam/service.common-lib';

export interface IHomeCampaignView {
  id: string;
  campaignName: string;
  theme: IHomeTheme;
  marqueeText: string | null;
  banners: IHomeBanner[];
  sectionsLayout: IHomeSection[];
  popup: IHomePopup | null;
  floatingBanner: IHomeFloatingBanner | null;
  startTime: Date;
  endTime: Date;
  isActive: boolean;
  /**
   * `true` khi đây là bố cục Home đang thật sự được phục vụ.
   *
   * Khác `isActive`: một chiến dịch của tháng sau có `isActive: true` mà
   * `isLive: false`. CMS cần phân biệt hai cái, nếu không Admin bật xong thấy
   * "đang hoạt động" rồi mở app ra không thấy gì đổi.
   */
  isLive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface IHomeCampaignWriteInput {
  campaignName: string;
  theme: unknown;
  marqueeText: string | null;
  banners: unknown;
  sectionsLayout: unknown;
  popup: unknown;
  floatingBanner: unknown;
  startTime: Date;
  endTime: Date;
  isActive: boolean;
}

export interface IHomeCampaignMutationResult {
  campaign: IHomeCampaignView;
  /**
   * `false` khi đã lưu nhưng KHÔNG xoá được đệm Redis.
   *
   * Phải lên tới response: UC-ADM-03 bước 5 hứa xoá đệm tức thì, và nếu không xoá được
   * thì bố cục cũ còn phục vụ tới một giờ. Nuốt im là để Admin tin đã đổi xong.
   */
  cacheInvalidated: boolean;
}

export interface IListHomeCampaignsCommand {
  actorUserId: string;
  limit: number;
  offset: number;
}

export interface IListHomeCampaignsResult {
  items: IHomeCampaignView[];
  total: number;
}

export interface IListHomeCampaignsUseCase extends IUseCase<
  IListHomeCampaignsCommand,
  IListHomeCampaignsResult
> {}

export const IListHomeCampaignsUseCase = Symbol('IListHomeCampaignsUseCase');

export interface IGetHomeCampaignCommand {
  actorUserId: string;
  campaignId: string;
}

export interface IGetHomeCampaignUseCase extends IUseCase<
  IGetHomeCampaignCommand,
  IHomeCampaignView
> {}

export const IGetHomeCampaignUseCase = Symbol('IGetHomeCampaignUseCase');

export interface ICreateHomeCampaignCommand extends IHomeCampaignWriteInput {
  actorUserId: string;
}

export interface ICreateHomeCampaignUseCase extends IUseCase<
  ICreateHomeCampaignCommand,
  IHomeCampaignMutationResult
> {}

export const ICreateHomeCampaignUseCase = Symbol('ICreateHomeCampaignUseCase');

export interface IUpdateHomeCampaignCommand extends IHomeCampaignWriteInput {
  actorUserId: string;
  campaignId: string;
}

export interface IUpdateHomeCampaignUseCase extends IUseCase<
  IUpdateHomeCampaignCommand,
  IHomeCampaignMutationResult
> {}

export const IUpdateHomeCampaignUseCase = Symbol('IUpdateHomeCampaignUseCase');

/** Công khai — không cần token, có đệm Redis. */
export interface IGetHomeLayoutCommand {}

export interface IGetHomeLayoutResult {
  layout: IHomeLayout;
  /** `true` khi lấy từ đệm Redis. Hữu ích để soát lúc Admin báo "đổi rồi mà chưa thấy". */
  fromCache: boolean;
}

export interface IGetHomeLayoutUseCase extends IUseCase<
  IGetHomeLayoutCommand,
  IGetHomeLayoutResult
> {}

export const IGetHomeLayoutUseCase = Symbol('IGetHomeLayoutUseCase');
