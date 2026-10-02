import {
  IHomeBanner,
  IHomeFloatingBanner,
  IHomeLayout,
  IHomePopup,
  IHomeSection,
  IHomeTheme,
} from '@chantam.vn/chantam.core-lib/models';

/** Một cấu hình chiến dịch như Admin thấy trong CMS, gồm cả bản nháp. */
export interface IHomeCampaignRecord {
  globalId: string;
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
   * `true` khi cấu hình này đang là bố cục Home thật sự được phục vụ — tức đang bật VÀ
   * `now()` nằm trong khoảng thời gian.
   *
   * Suy ra ở tầng SQL, không lưu thành cột: một cột `status` phải giữ đồng bộ với hai cột
   * khác là cột sẽ nói sai (bài học `config_revisions`).
   */
  isLive: boolean;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface IHomeCampaignWriteParams {
  actorUserId: string;
  campaignName: string;
  theme: IHomeTheme;
  marqueeText: string | null;
  banners: readonly IHomeBanner[];
  sectionsLayout: readonly IHomeSection[];
  popup: IHomePopup | null;
  floatingBanner: IHomeFloatingBanner | null;
  startTime: Date;
  endTime: Date;
  isActive: boolean;
}

export interface IUpdateHomeCampaignParams extends IHomeCampaignWriteParams {
  globalId: string;
}

export interface IHomeCampaignPage {
  items: IHomeCampaignRecord[];
  total: number;
}

export interface IHomeCampaignRepository {
  listCampaigns(query: {
    limit: number;
    offset: number;
  }): Promise<IHomeCampaignPage>;
  findByGlobalId(globalId: string): Promise<IHomeCampaignRecord | null>;
  createCampaign(
    params: IHomeCampaignWriteParams,
  ): Promise<IHomeCampaignRecord>;
  updateCampaign(
    params: IUpdateHomeCampaignParams,
  ): Promise<IHomeCampaignRecord>;
  /**
   * Bố cục đang phục vụ, hoặc `null` khi không chiến dịch nào tới hiệu lực.
   *
   * `null` ở đây KHÔNG đi ra API: bên gọi đổi nó thành `DefaultHomeLayout` theo BR_CAMP_02.
   * Tách hai việc để repository không phải biết về bố cục mặc định.
   */
  findActiveLayout(): Promise<IHomeLayout | null>;
}

export const IHomeCampaignRepository = Symbol('IHomeCampaignRepository');
