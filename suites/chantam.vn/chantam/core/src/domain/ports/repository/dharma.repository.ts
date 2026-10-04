import { DharmaContentType } from '@chantam.vn/chantam.core-lib/models';

export interface IDharmaContent {
  readonly globalId: string;
  readonly contentType: DharmaContentType;
  readonly category: string | null;
  readonly title: string;
  readonly slug: string;
  readonly summary: string | null;
  readonly bodyText: string;
  readonly audioUrl: string | null;
  readonly coverUrl: string | null;
  readonly displayOrder: number;
  readonly isFeatured: boolean;
  readonly isPublished: boolean;
  readonly publishedAt: Date | null;
  readonly viewCount: number;
  readonly createdBy: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * Bộ trường cho DANH SÁCH — không có `bodyText`.
 *
 * Một bộ kinh có thể tới 2 triệu ký tự; một trang 20 hàng mang cả nội dung là 40MB kéo về
 * cho một màn hình chỉ hiện tiêu đề. Đây là lý do danh sách và chi tiết có hai hình dạng,
 * cùng lối `blogs` đã làm.
 */
export interface IDharmaContentSummary extends Omit<
  IDharmaContent,
  'bodyText'
> {}

export interface IDharmaRecitation {
  readonly globalId: string;
  readonly contentId: string;
  readonly userId: string;
  readonly startedAt: Date;
  readonly completedAt: Date | null;
  readonly durationSeconds: number | null;
}

export interface IWriteDharmaContentParams {
  readonly contentType: DharmaContentType;
  readonly category: string | null;
  readonly title: string;
  readonly slug: string;
  readonly summary: string | null;
  readonly bodyText: string;
  readonly audioUrl: string | null;
  readonly coverUrl: string | null;
  readonly displayOrder: number;
  readonly isFeatured: boolean;
  readonly isPublished: boolean;
}

export interface ICreateDharmaContentParams extends IWriteDharmaContentParams {
  readonly createdBy: string;
}

export interface IDharmaContentPage {
  readonly items: IDharmaContentSummary[];
  readonly total: number;
}

export interface IDharmaRepository {
  createContent(params: ICreateDharmaContentParams): Promise<IDharmaContent>;

  /**
   * Slug đã có người dùng chưa.
   *
   * Tính cả hàng ĐÃ XOÁ MỀM: cột `UNIQUE` không biết `deleted_at`, nên một slug đã xoá vẫn
   * giữ chỗ. Bỏ qua nó là trả "còn trống" rồi để `UNIQUE` ném 500.
   */
  slugTaken(slug: string, exceptGlobalId?: string): Promise<boolean>;

  findContentByGlobalId(globalId: string): Promise<IDharmaContent | null>;

  /** Đường công khai: chỉ nội dung đã xuất bản, chưa xoá. Nhận cả id lẫn slug. */
  findPublishedContentByIdOrSlug(
    idOrSlug: string,
  ): Promise<IDharmaContent | null>;

  listPublishedContents(query: {
    readonly limit: number;
    readonly offset: number;
    readonly contentType?: DharmaContentType;
    readonly category?: string;
    readonly featuredOnly?: boolean;
  }): Promise<IDharmaContentPage>;

  listContentsForAdmin(query: {
    readonly limit: number;
    readonly offset: number;
    readonly contentType?: DharmaContentType;
    readonly includeDrafts: boolean;
  }): Promise<IDharmaContentPage>;

  updateContent(params: {
    readonly contentId: string;
    readonly changes: Partial<IWriteDharmaContentParams>;
  }): Promise<IDharmaContent | null>;

  softDeleteContent(contentId: string): Promise<boolean>;

  /**
   * Tăng lượt xem.
   *
   * KHÔNG đụng `updated_at` — nếu đụng thì mọi bộ kinh đọc nhiều sẽ luôn hiện "vừa cập
   * nhật", và Admin mất cách biết bản nào thật sự được sửa. Cùng lối `blogs`.
   */
  incrementViewCount(contentId: string): Promise<void>;

  startRecitation(params: {
    readonly contentId: string;
    readonly userId: string;
  }): Promise<IDharmaRecitation>;

  findRecitationByGlobalId(globalId: string): Promise<IDharmaRecitation | null>;

  /**
   * Đánh dấu một lượt tụng đã xong.
   *
   * `duration_seconds` tính ở DATABASE từ `started_at` tới `now()`, không nhận từ client:
   * một con số do client gửi là một con số người dùng sửa được, và "đã tụng 3 tiếng" thành
   * thứ bịa được.
   *
   * Trả `null` khi lượt đó không thuộc người gọi hoặc đã xong rồi.
   */
  completeRecitation(params: {
    readonly recitationId: string;
    readonly userId: string;
  }): Promise<IDharmaRecitation | null>;

  listOwnRecitations(query: {
    readonly userId: string;
    readonly limit: number;
    readonly offset: number;
  }): Promise<{ readonly items: IDharmaRecitation[]; readonly total: number }>;

  /**
   * Số lượt tụng ĐÃ HOÀN TẤT của một nội dung — ĐẾM lúc đọc, không phải cột lưu sẵn.
   *
   * Xem docblock migration `1798900000000`: đã có bảng sự kiện thì một cột đếm là bản sao,
   * và bản sao thì trôi.
   */
  countCompletedRecitations(contentId: string): Promise<number>;
}

export const IDharmaRepository = Symbol('IDharmaRepository');
