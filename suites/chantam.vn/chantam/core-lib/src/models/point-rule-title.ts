/**
 * Tiêu đề hiển thị của từng mã rule trong sổ điểm.
 *
 * Bảng nằm trong MÃ chứ không phải một cột của `point_rules`: nhiều mã trong sổ không
 * có dòng nào ở bảng đó — điều chỉnh tay, đảo bút toán, affiliate, điểm danh — nên một
 * cột ở đó chỉ đặt được tên cho một nửa lịch sử.
 *
 * Dựng ở máy chủ, cùng lối với `formatPointLogNote`: web và app đọc cùng một chuỗi
 * thay vì mỗi nơi tự dịch mã. Thêm rule mới mà quên đặt tên thì phép kiểm
 * `point-rule-title.inventory.spec.ts` bên `core` đỏ.
 */
export const PointRuleTitles: Readonly<Record<string, string>> = {
  PHONE_VERIFIED_FIRST_TIME: 'Xác minh số điện thoại lần đầu',
  ONBOARDING_COMPLETED: 'Hoàn thành hồ sơ người mới',
  REFERRAL_QUALIFIED: 'Giới thiệu thành viên mới',
  GIFT_COMPLETED_GIVER: 'Tặng quà thành công',
  GIFT_COMPLETED_RECEIVER: 'Nhận quà thành công',
  GIFT_VALUE_BONUS_GIVER: 'Thưởng giá trị món quà',
  POST_COMMENTED: 'Bình luận bài đăng',
  POST_REACTED: 'Bày tỏ cảm xúc với bài đăng',
  REPORT_UPHELD: 'Báo cáo vi phạm được xác nhận',
  CONTENT_VIOLATION_PENALTY: 'Phạt nội dung vi phạm',
  SHIP_UNPAID_PENALTY: 'Phạt không trả phí giao hàng',
  CHARITY_CONTRIBUTION_COMPLETED: 'Đóng góp từ thiện hoàn tất',
  CHECK_IN_DAILY: 'Điểm danh hằng ngày',
  CHECK_IN_STREAK_MILESTONE: 'Thưởng mốc điểm danh liên tiếp',
  GROUP_AFFILIATE: 'Thưởng hoạt động nhóm',
  GROUP_AFFILIATE_REVERSAL: 'Thu hồi thưởng hoạt động nhóm',
  ITEM_REDEMPTION: 'Đổi điểm nhận quà',
  MAINTENANCE_FAILED: 'Trừ điểm do chưa đạt duy trì hạng',
  ADMIN_ADJUSTMENT: 'Quản trị viên điều chỉnh điểm',
  REVERSAL: 'Hoàn điểm',
};

/**
 * Tiêu đề của một mã rule. Mã chưa có trong bảng thì trả NGUYÊN mã: người đọc thấy một
 * chuỗi lạ còn hơn thấy một tiêu đề đoán sai, và chuỗi lạ là dấu hiệu để thêm tên.
 */
export function pointRuleTitle(ruleCode: string): string {
  return PointRuleTitles[ruleCode] ?? ruleCode;
}
