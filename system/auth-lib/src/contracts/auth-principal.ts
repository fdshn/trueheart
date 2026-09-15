/**
 * Danh tính người gọi, lấy từ access token.
 *
 * Cố ý dùng `string` cho `rank` và `status` thay vì enum của `core-lib`:
 * auth-lib nằm ở tầng `system/`, không được biết gì về nghiệp vụ Chân Tâm. Bên
 * gọi tự ép kiểu về enum của mình.
 */
export interface IAuthPrincipal {
  /** `globalId` của tài khoản — KHÔNG phải khoá chính dạng số. */
  userId: string;
  username: string;
  rank: string;
  status: string;

  /**
   * Thời điểm token được phát hành. Chỉ có mặt khi principal đến từ
   * `verifyAccessToken`; lúc ký thì bỏ qua vì JWT tự đóng dấu `iat`.
   *
   * Dùng để đối chiếu với `ITokenDenyList`.
   */
  issuedAt?: Date;
}
