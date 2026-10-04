import {
  BannerApprovalStatus,
  BannerPlacement,
} from '@chantam.vn/chantam.core-lib/models';

export interface ISponsorBanner {
  readonly globalId: string;
  readonly partnerName: string;
  readonly partnerContact: string | null;
  readonly title: string;
  readonly imageUrl: string;
  readonly targetUrl: string;
  readonly placement: BannerPlacement;
  readonly displayOrder: number;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly isActive: boolean;
  readonly approvalStatus: BannerApprovalStatus;
  readonly approvalNote: string | null;
  readonly approvedAt: Date | null;
  readonly approvedBy: string | null;
  /**
   * Số lượt banner được TRẢ VỀ cho client, không phải số người đã nhìn thấy.
   *
   * Client prefetch hay người dùng cuộn qua mà không nhìn thì vẫn tính. Đọc nó thành "số
   * người đã xem" là đọc sai — muốn con số đó thì phải có tín hiệu viewport từ client, mà
   * UC-ADM-06 chỉ đòi "thống kê cơ bản".
   */
  readonly impressionCount: number;
  readonly clickCount: number;
  /** `null` khi chưa có lượt hiển thị nào. `0` ở đó đọc ra "không ai bấm", trong khi sự thật là chưa ai thấy. */
  readonly clickThroughRate: number | null;
  readonly createdBy: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface IWriteSponsorBannerParams {
  readonly partnerName: string;
  readonly partnerContact: string | null;
  readonly title: string;
  readonly imageUrl: string;
  readonly targetUrl: string;
  readonly placement: BannerPlacement;
  readonly displayOrder: number;
  readonly startsAt: Date;
  readonly endsAt: Date;
}

export interface ICreateSponsorBannerParams extends IWriteSponsorBannerParams {
  readonly createdBy: string;
  readonly approvalStatus: BannerApprovalStatus;
  readonly approvedBy: string | null;
}

export interface ISponsorBannerPage {
  readonly items: ISponsorBanner[];
  readonly total: number;
}

export interface ISponsorBannerRepository {
  create(params: ICreateSponsorBannerParams): Promise<ISponsorBanner>;

  findByGlobalId(globalId: string): Promise<ISponsorBanner | null>;

  /**
   * Banner đang được phục vụ cho một vị trí.
   *
   * Lọc đủ BỐN điều kiện: đã duyệt, còn bật, chưa xoá, và **đang trong khung giờ**. Thiếu
   * điều kiện cuối là chạy banner của một hợp đồng đã hết — tức phát miễn phí cho đối tác
   * cũ và chiếm chỗ của đối tác đang trả tiền.
   *
   * Mốc so là `now()` của database, không phải giờ máy Node.
   */
  findServing(params: {
    readonly placement: BannerPlacement;
    readonly limit: number;
  }): Promise<ISponsorBanner[]>;

  listForAdmin(query: {
    readonly limit: number;
    readonly offset: number;
    readonly placement?: BannerPlacement;
    readonly approvalStatus?: BannerApprovalStatus;
  }): Promise<ISponsorBannerPage>;

  update(params: {
    readonly bannerId: string;
    readonly changes: Partial<IWriteSponsorBannerParams>;
  }): Promise<ISponsorBanner | null>;

  /**
   * Duyệt hoặc từ chối.
   *
   * Chỉ đổi khi còn `PENDING_APPROVAL` — trả `null` nếu đã có người xử lý. Lượt kiểm đó nằm
   * trong `WHERE` của chính câu `UPDATE`, không phải một lượt đọc trước đó: hai Admin bấm
   * cùng lúc thì người sau phải thấy xung đột.
   */
  decideApproval(params: {
    readonly bannerId: string;
    readonly approverId: string;
    readonly approve: boolean;
    readonly note: string | null;
  }): Promise<ISponsorBanner | null>;

  setActive(params: {
    readonly bannerId: string;
    readonly isActive: boolean;
  }): Promise<ISponsorBanner | null>;

  softDelete(bannerId: string): Promise<boolean>;

  /**
   * Cộng dồn lượt hiển thị cho NHIỀU banner trong MỘT câu.
   *
   * Một lượt mở Home trả về cả dải banner, nên đếm từng cái một là N lượt round-trip cho
   * một request. `UPDATE ... WHERE global_id = ANY($1)` làm trong một lượt.
   *
   * Cộng bằng `count = count + 1` trong database, KHÔNG đọc-rồi-ghi: hai người mở Home cùng
   * lúc mà đọc-rồi-ghi thì một lượt hiển thị biến mất, và con số đối soát với đối tác bị
   * thiếu một cách không giải thích được.
   */
  recordImpressions(bannerIds: readonly string[]): Promise<void>;

  /** `false` khi banner không tồn tại hoặc không còn được phục vụ. */
  recordClick(bannerId: string): Promise<boolean>;
}

export const ISponsorBannerRepository = Symbol('ISponsorBannerRepository');
