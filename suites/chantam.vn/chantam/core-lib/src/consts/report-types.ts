export enum ReportTargetTypes {
  POST = 'POST',
  USER = 'USER',
  /** Bình luận trên bảng tin — chung hàng đợi Admin với bài và người dùng. */
  COMMENT = 'COMMENT',
}

export enum ReportReasons {
  SCAM = 'SCAM',
  PROHIBITED_ITEM = 'PROHIBITED_ITEM',
  INAPPROPRIATE_CONTENT = 'INAPPROPRIATE_CONTENT',
  HARASSMENT = 'HARASSMENT',
  MISLEADING = 'MISLEADING',
  OTHER = 'OTHER',
}

export enum ReportStatuses {
  PENDING = 'PENDING',
  IN_REVIEW = 'IN_REVIEW',
  RESOLVED = 'RESOLVED',
  DISMISSED = 'DISMISSED',
}

/**
 * Thưởng cho người báo xấu, CHỈ khi Admin đã xác minh là đúng (F41).
 *
 * Không thưởng lúc gửi: thưởng ngay là trả tiền cho việc bấm nút, và hàng đợi
 * Admin sẽ ngập báo xấu vu vơ trong một tuần.
 *
 * Seed TẮT sẵn như hai rule tương tác còn lại, và `affects_lifetime = false`
 * để việc báo xấu không đẩy được thứ hạng.
 */
export const ReportUpheldRuleCode = 'REPORT_UPHELD';
