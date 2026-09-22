/**
 * Bản ghi lượt thích bài đăng.
 *
 * Join table thuần — `userId` + `postId` là natural key, không có thêm dữ liệu
 * nghiệp vụ. Likecount được denorm vào `posts.like_count` để tránh COUNT(*) mỗi
 * lần lấy bài.
 */
export interface IPostLike {
  userId: string;
  postId: string;
}

export interface IPostLikeEntity extends IPostLike {
  id: number;
  createdAt: Date;
}

export const IPostLikeEntity = Symbol('IPostLikeEntity');
