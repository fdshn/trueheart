import { IPostLikeEntity } from '@chantam.vn/chantam.core-lib/entities';

/**
 * Repository cho bảng `post_likes`.
 *
 * Toggle like phải nguyên tử (INSERT/DELETE row + UPDATE like_count) trong cùng
 * một transaction để tránh race condition giữa nhiều like cùng lúc.
 */
export interface IPostLikeRepository {
  /**
   * Like bài đăng.
   * - INSERT vào `post_likes`, UPDATE `posts.like_count += 1`.
   * - Nếu đã like rồi (duplicate key) → trả `null` (caller ném exception).
   */
  like(userId: string, postId: string): Promise<IPostLikeEntity | null>;

  /**
   * Unlike bài đăng.
   * - DELETE từ `post_likes`, UPDATE `posts.like_count -= 1`.
   * - Nếu chưa like → trả `false` (caller ném exception).
   */
  unlike(userId: string, postId: string): Promise<boolean>;

  /** Kiểm tra user đã like bài chưa. */
  hasLiked(userId: string, postId: string): Promise<boolean>;

  /** Kiểm tra danh sách bài nào user đã like (dùng cho danh sách). */
  findLikedPostIds(userId: string, postIds: string[]): Promise<Set<string>>;
}

export const IPostLikeRepository = Symbol('IPostLikeRepository');
