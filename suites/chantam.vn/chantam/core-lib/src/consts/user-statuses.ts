/** Trạng thái tài khoản. Quyết định người dùng có đăng nhập được hay không. */
export enum UserStatuses {
  ACTIVE = 'ACTIVE',
  /** Treo có thời hạn (đặc tả mục 4.2). Hết hạn thì tự về ACTIVE. */
  SUSPENDED = 'SUSPENDED',
  /** Khoá vĩnh viễn. Không tự gỡ. */
  BANNED = 'BANNED',
}
