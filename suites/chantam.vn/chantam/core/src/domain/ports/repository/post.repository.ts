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
  postType: PublicDiscoveryPostType;
  categoryId?: string;
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
  transitionPendingReview(
    postId: string,
    status: 'PUBLISHED' | 'REJECTED',
    expiresAt: Date | null,
  ): Promise<IPostEntity | null>;
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
   * Chủ bài phải thấy được bài đang chờ duyệt và bài bị từ chối của mình —
   * đó là toàn bộ lý do endpoint này tồn tại tách khỏi discovery.
   */
  findMyPosts(params: IFindMyPostsParams): Promise<IFindMyPostsResult>;
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
