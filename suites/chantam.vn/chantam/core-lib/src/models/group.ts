import {
  DefaultGroupRadiusKm,
  GroupMemberRoles,
  GroupStatuses,
  MaxGroupRadiusKm,
  MinGroupRadiusKm,
} from '../consts';

export interface IGroup {
  ownerId: string;
  name: string;
  description: string | null;
  avatarUrl: string | null;
  coverUrl: string | null;
  /**
   * Nhãn vùng, chụp lại lúc tạo cùng tâm và bán kính.
   *
   * Owner KHÔNG đổi được tâm/bán kính về sau (BR-GRP-03): cho đổi thì người ta
   * dời vùng theo nơi đang có nhiều sự kiện để gom điểm.
   */
  regionLabel: string;
  radiusKm: number;
  /** Không tự hết hạn, không giới hạn lượt dùng (BR-GRP-04). */
  inviteCode: string;
  status: GroupStatuses;
  activatedAt: Date;
  dissolvedAt: Date | null;
}

export interface ISubTeam {
  groupId: string;
  name: string;
}

export interface IGroupMembership {
  groupId: string;
  userId: string;
  /** `null` khi chưa xếp vào tổ nào. */
  subTeamId: string | null;
  role: GroupMemberRoles;
  joinedAt: Date;
}

/**
 * Bán kính vùng nhóm: đọc MÉT từ cấu hình, trả KM cho cột `groups.radius_km`.
 *
 * ## Vì sao hàm này thay `normalizeGroupRadiusKm`
 *
 * Bản cũ nhận `capability.limit` của `CREATE_GROUP` làm bán kính, rồi kẹp bằng bộ
 * cận **km** (1 và 50). Hôm nay `limit_value` là NULL nên nó rơi về fallback 10 km
 * và cho ra đúng — nhưng ô đó Admin sửa được, và mọi khoá bán kính khác trong hệ
 * đều đặt tên bằng **mét**. Một người đặt `10000` với ý "10 km" sẽ nhận
 * `min(50, max(1, 10000))` = **50 km**: gấp 5 lần bán kính, 25 lần diện tích,
 * không lỗi, không cảnh báo.
 *
 * Và `groups.radius_km` là **snapshot cố định lúc tạo** (BR-GRP-03), nên mọi nhóm
 * tạo trong khoảng đó sai vĩnh viễn. Ranh giới ấy chính là hàng rào chống gian lận
 * của affiliate (19 §19.5): phóng nó lên 25 lần diện tích là mở đúng cửa mà điều
 * kiện địa lý sinh ra để đóng.
 *
 * Nên bán kính nay đọc từ `group.*_radius_meters` — ba khoá tên đã nói rõ đơn vị —
 * và `capability.limit` của `CREATE_GROUP` không còn tham gia. Cách chắc nhất để
 * một bẫy đơn vị không bị đọc sai là bỏ hẳn cái ô mơ hồ đi.
 *
 * ## Vì sao kẹp thay vì ném
 *
 * Cấu hình gõ nhầm không được làm chết đường tạo nhóm: đó là lỗi cấu hình, không
 * phải lỗi của người đang tạo nhóm. Cận cũng được kẹp theo nhau — min lớn hơn max
 * là một cấu hình vô nghĩa, và ưu tiên max để không ai bị chặn tạo nhóm.
 *
 * ## Làm tròn
 *
 * Cột là `int` km nên độ phân giải là 1 km: 1.500 m ra 2 km. `Math.round` chứ không
 * `trunc` — làm tròn xuống thì 1.900 m thành 1 km, tức vùng hẹp hơn nửa so với
 * cấu hình. Muốn chính xác tới mét thì phải đổi cột, và việc đó chưa cần.
 */
export function resolveGroupRadiusKm(config: {
  defaultMeters: unknown;
  minMeters: unknown;
  maxMeters: unknown;
}): number {
  const toKm = (raw: unknown, fallbackKm: number): number => {
    const meters = Number(raw);

    return Number.isFinite(meters) && meters > 0
      ? Math.max(1, Math.round(meters / 1000))
      : fallbackKm;
  };

  const min = toKm(config.minMeters, MinGroupRadiusKm);
  const max = Math.max(min, toKm(config.maxMeters, MaxGroupRadiusKm));

  return Math.min(
    max,
    Math.max(min, toKm(config.defaultMeters, DefaultGroupRadiusKm)),
  );
}
