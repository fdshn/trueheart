import {
  PostTypes,
  PublicDiscoveryPostType,
} from '@chantam.vn/chantam.core-lib/consts';
import { IPostEntity } from '@chantam.vn/chantam.core-lib/entities';
import { IGeoPoint } from '@chantam/service.persistency-lib/geo';
import { Repository } from 'typeorm';

export interface IFindPostMapMarkersParams {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
  origin?: IGeoPoint;
  postType?: PostTypes;
  categoryId?: string;
  /** Cỡ ô lưới theo độ, tính từ bề ngang khung nhìn. */
  stepDegrees: number;
  /** Trần số ô trả về. Vượt thì cắt, và `truncated` nói rõ là đã cắt. */
  cellLimit: number;
}

export interface IPostMapCluster {
  /** Góc dưới-trái của ô — khoá ổn định giữa các lần gọi cùng mức phóng to. */
  cellLng: number;
  cellLat: number;
  count: number;
  /** Chỉ có khi `count === 1`. */
  marker: IPostMapMarker | null;
}

export interface IPostMapClusterResult {
  clusters: IPostMapCluster[];
  /** Tổng bài trong khung nhìn, đếm TRƯỚC khi cắt theo `cellLimit`. */
  total: number;
  /** Tổng số ô trước khi cắt. */
  cellCount: number;
}

export interface IPostMapMarker {
  globalId: string;
  postType: PostTypes;
  categoryId: string;
  areaLabel: string;
  location: IGeoPoint;
  distanceMeters?: number;
  /** Tiêu đề và ảnh đầu tiên — dữ liệu cho thẻ xem nhanh (F29). */
  title: string;
  thumbnailKey: string | null;
  isSos: boolean;
}

export interface IFindNearbyPostsParams {
  /**
   * Bỏ trống thì KHÔNG lọc theo bán kính: trả toàn bộ, xếp mới nhất trước.
   * `radiusMeters` khi đó cũng phải bỏ trống — có bán kính mà không có tâm là
   * một tham số không dùng được vào việc gì.
   */
  origin?: IGeoPoint;
  radiusMeters?: number;
  /** Bỏ trống thì không lọc theo loại — feed trộn cả năm loại. */
  postType?: PublicDiscoveryPostType;
  categoryId?: string;
  /** Từ khoá đã được chuẩn hoá ở tầng ứng dụng; rỗng thì bỏ qua. */
  keyword?: string;
  /**
   * `true` thì chỉ trả bài Cần gấp / SOS. Bỏ trống hoặc `false` là KHÔNG lọc.
   *
   * Tầng ứng dụng đã quy về đúng hai trạng thái đó, nên ở đây không có nhánh
   * "chỉ bài không gấp".
   */
  isSos?: boolean;
  skip: number;
  take: number;
}

export interface INearbyPost {
  post: IPostEntity;
  /** `null` khi truy vấn không có gốc toạ độ. */
  distanceMeters: number | null;
}

export interface IFindNearbyPostsResult {
  items: INearbyPost[];
  total: number;
}

export interface IFindSmartMatchesParams {
  /** Bài nguồn — loại khỏi kết quả để không tự gợi ý chính nó. */
  sourcePostId: string;
  /** Tác giả bài nguồn — không gợi ý bài của chính người đó. */
  excludeAuthorId: string;
  /** Loại bài bù: Muốn Nhận thì tìm Muốn Tặng và ngược lại. */
  postType: PostTypes;
  categoryId: string;
  origin: IGeoPoint;
  radiusMeters: number;
  /**
   * Token đã được làm sạch để ghép thành `tsquery`. Mảng rỗng nghĩa là bài
   * nguồn không còn từ khoá nào đáng tìm, khi đó chỉ lọc theo danh mục.
   */
  keywords: string[];
  take: number;
}

export interface IFindMyPostsParams {
  authorId: string;
  postType?: PostTypes;
  status?: string;
  categoryId?: string;
  skip: number;
  take: number;
}

export interface IFindMyPostsResult {
  items: IPostEntity[];
  total: number;
}

