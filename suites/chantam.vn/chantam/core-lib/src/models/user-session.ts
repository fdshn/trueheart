/**
 * Một phiên đăng nhập trên một thiết bị.
 *
 * Tách khỏi `users` vì một người có nhiều thiết bị, và đăng xuất phải thu hồi
 * đúng phiên của thiết bị đó chứ không phải tất cả (F04).
 */
export interface IUserSession {
  userId: string;

  /** Chỉ lưu bản băm của refresh token, không lưu token gốc. */
  refreshTokenHash: string;

  /** Định danh thiết bị do client sinh, giúp nhận ra phiên cũ của cùng máy. */
  deviceId: string;

  /** Token đẩy thông báo của thiết bị. Xoá khi đăng xuất (F04). */
  fcmToken: string | null;

  expiresAt: Date;

  /** Có giá trị nghĩa là phiên đã bị thu hồi — giữ lại để truy vết. */
  revokedAt: Date | null;
}
