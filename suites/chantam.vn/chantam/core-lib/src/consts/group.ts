export enum GroupStatuses {
  ACTIVE = 'ACTIVE',
  /**
   * Owner đã xoá tài khoản (CHỐT-02, BR-GRP-07).
   *
   * Link mời vô hiệu, không nhận thành viên/sự kiện/affiliate mới. Lịch sử
   * membership, ledger và audit GIỮ NGUYÊN để tra được.
   *
   * Không có trạng thái do Owner chủ động giải tán — BR-GRP-06 nói rõ nhóm
   * không có chức năng đó.
   */
  DISSOLVED = 'DISSOLVED',
}

/**
 * Hiệu lực của một dòng `group_memberships`.
 *
 * Có cột này vì "mỗi người một nhóm" phải là "mỗi người một membership ĐANG
 * HIỆU LỰC". Thiếu nó, thành viên của một nhóm đã giải tán bị coi là vẫn có nhóm
 * và không bao giờ vào được nhóm nào nữa — xem migration
 * `1795900000000-AddGroupMembershipStatus`.
 *
 * KHÔNG có `BANNED`: ban một người là `users.status`, và đường đó đã thu hồi
 * toàn bộ phiên của họ. Chép sang đây là tạo nguồn sự thật thứ hai.
 *
 * KHÔNG có `LEFT`: không rời, không chuyển nhóm (BR-GRP-06). Thêm giá trị đó là
 * mở một đường đặc tả cố ý đóng, và sẽ có người dùng.
 */
export enum GroupMembershipStatuses {
  ACTIVE = 'ACTIVE',
  /** Nhóm đã giải tán. Dòng ở lại làm lịch sử (CHỐT-02). */
  DISSOLVED = 'DISSOLVED',
}

/**
 * Dòng mốc cho một bộ quyền RỖNG.
 *
 * Thu hồi hết quyền của một vai là lựa chọn hợp lệ của Admin. Nhưng bộ đang hiệu
 * lực tính bằng `MAX(version)` của vai đó, nên một tập rỗng sẽ không có dòng nào
 * mang phiên bản mới — `MAX(version)` vẫn trỏ về bộ CŨ và việc thu hồi âm thầm
 * không có hiệu lực.
 *
 * Một dòng mang mã này giữ chỗ cho phiên bản đó. Nó không bao giờ khớp phép kiểm
 * quyền nào vì không nơi nào kiểm một quyền tên như vậy, và mọi chỗ ĐỌC bộ quyền
 * phải lọc nó ra — nếu không Admin sẽ thấy một quyền tên `__none__` trong danh
 * sách và tưởng nó có nghĩa.
 */
export const EmptyGroupPermissionSetMarker = '__none__';

export enum GroupMemberRoles {
  OWNER = 'OWNER',
  /**
   * Trưởng nhóm con.
   *
   * ⚠️ **Mở rộng ngoài SRS.** BR-GRP-05 chỉ chia Owner và Member, và §3255 nói
   * sub-team *"chỉ để tổ chức"*. Vai này thêm theo yêu cầu Bên A ngày
   * 2026-09-24; quyền của nó do Admin hệ thống cấu hình lúc chạy.
   */
  SUBTEAM_ADMIN = 'SUBTEAM_ADMIN',
  MEMBER = 'MEMBER',
}

/**
 * Khoá cấu hình bán kính vùng nhóm, đơn vị **MÉT**.
 *
 * Mét chứ không km, vì đó là đơn vị của mọi khoá bán kính khác trong hệ
 * (`discovery.*_radius_meters`) và là đơn vị mà `ST_DWithin` trên `geography`
 * nhận. Cột `groups.radius_km` giữ km vì nó đã như vậy từ đầu; chỗ đổi đơn vị nằm
 * ở đúng một hàm — `resolveGroupRadiusKm`.
 */
/**
 * Cửa sổ "Active Member" của affiliate, đơn vị NGÀY.
 *
 * Active Member là điều kiện LỌC lúc chia thưởng, không phải trạng thái được đánh
 * dấu: `users.status = ACTIVE` và `last_active_at` trong cửa sổ này. Không có job
 * nào ghi cờ `is_active`, và cố ý — xem `deploy/cron/README.md`.
 *
 * Tới 30/09 khoá này có dòng trong `system_configs` mà không ai đọc: bộ máy chia
 * thưởng chưa có, nên không chỗ nào cần con số. `GET /groups/:id/affiliate` nay
 * đọc nó để trả về SỐ NGƯỜI đủ điều kiện — tức khoá này có người đọc trước cả khi
 * bộ máy ra đời.
 */
export const AffiliateActiveMemberWindowConfigKey =
  'affiliate.active_member_window_days';

