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
}

export const IPostRepository = Symbol('IPostRepository');
