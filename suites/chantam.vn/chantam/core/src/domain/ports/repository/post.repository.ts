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
  origin: IGeoPoint;
  radiusMeters: number;
  /** Bỏ trống thì không lọc theo loại — feed trộn cả năm loại. */
  postType?: PublicDiscoveryPostType;
  categoryId?: string;
  /** Từ khoá đã được chuẩn hoá ở tầng ứng dụng; rỗng thì bỏ qua. */
  keyword?: string;
  skip: number;
  take: number;
}

export interface INearbyPost {
  post: IPostEntity;
  distanceMeters: number;
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
  createPostWithinQuota(
    authorId: string,
    quota: number,
    post: Omit<IPostEntity, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<boolean>;
  findMapMarkers(params: IFindPostMapMarkersParams): Promise<IPostMapMarker[]>;
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
   * KHÔNG chạm vào bài đang có giao dịch sống (`RESERVED`/`DELIVERING`) hay đã
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
   * Chỉ đụng vào bài `PUBLISHED`: bài đang `RESERVED`/`DELIVERING` là đang có
   * giao dịch sống, hết hạn ngang là cắt ngang một lượt trao đang diễn ra.
   */
  expireDuePosts(now: Date): Promise<IExpireDuePostsResult>;
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
