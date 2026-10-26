/**
 * Mã chia sẻ bài (PR #46 §4): ngắn, KHÔNG tuần tự, duy nhất — sinh ở Postgres bằng
 * `gen_post_share_code()` (migration `AddPostShareCode`), nên mọi lối tạo bài đều có mã.
 *
 * Cùng bảng chữ với mã mời nhóm: bỏ 0/O, 1/I/L vì mã được đọc và gõ tay. 31^10 ≈ 8·10^14
 * tổ hợp — không đoán dò được bài, và một triệu bài vẫn hầu như không va nhau.
 */
export const PostShareCodeAlphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const PostShareCodeLength = 10;
export const PostShareCodePattern = /^[A-HJKMNP-Z2-9]{10}$/;
