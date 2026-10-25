/**
 * Hành động của một task onboarding (PR #46 §6): server nói app mở đâu, để mobile không phải
 * hardcode hành động theo `key` của task.
 *
 * Chỉ `APP_ROUTE` đang dùng; `DEEP_LINK`, `API_ACTION`, `NONE` có trong contract cho task sau.
 */
export enum OnboardingActionTypes {
  APP_ROUTE = 'APP_ROUTE',
  DEEP_LINK = 'DEEP_LINK',
  API_ACTION = 'API_ACTION',
  NONE = 'NONE',
}

/**
 * Allow-list `target`. Mỗi giá trị ứng với đúng một màn app — thêm màn mới là thêm ở đây,
 * không có chỗ nào nhận chuỗi tự do.
 */
export enum OnboardingActionTargets {
  /**
   * Màn sửa hồ sơ (`PATCH /profile/me`). `params.missingFields`: mã trường còn thiếu, ngăn bằng
   * dấu phẩy, cùng mã với `body.missingFields` của `PROFILE_INCOMPLETE`.
   */
  PROFILE_EDIT = 'PROFILE_EDIT',
  /** Màn xác thực số điện thoại (`PATCH /profile/me/phone-verification/request`). */
  PHONE_VERIFICATION = 'PHONE_VERIFICATION',
}
