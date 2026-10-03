/**
 * Gửi thông báo hàng loạt (F47, SRS mục 1507).
 *
 * ## Ba chế độ người nhận, đúng những gì đặc tả nêu
 *
 * *"Admin có thể gửi thông báo toàn hệ thống hoặc theo **nhóm/vùng**, ví dụ ngày rằm, mồng
 * một, Tết hoặc sự kiện cộng đồng."* Ba chế độ, không thêm chế độ thứ tư — lọc theo hạng,
 * theo số điểm, theo mức hoạt động đều là những thứ hợp lý mà **đặc tả không nêu**, và
 * thêm vào là tự đặt việc.
 *
 * ## Vì sao một BẢN GHI lượt gửi, không phải gửi thẳng
 *
 * Gửi đồng bộ trong một request HTTP là hết giờ ở lượt đầu tiên có trăm nghìn người nhận.
 * Nên `POST` chỉ ghi một hàng `PENDING` rồi trả ngay, và CLI xử lý theo lô.
 *
 * Bản ghi đó còn giải một việc khác: trả lời *"ai đã gửi gì cho ai, lúc nào"*. Một lượt gửi
 * tới toàn bộ người dùng là hành động không rút lại được — người ta đọc rồi. Không có bản
 * ghi thì sáu tháng sau không ai biết tấm thông báo đó từ đâu ra.
 *
 * ## Vì sao có con trỏ `lastUserId`
 *
 * Trăm nghìn người là vài phút chạy. Mất kết nối ở người thứ 60.000 mà không có con trỏ
 * thì lượt chạy lại bắt đầu từ đầu — và dù khoá chống trùng chặn gửi lại, nó vẫn phải đi
 * qua 60.000 lượt gọi vô ích trước khi tới chỗ còn dở.
 */

export const BroadcastAudienceTypes = [
  /** Toàn bộ người dùng đang hoạt động. */
  'ALL',
  /** Thành viên của một nhóm. */
  'GROUP',
  /** Người có Vị trí mặc định trong một bán kính. */
  'AREA',
] as const;

export type BroadcastAudienceType = (typeof BroadcastAudienceTypes)[number];

export const BroadcastStatuses = [
  'PENDING',
  'SENDING',
  'COMPLETED',
  /** Dừng vì lỗi không phải của một người nhận cụ thể — ví dụ mất database. */
  'FAILED',
] as const;

export type BroadcastStatus = (typeof BroadcastStatuses)[number];

export const MaxBroadcastTitleLength = 150;
export const MaxBroadcastBodyLength = 1_000;

export interface IBroadcastAudience {
  readonly type: BroadcastAudienceType;
  /** Chỉ có nghĩa với `GROUP`. */
  readonly groupId: string | null;
  /** Chỉ có nghĩa với `AREA`. */
  readonly centerLat: number | null;
  readonly centerLng: number | null;
  readonly radiusMeters: number | null;
}

export const AllUsersAudience: IBroadcastAudience = {
  type: 'ALL',
  groupId: null,
  centerLat: null,
  centerLng: null,
  radiusMeters: null,
};

function readCoordinate(value: unknown, limit: number): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  if (parsed < -limit || parsed > limit) return null;
  return parsed;
}

/**
 * Chuẩn hoá bộ người nhận.
 *
 * Giá trị lạ lùi về `ALL`? **Không.** Đó là hướng lùi sai duy nhất ở đây: một bộ lọc đọc
 * không ra mà biến thành "gửi cho tất cả" là gửi một tấm thông báo cho trăm nghìn người
 * thay vì cho một nhóm nhỏ. Nên trường `type` lạ giữ nguyên nó, và
 * `broadcastAudienceGaps` từ chối lượt gửi.
 */
