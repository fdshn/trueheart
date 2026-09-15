/** Mã lỗi thuộc tầng xác thực. Nghiệp vụ người dùng dùng mã của `core-lib`. */
export enum ErrorCodes {
  // 0x01 — Token
  TOKEN_MISSING = 0x01_01,
  TOKEN_INVALID = 0x01_02,
  TOKEN_EXPIRED = 0x01_03,
}

export const ErrorOrigin = 'system/auth-lib';
