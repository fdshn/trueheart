/**
 * Hạn lưu trữ phòng chat (F38).
 *
 * Admin chọn **số** và **đơn vị**: 1 tuần, 10 ngày, 3 tuần — tuỳ. Lưu cả hai
 * thay vì quy hết về ngày, vì con số Admin nhập vào cũng là con số hiện lại cho
 * họ xem; đổi "2 tuần" thành "14 ngày" trong màn cấu hình là bắt người ta tự
 * quy đổi ngược mỗi lần đọc.
 *
 * **Hạn được chốt một lần lúc khoá phòng, không tính lại mỗi lần đọc.** Nếu
 * tính lại từ config thì báo với người dùng "xoá sau 1 tuần" rồi Admin đổi
 * thành 3 tuần là lời hứa và thực tế lệch nhau — và người dùng là bên chịu.
 * Cùng nguyên tắc với chu kỳ duy trì hạng: chu kỳ đã mở giữ ngưỡng của chính nó.
 */
export enum ChatRetentionUnits {
  DAY = 'DAY',
  WEEK = 'WEEK',
}

export interface IChatRetentionConfig {
  value: number;
  unit: ChatRetentionUnits;
}

export const ChatRetentionConfigKey = 'chat.retention';

export const DefaultChatRetention: IChatRetentionConfig = {
  value: 1,
  unit: ChatRetentionUnits.WEEK,
};

/** Chặn trên: giữ chat hai năm thì hạn lưu trữ thôi còn ý nghĩa. */
export const MaxChatRetentionDays = 365;

/**
 * Đọc config về dạng dùng được, chấp nhận mọi thứ rác.
 *
 * Cấu hình hỏng **không được làm chết đường khoá phòng**: khoá phòng là hệ quả
 * của việc hai người vừa trao xong một món đồ, còn hạn lưu trữ chỉ là chính
 * sách dọn dẹp. Để chính sách đánh đổ sự thật thì người dùng không xác nhận
 * được chỉ vì Admin gõ nhầm một dòng JSON.
 */
export function normalizeChatRetention(raw: unknown): IChatRetentionConfig {
  if (!raw || typeof raw !== 'object') return DefaultChatRetention;

  const source = raw as Record<string, unknown>;
  const unit =
    source.unit === ChatRetentionUnits.DAY
      ? ChatRetentionUnits.DAY
      : source.unit === ChatRetentionUnits.WEEK
        ? ChatRetentionUnits.WEEK
        : null;
  if (!unit) return DefaultChatRetention;

  const value = Number(source.value);
  if (!Number.isFinite(value)) return DefaultChatRetention;

  const perUnit = unit === ChatRetentionUnits.WEEK ? 7 : 1;
  const clamped = Math.min(
    Math.floor(MaxChatRetentionDays / perUnit),
    Math.max(1, Math.trunc(value)),
  );

  return { value: clamped, unit };
}

/** Quy về số ngày, dùng cho phép tính thời hạn. */
export function chatRetentionDays(config: IChatRetentionConfig): number {
  return config.unit === ChatRetentionUnits.WEEK
    ? config.value * 7
    : config.value;
}

/**
 * Thời điểm phòng chat được phép xoá, tính từ lúc khoá.
 *
 * Mốc là `lockedAt` chứ không phải `completedAt`: một lượt trao kết thúc theo
 * BA đường — người nhận xác nhận, một trong hai bên huỷ, hoặc cron tự hoàn tất.
 * Chỉ đường đầu có `completedAt`. Tính theo nó thì phòng của lượt HUỶ không bao
 * giờ bị xoá — mà lượt huỷ chính là chỗ người ta cãi nhau nhiều nhất, tức đúng
 * những phòng nhạy cảm nhất lại tồn tại vĩnh viễn.
 */
export function chatPurgeDate(
  lockedAt: Date,
  config: IChatRetentionConfig,
): Date {
  const purgeAt = new Date(lockedAt.getTime());
  purgeAt.setDate(purgeAt.getDate() + chatRetentionDays(config));
  return purgeAt;
}