export interface IAdminPostSummary {
  readonly globalId: string;
  readonly postType: PostTypes;
  readonly authorId: string;
  readonly authorUsername: string;
  readonly authorFullName: string | null;
  readonly categoryId: string;
  readonly title: string;
  readonly description: string;
  readonly areaLabel: string;
  readonly status: string;
  readonly totalQuantity: number;
  readonly remainingQuantity: number;
  readonly details: Record<string, unknown>;
  readonly expiresAt: Date | null;
  readonly mediaCount: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface IFindAdminPostsParams {
  readonly status?: string;
  readonly postType?: PostTypes;
  readonly categoryId?: string;
  readonly authorId?: string;
  readonly keyword?: string;
  readonly skip: number;
  readonly take: number;
}

export interface IFindAdminPostsResult {
  readonly items: IAdminPostSummary[];
  readonly total: number;
}

export interface IModeratePostByAdminCommand {
  readonly actorUserId: string;
  readonly postId: string;
  readonly status: 'PUBLISHED' | 'REJECTED';
  /**
   * Hạn mới, CHỈ dùng khi bài chưa có hạn.
   *
   * Bài trả lại sau khi gỡ nhầm giữ nguyên đồng hồ cũ — đặt lại là thưởng thêm
   * ba tháng cho một bài đã sống được hai tháng rưỡi.
   */
  readonly expiresAt: Date | null;
  readonly reason: string;
}

export interface ISmartMatchCandidate {
  post: IPostEntity;
  distanceMeters: number;
  sameCategory: boolean;
  keywordMatched: boolean;
}

export interface IExpireDuePostsResult {
  /** Bài đã chuyển sang EXPIRED. */
  expired: number;
  /** Bài rao vặt đã chuyển thành Muốn Tặng thay vì hết hạn (CHỐT-05). */
  convertedToOffer: number;
  /**
   * ID những bài vừa sang `EXPIRED`.
   *
   * Con số không đủ cho nơi gọi: yêu cầu còn treo dưới chúng phải được đóng và
   * người xin phải được báo. Bài rao vặt chuyển thành Muốn Tặng KHÔNG nằm đây
   * — nó vẫn mở, nên hàng đợi của nó vẫn còn giá trị.
   */
  expiredPostIds: string[];
}

export interface IRenewPostParams {
  postId: string;
  authorId: string;
  /** Trần bài đang mở của tác giả — bài được gia hạn tính như bài mới (CHỐT-07). */
  quota: number;
  expiresAt: Date;
}

export type RenewPostOutcome =
  | { status: 'RENEWED'; post: IPostEntity }
  | { status: 'NOT_FOUND' }
  | { status: 'NOT_RENEWABLE' }
  | { status: 'LIMIT_REACHED' }
  | { status: 'QUOTA_EXCEEDED' };

export interface IRequestCharityTransferParams {
  postId: string;
  authorId: string;
  note: string | null;
}

export type CharityTransferOutcome =
  | { status: 'RECORDED'; post: IPostEntity }
  | { status: 'NOT_FOUND' }
  | { status: 'INVALID_STATE' };

export interface IReviewCharityTransferParams {
  postId: string;
  approve: boolean;
}

export interface IPostRepository extends Repository<IPostEntity> {
  /** Recheck ownership, lifecycle and real live transactions under a row lock. */
  updateOwnedContent(params: {
    postId: string;
    authorId: string;
    expectedUpdatedAt: Date;
    changes: Partial<IPostEntity>;
  }): Promise<IPostEntity>;
  createPostWithinQuota(
    authorId: string,
    quota: number,
    post: Omit<IPostEntity, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<boolean>;
  /**
   * Gom bài trong khung nhìn thành cụm theo ô lưới.
   *
   * KHÔNG trả từng bài: một thành phố có hàng nghìn bài, và trả hết là vài chục
   * MB cho một lần kéo bản đồ. Ô nào chỉ có đúng một bài thì kèm luôn chi tiết
   * để thẻ xem nhanh (F29) có gì đọc mà không phải gọi thêm.
   */
  findMapClusters(
    params: IFindPostMapMarkersParams,
  ): Promise<IPostMapClusterResult>;
  findNearbyPosts(
    params: IFindNearbyPostsParams,
  ): Promise<IFindNearbyPostsResult>;
  /**
   * Ứng viên Smart Match, đã lọc và xếp hạng sẵn.
   *
   * Chỉ đọc — Smart Match tuyệt đối không được tạo giao dịch (F17).
   */
  findSmartMatches(
    params: IFindSmartMatchesParams,
  ): Promise<ISmartMatchCandidate[]>;
  /**
   * Bài của chính tác giả, KHÔNG lọc theo trạng thái công khai.
   *
   * Chủ bài phải thấy được bài bị Admin gỡ và bài đã hết hạn của mình — đó là
   * toàn bộ lý do endpoint này tồn tại tách khỏi discovery.
   */
  findMyPosts(params: IFindMyPostsParams): Promise<IFindMyPostsResult>;
  findAdminPosts(params: IFindAdminPostsParams): Promise<IFindAdminPostsResult>;
  findAdminByGlobalId(globalId: string): Promise<IAdminPostSummary | null>;
  /**
   * Gỡ bài đang hiện, hoặc trả lại bài đã gỡ (hậu kiểm).
   *
   * Từ 26/09 bài **lên thẳng không chờ duyệt**, nên đây không còn là hàng đợi
   * duyệt trước mà là phanh duy nhất của Admin. Chạm được vào bài `PUBLISHED`,
   * `REJECTED`, và `PENDING_REVIEW` còn sót lại từ trước.
   *
   * KHÔNG chạm vào bài đang có giao dịch sống (`RESERVED`) hay đã
   * đóng (`COMPLETED`/`CANCELLED`/`EXPIRED`): gỡ ngang một lượt trao đang diễn
   * ra để lại hai người đã hẹn nhau mà bài thì biến mất.
   *
   * Trả `null` khi trạng thái hiện tại không cho phép — gọi lại lần hai trên
   * cùng một quyết định cũng vậy.
   */
  moderateByAdmin(
    command: IModeratePostByAdminCommand,
  ): Promise<IPostEntity | null>;
  findPublicByGlobalId(
    globalId: string,
    currentUserId?: string,
  ): Promise<IPostEntity | null>;
  countPublishedByAuthor(authorId: string): Promise<number>;
  /**
   * Đóng vòng đời các bài đã quá hạn.
   *
   * Chỉ đụng vào bài `PUBLISHED`: bài đang `RESERVED` là đang có
   * giao dịch sống, hết hạn ngang là cắt ngang một lượt trao đang diễn ra.
   */
  expireDuePosts(now: Date): Promise<IExpireDuePostsResult>;

  /**
   * Bài sắp hết hạn, để nhắc tác giả kịp gia hạn.
   *
   * `POST /posts/:postId/renew` đã có sẵn và cho thêm ba tháng, nhưng trước
   * 29/09 không ai được nhắc để bấm — bài cứ thế hết hạn trong im lặng.
   *
   * Chỉ lấy bài `PUBLISHED`: bài đang có lượt trao sống thì hết hạn cũng không
   * đụng tới nó, nên nhắc là nhắc một việc sẽ không xảy ra.
   */
  findPostsExpiringSoon(params: { withinDays: number; limit: number }): Promise<
    {
      postId: string;
      authorId: string;
      title: string;
      expiresAt: Date;
      daysLeft: number;
    }[]
  >;
  /**
   * Gia hạn một bài, kiểm tra trần quota và số lần gia hạn trong cùng một
   * transaction — đọc trước rồi ghi sau sẽ cho hai request song song cùng
   * thấy `renewed_count = 0` và cùng gia hạn.
   */
  renewPost(params: IRenewPostParams): Promise<RenewPostOutcome>;
  /**
   * Chủ bài xin chuyển vật phẩm về điểm từ thiện (F23).
   *
   * Chỉ một yêu cầu đang chờ duyệt mỗi bài — ràng buộc đặt ở database, vì hai
   * lần bấm gửi song song đều lọt qua mọi phép kiểm ở tầng ứng dụng.
   */
  requestCharityTransfer(
    params: IRequestCharityTransferParams,
  ): Promise<CharityTransferOutcome>;
  /**
   * Admin duyệt hoặc từ chối yêu cầu chuyển.
   *
   * Duyệt thì bài sang `ARCHIVED` — Kho Từ Thiện Chung. Từ chối thì bài giữ
   * nguyên trạng thái cũ, chỉ ghi lại là đã bị từ chối.
   */
  reviewCharityTransfer(
    params: IReviewCharityTransferParams,
  ): Promise<CharityTransferOutcome>;
}

export const IPostRepository = Symbol('IPostRepository');