/** Dự phòng khi cấu hình thiếu hoặc hỏng. Bằng giá trị đang seed. */
export const DefaultActiveMemberWindowDays = 90;

/**
 * Kẹp cửa sổ Active Member.
 *
 * Dưới 1 ngày thì gần như không ai đủ điều kiện; trên 365 ngày thì "đang hoạt
 * động" mất nghĩa. Kẹp thay vì ném: một ô cấu hình gõ sai không được làm chết
 * trang affiliate của nhóm.
 */
export function normalizeActiveMemberWindowDays(raw: unknown): number {
  const days = Number(raw);

  return Number.isInteger(days) && days >= 1 && days <= 365
    ? days
    : DefaultActiveMemberWindowDays;
}

export const GroupDefaultRadiusConfigKey = 'group.default_radius_meters';

/**
 * Khoá bán kính RIÊNG cho một bậc thứ hạng, đơn vị **MÉT**.
 *
 * `group.radius_meters.diamond`, `group.radius_meters.gold`, …
 *
 * Thiếu khoá của bậc nào thì bậc đó dùng `group.default_radius_meters`. Nên bậc
 * chưa chốt số không bị rơi về 0 — 0 km là vùng rỗng, tức không sự kiện nào đủ
 * điều kiện địa lý và cả cơ chế affiliate tắt lặng lẽ.
 *
 * ## Vì sao KHÔNG dùng `capability_rank_values.limit_value`
 *
 * Bảng đó đã có chiều theo bậc và đã có đường Admin, nên thoạt trông là chỗ đúng.
 * Nhưng `limit_value` ở mọi capability khác nghĩa là **hạn mức đếm** (bao nhiêu
 * bài, bao nhiêu lượt). Nhồi thêm nghĩa "mét" cho đúng một capability là đặt hai
 * đơn vị vào một cột — chính cái bẫy đã cắn một lần ở đây: tới 30/09 bán kính đọc
 * `capability.limit` của `CREATE_GROUP` rồi kẹp bằng cận km, nên đặt `10000` với ý
 * "10 km" ra 50 km.
 *
 * Khoá riêng thì đơn vị nằm trong TÊN, và nó đi qua đúng đường Admin
 * (`POST /admin/system-configs`) với audit, phiên bản, copy-on-write và phép kiểm
 * khoảng hợp lệ có sẵn.
 */
export function groupRadiusConfigKeyForRank(rank: string): string {
  return `group.radius_meters.${rank.toLowerCase()}`;
}
export const GroupMinRadiusConfigKey = 'group.min_radius_meters';
export const GroupMaxRadiusConfigKey = 'group.max_radius_meters';

/**
 * Hằng dự phòng khi cấu hình thiếu hoặc hỏng, đơn vị **KM**.
 *
 * Hậu tố `Km` là bắt buộc trong tên: ba khoá cấu hình ở trên là mét, nên một hằng
 * tên `DefaultGroupRadius` trần sẽ bị đọc lẫn — và 10 với 10000 chênh nhau 1000
 * lần mà không có gì báo.
 */
export const DefaultGroupRadiusKm = 10;
export const MinGroupRadiusKm = 1;
export const MaxGroupRadiusKm = 50;

/**
 * Cận TUYỆT ĐỐI của cột `groups.radius_km`, phải khớp `CHK_groups_radius`.
 *
 * Đây KHÔNG phải cận cấu hình — cận cấu hình nằm ở `group.*_radius_meters` và
 * Admin sửa được. Cái này là bất biến của dữ liệu: vượt ra là database từ chối
 * ghi.
 *
 * Tách ra vì hai thứ đó trùng số hôm nay nhưng khác bản chất, và lần trùng số
 * đó đã che một lỗ thật: khi bán kính còn là hằng `MaxGroupRadiusKm`, không giá
 * trị nào vượt được CHECK. Nối cấu hình động vào mà vẫn kẹp bằng cận cấu hình
 * thì Admin đặt `group.default_radius_meters = 60000` sẽ ra 60 km → vi phạm
 * CHECK → **500 ở mọi lượt tạo nhóm**. Đổi một ô "sửa được mà vô nghĩa" thành
 * một ô "sửa sai thì sập" là đi lùi.
 *
 * Sửa cận này thì phải sửa CHECK trong cùng một migration, không thì nó nói dối.
 */
export const GroupRadiusColumnBoundsKm = { min: 1, max: 50 } as const;

/**
 * Độ dài mã mời.
 *
 * Đủ dài để không đoán được bằng cách thử: link mời không hết hạn và không giới
 * hạn lượt dùng, nên một mã đoán ra được là một cửa mở vĩnh viễn vào nhóm.
 */
export const GroupInviteCodeLength = 16;
