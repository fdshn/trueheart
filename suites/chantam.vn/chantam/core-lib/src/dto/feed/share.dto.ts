/**
 * Chia sẻ là ghi nhận một lượt mở khay chia sẻ và trả link chuẩn.
 *
 * Không nhân bản nội dung lên tường người chia sẻ — xem QĐ-3 trong
 * `docs/plan/FEED-INTERACTIONS.md`.
 */
export interface IRecordShareBodyDto {
  share: {
    /**
     * Kênh người dùng chọn trên khay hệ điều hành, ví dụ `zalo`, `facebook`,
     * `clipboard`. Không bắt buộc — client có thể không biết kênh trước khi mở.
     */
    channel?: string;
  };
}

export interface IRecordShareResponseDto {
  share: {
    /** Đường dẫn tương đối tới bài — client ghép tên miền của mình. */
    deepLinkPath: string;
    /**
     * URL tuyệt đối khi server biết gốc web công khai. `null` khi
     * `WEB_PUBLIC_BASE_URL` chưa cấu hình — không bịa domain.
     */
    shareUrl: string | null;
    /** Tổng lượt chia sẻ sau lần ghi này, đọc từ cột đếm trên bài. */
    shareCount: number;
  };
}
