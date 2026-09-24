/**
 * Tương tác trên bảng tin: cảm xúc, bình luận, chia sẻ, báo xấu.
 *
 * **Vì sao có `subject_type` thay vì gắn cứng vào bài đăng.** SRS mục 3.3.12 ghi
 * Dharma Hub "tái sử dụng CMS/Post-Comment/Moderation/Notification/Media hiện
 * có". Gắn cứng `post_id` bây giờ thì sau này phải migrate cả bảng bình luận,
 * index, đường kiểm duyệt và thông báo cùng lúc.
 */
export enum ContentSubjectTypes {
  POST = 'POST',
  /** Bình luận cũng được thả cảm xúc và báo xấu. */
  COMMENT = 'COMMENT',
  /** Chưa dùng — chỗ dành sẵn cho Dharma Hub, để không phải migrate về sau. */
  DHARMA_THREAD = 'DHARMA_THREAD',
}

/**
 * Năm loại cảm xúc.
 *
 * **Cố ý không có `ANGRY`.** Đây là nền tảng cho–nhận đồ; một nút phẫn nộ trên
 * bài của người đang cần giúp là thứ không phục vụ ai. Thêm sau thì dễ, gỡ đi
 * khi người dùng đã quen thì khó.
 */
export enum ReactionKinds {
  LIKE = 'LIKE',
  LOVE = 'LOVE',
  CARE = 'CARE',
  WOW = 'WOW',
  SAD = 'SAD',
}

/**
 * Trạng thái một bình luận.
 *
 * **Gỡ là đổi trạng thái, không xoá dòng.** Xoá thật thì chuỗi trả lời bên dưới
 * mất ngữ cảnh, và không còn gì để đối chiếu khi có khiếu nại.
 */
export enum CommentStatuses {
  VISIBLE = 'VISIBLE',
  /** Bộ lọc từ ngữ gắn cờ: tác giả thấy, người khác không, Admin xem xét. */
  PENDING_REVIEW = 'PENDING_REVIEW',
  /** Admin ẩn. */
  HIDDEN = 'HIDDEN',
  /** Tác giả hoặc chủ bài gỡ. */
  REMOVED = 'REMOVED',
}

/** Chỉ trạng thái này mới lộ ra API công khai. */
export const PubliclyVisibleCommentStatuses: readonly CommentStatuses[] = [
  CommentStatuses.VISIBLE,
];

/** Bình luận chỉ hai cấp. Lồng vô hạn làm phân trang và giao diện không giải được. */
export const MaxCommentDepth = 2;

export const MaxCommentLength = 1000;

/** Số ảnh tối đa cho một bình luận, và cho một tin nhắn chat. */
export const MaxContentMediaPerItem = 3;

/**
 * Cửa sổ cho phép sửa bình luận, tính bằng phút.
 *
 * Sửa được mãi thì một bình luận hiền lành đã có 20 lượt đồng tình có thể bị
 * đổi thành thứ khác hẳn — người đã bày tỏ cảm xúc không rút lại được.
 */
export const CommentEditWindowMinutes = 15;

/** Capability của entitlement policy — Admin quyết hạng nào được làm gì. */
export const ReactContentCapability = 'REACT_CONTENT';
export const CommentContentCapability = 'COMMENT_CONTENT';

/**
 * Mã rule điểm cho tương tác ([F41](../../../docs/FEATURES.md)).
 *
 * Seed **TẮT sẵn** và `affects_lifetime = false`: cho bình luận đẩy hạng thì gõ
 * 300 dòng "hay quá ạ" là lên Bạc, trong khi tặng một món đồ thật được 56 điểm.
 */
export const PostCommentedRuleCode = 'POST_COMMENTED';
export const PostReactedRuleCode = 'POST_REACTED';
