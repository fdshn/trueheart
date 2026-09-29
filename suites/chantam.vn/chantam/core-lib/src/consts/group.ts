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
export const GroupDefaultRadiusConfigKey = 'group.default_radius_meters';
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
 * Độ dài mã mời.
 *
 * Đủ dài để không đoán được bằng cách thử: link mời không hết hạn và không giới
 * hạn lượt dùng, nên một mã đoán ra được là một cửa mở vĩnh viễn vào nhóm.
 */
export const GroupInviteCodeLength = 16;
