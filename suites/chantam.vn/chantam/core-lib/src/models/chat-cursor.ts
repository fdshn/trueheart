import { IKeysetCursor } from './keyset-cursor';

/**
 * Giới hạn số tin nhắn chat cho một lần lấy.
 *
 * Con trỏ dùng chung với bình luận (`keyset-cursor.ts`); chỉ TRẦN là riêng, vì
 * một cửa sổ chat và một cửa sổ bình luận không nhất thiết cùng kích thước.
 */
export type IChatCursor = IKeysetCursor;

/** Số tin tối đa cho một lần lấy. */
export const MaxChatMessageLimit = 50;
export const DefaultChatMessageLimit = 30;

/**
 * Ép số tin về khoảng cho phép.
 *
 * Trần ở đây là thứ giữ cho một phòng 50.000 tin không bị kéo về máy trong một
 * lần gọi. Bỏ trần thì `?limit=999999` là một câu truy vấn đủ để hạ máy chủ.
 */
export function clampChatMessageLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit))
    return DefaultChatMessageLimit;
  return Math.min(MaxChatMessageLimit, Math.max(1, Math.trunc(limit)));
}
