/**
 * Presence theo tab (PR #46 §10): đếm số người đang ở một surface cấp cao — không phải
 * analytics, không lưu lịch sử. Allow-list cố định: không nhận tên màn tự do, không nhận id
 * bài/thread đang xem.
 */
export enum PresenceSurfaces {
  DISCOVERY_GIVING = 'DISCOVERY_GIVING',
  DISCOVERY_REQUEST = 'DISCOVERY_REQUEST',
  DISCOVERY_CHARITY = 'DISCOVERY_CHARITY',
  DISCOVERY_CLASSIFIED = 'DISCOVERY_CLASSIFIED',
  DHARMA_HOME = 'DHARMA_HOME',
  DHARMA_CHANTING = 'DHARMA_CHANTING',
  DHARMA_FORUM = 'DHARMA_FORUM',
  DHARMA_MONASTERY = 'DHARMA_MONASTERY',
}

/** Một session hết hạn sau 120 giây không có heartbeat — app gửi mỗi 60 giây khi foreground. */
export const PresenceTtlSeconds = 120;

/**
 * Heartbeat lặp lại CÙNG surface sớm hơn 30 giây thì bỏ qua êm (không lỗi) — tối đa hai lần
 * ghi mỗi phút cho mỗi session. Đổi surface luôn được ghi ngay.
 */
export const PresenceSameSurfaceIntervalSeconds = 30;

/** Trần cứng mỗi người mỗi phút, mọi session cộng lại — vượt thì `TOO_MANY_REQUESTS`. */
export const PresenceHeartbeatsPerUserPerMinute = 30;