export function normalizeBroadcastAudience(raw: unknown): IBroadcastAudience {
  if (typeof raw !== 'object' || raw === null)
    return { ...AllUsersAudience, type: 'ALL' };
  const source = raw as Record<string, unknown>;

  const type = BroadcastAudienceTypes.includes(
    source.type as BroadcastAudienceType,
  )
    ? (source.type as BroadcastAudienceType)
    : ('ALL' as BroadcastAudienceType);

  if (type === 'ALL') return AllUsersAudience;

  if (type === 'GROUP')
    return {
      type,
      groupId: typeof source.groupId === 'string' ? source.groupId : null,
      centerLat: null,
      centerLng: null,
      radiusMeters: null,
    };

  const radius = Number(source.radiusMeters);

  return {
    type,
    groupId: null,
    centerLat: readCoordinate(source.centerLat, 90),
    centerLng: readCoordinate(source.centerLng, 180),
    radiusMeters: Number.isFinite(radius) ? Math.trunc(radius) : null,
  };
}

/**
 * Những chỗ khiến lượt gửi KHÔNG hợp lệ.
 *
 * Bán kính bị kẹp vào cận kỹ thuật ở tầng truy vấn như mọi chỗ dùng PostGIS khác, nhưng
 * `0` hay số âm thì chặn ở đây: một bán kính 0 mét là gửi cho đúng những người có toạ độ
 * trùng khít tâm — gần như không ai — và Admin sẽ tưởng hệ thống hỏng.
 */
export function broadcastAudienceGaps(
  audience: IBroadcastAudience,
  raw?: unknown,
): string[] {
  const gaps: string[] = [];

  // `type` lạ không lùi về `ALL` được, nên phải bắt ở đây.
  if (
    typeof raw === 'object' &&
    raw !== null &&
    'type' in raw &&
    !BroadcastAudienceTypes.includes(
      (raw as { type: unknown }).type as BroadcastAudienceType,
    )
  )
    gaps.push(
      `audience.type phải là một trong ${BroadcastAudienceTypes.join(', ')}`,
    );

  if (audience.type === 'GROUP' && audience.groupId === null)
    gaps.push('audience.groupId là bắt buộc khi gửi theo nhóm');

  if (audience.type === 'AREA') {
    if (audience.centerLat === null || audience.centerLng === null)
      gaps.push(
        'audience.centerLat và audience.centerLng là bắt buộc khi gửi theo vùng',
      );
    if ((audience.radiusMeters ?? 0) < 1)
      gaps.push('audience.radiusMeters phải lớn hơn 0 khi gửi theo vùng');
  }

  return gaps;
}

/**
 * Mô tả bộ người nhận bằng chữ, để ghi vào audit và hiện trên CMS.
 *
 * Một hàng chỉ có `type: 'AREA'` và bốn con số thì người đọc lại phải tự dựng câu. Dựng ở
 * đây một lần, và nó là chỗ duy nhất biết cách đọc bốn cột đó thành một câu.
 */
export function describeBroadcastAudience(
  audience: IBroadcastAudience,
): string {
  if (audience.type === 'ALL') return 'toàn bộ người dùng đang hoạt động';
  if (audience.type === 'GROUP') return `thành viên nhóm ${audience.groupId}`;

  const km = ((audience.radiusMeters ?? 0) / 1_000).toFixed(1);
  return `người trong bán kính ${km} km quanh (${audience.centerLat}, ${audience.centerLng})`;
}

/**
 * Tiền tố khoá chống trùng cho một lượt gửi.
 *
 * Gắn `globalId` của lượt gửi, không gắn ngày: hai lượt gửi khác nhau trong cùng một ngày
 * là chuyện bình thường (sáng nhắc Rằm, chiều nhắc sự kiện), và một khoá theo ngày sẽ chặn
 * lượt thứ hai. Còn CHẠY LẠI cùng một lượt thì vẫn bị chặn đúng, vì `globalId` không đổi.
 */
export function broadcastIdempotencyKey(
  broadcastId: string,
  userId: string,
): string {
  return `BROADCAST:${broadcastId}:${userId}`;
}
