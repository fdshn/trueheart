/**
 * Mã lỗi cấp nền tảng.
 *
 * CHỈ đặt ở đây các mã thuộc về giao thức HTTP / vòng đời request. Mã nghiệp vụ
 * thuộc về package sở hữu nghiệp vụ đó (xem INVARIANTS.md mục 8).
 */
export enum ErrorCodes {
  OK = 0,

  UNKNOWN_ERROR = 0xff_00,
  BAD_REQUEST = 0xff_01,
  UNAUTHORIZED = 0xff_02,
  FORBIDDEN = 0xff_03,
  NOT_FOUND = 0xff_04,
  CONFLICT = 0xff_05,
  VALIDATION_FAILED = 0xff_06,
  INVALID_PAGINATION = 0xff_07,
  RATE_LIMITED = 0xff_08,

  FEATURE_NOT_SUPPORTED = 0xff_c0,
  NOT_IMPLEMENTED = 0xff_c1,
}

/** Nguồn phát sinh mã lỗi. Cặp (origin, code) là duy nhất toàn hệ thống. */
export const ErrorOrigin = 'kernel/common-lib';
