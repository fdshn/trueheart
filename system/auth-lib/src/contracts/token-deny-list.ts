/**
 * Vô hiệu access token trước hạn.
 *
 * Access token là JWT — tự nó có hiệu lực tới lúc hết hạn, máy chủ không cần
 * tra cứu gì. Đó là ưu điểm, và cũng là chỗ hở: đổi mật khẩu hay xoá tài khoản
 * xong, token cũ vẫn dùng được thêm tới 15 phút. Với chức năng đặt lại mật
 * khẩu — thứ người dùng bấm vào *vì* nghi bị chiếm tài khoản — 15 phút đó phá
 * hỏng đúng mục đích của tính năng.
 *
 * Danh sách chặn ghi một dấu mốc cho mỗi tài khoản: "mọi token phát hành trước
 * thời điểm này đều hỏng". Ghi dấu mốc thay vì liệt kê từng token vì ta không
 * giữ danh sách token đã phát — và cũng không nên giữ.
 */
export interface ITokenDenyList {
  /**
   * Vô hiệu mọi access token của tài khoản được phát hành TRƯỚC thời điểm gọi.
   * Token cấp sau đó vẫn dùng bình thường, nên người dùng đổi mật khẩu xong
   * đăng nhập lại được ngay.
   */
  revokeIssuedBefore(userId: string): Promise<void>;

  /** `true` khi token phát hành lúc `issuedAt` đã bị vô hiệu. */
  isRevoked(userId: string, issuedAt: Date): Promise<boolean>;
}

export const ITokenDenyList = Symbol('ITokenDenyList');
