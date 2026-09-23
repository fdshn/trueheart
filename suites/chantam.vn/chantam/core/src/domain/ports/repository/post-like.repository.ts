import { IPostLikeEntity } from '@chantam.vn/chantam.core-lib/entities';

/** Kết quả trả về sau khi like thành công. */
export interface ILikeResult {
  entity: IPostLikeEntity;
  /** Giá trị `like_count` của bài sau khi cộng — đọc từ RETURNING để không cần query lại. */
  likeCount: number;
}

/** Kết quả trả về sau khi unlike thành công. */
export interface IUnlikeResult {
  /** Giá trị `like_count` của bài sau khi trừ — đọc từ RETURNING để không cần query lại. */
  likeCount: number;
}

/**
 * Repository cho bảng `post_likes`.
 *
 * Toggle like phải nguyên tử (INSERT/DELETE row + UPDATE like_count) trong cùng
 * một transaction để tránh race condition giữa nhiều like cùng lúc.
 */
export interface IPostLikeRepository {
  /**
   * Like bài đăng.
   * - INSERT vào `post_likes`, UPDATE `posts.like_count += 1 RETURNING like_count`.
   * - Nếu đã like rồi (duplicate key) → trả `null` (caller ném exception).
   * - Trả về `{ entity, likeCount }` để caller không cần query lại bài.
   */
  like(userId: string, postId: string): Promise<ILikeResult | null>;

  /**
   * Unlike bài đăng.
   * - DELETE từ `post_likes`, UPDATE `posts.like_count -= 1 RETURNING like_count`.
   * - Nếu chưa like → trả `null` (caller ném exception).
   * - Trả về `{ likeCount }` để caller không cần query lại bài.
   */
  unlike(userId: string, postId: string): Promise<IUnlikeResult | null>;

  /** Kiểm tra user đã like bài chưa. */
  hasLiked(userId: string, postId: string): Promise<boolean>;

  /** Kiểm tra danh sách bài nào user đã like (dùng cho danh sách). */
  findLikedPostIds(userId: string, postIds: string[]): Promise<Set<string>>;
}

export const IPostLikeRepository = Symbol('IPostLikeRepository');
