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
