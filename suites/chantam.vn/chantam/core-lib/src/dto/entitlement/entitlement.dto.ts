import { UserRanks } from '../../consts';
import { CapabilityKinds } from '../../models/entitlement';

export interface IEntitlementDto {
  code: string;
  /**
   * Cách đọc ba trường dưới. Dẫn xuất trong code, không phải một ô Admin đặt được
   * — xem `CapabilityKindByCode`.
   *
   * - `QUOTA`: `limit`, `used`, `remaining` đều có nghĩa.
   * - `GATE`: chỉ `allowed` có nghĩa; ba trường kia là `null`.
   * - `VALUE`: `limit` là một con số KHÔNG tiêu dần (ví dụ bán kính theo mét);
   *   `used` và `remaining` là `null`.
   */
  kind: CapabilityKinds;
  allowed: boolean;
  limit: number | null;
  /**
   * Đã dùng bao nhiêu, `null` khi capability này không có bộ đếm nào.
   *
   * Trước 01/10 trường này luôn là một số, và bằng `0` cho mọi capability trừ
   * `POST_OPEN`. Đo được: một người có đúng 5/5 yêu cầu đang mở — server trả 403
   * *"đang có 5/5 yêu cầu chưa ngã ngũ"* — cùng lúc endpoint này nói
   * `used: 0, remaining: 5`. Mà §24.6 nói rõ app dùng chính endpoint này để ẩn/hiện nút,
   * nên app hiện nút "Xin nhận" rồi người dùng ăn 403.
   *
   * `null` thay vì `0`: "không đếm" và "đã dùng 0" là hai câu khác nhau, và một số 0
   * không tự phân biệt được chúng.
   */
  used: number | null;
  remaining: number | null;
  reasonCode: string | null;
}

export interface IEntitlementsSummaryDto {
  rank: UserRanks;
  policyRevisionId: number;
  capabilities: IEntitlementDto[];
}

export interface IGetOwnEntitlementsResponseDto {
  entitlements: IEntitlementsSummaryDto;
}

/**
 * Một bản chính sách trong LỊCH SỬ, kèm khung thời gian nó từng hiệu lực.
 *
 * `capability_policies.revision_id` trỏ `config_revisions` từ đầu, và bảng đó giữ đủ
 * `effective_from`/`effective_to` cùng `PUBLISHED`/`ARCHIVED`. Nhưng trước 01/10 không
 * endpoint nào đọc chúng, nên câu "bài bị từ chối vì quota thì lúc đó quota là bao
 * nhiêu" chỉ trả lời được bằng SQL tay.
 */
export interface IEntitlementPolicyHistoryEntryDto {
  revisionId: number;
  status: string;
  effectiveFrom: Date;
  /** `null` là bản đang hiệu lực. */
  effectiveTo: Date | null;
  changeReason: string | null;
  /** Số capability có trong bản đó — để thấy bản nào thêm/bịt mã nào. */
  capabilityCount: number;
}

export interface IGetEntitlementPolicyHistoryResponseDto {
  revisions: IEntitlementPolicyHistoryEntryDto[];
}

/** Giá trị của một capability tại một bậc rank. */
export interface IEntitlementPolicyRankValueDto {
  rank: UserRanks;
  allowed: boolean;
  /**
   * Hạn mức tại bậc này.
   *
   * Với capability `QUOTA` thì `null` được đọc thành **0**, không phải "không giới
   * hạn" — xem `resolveQuotaLimit`. Dòng ghi chú trước 01/10 ở đây nói ngược lại, trong
   * khi `create-post` và `create-gift-request` đều đọc `limit ?? 0`: Admin xoá trống ô
   * định mở khoá thì thực tế là khoá sạch cả bậc đó.
   *
   * Đường Admin ghi nay Từ CHỐI ô trống cho capability `QUOTA` đang bật, nên chỗ nhập
   * nhằng đó không tạo ra được nữa.
   *
   * Với `GATE` thì trường này không có nghĩa và bị bỏ qua.
   */
  limit: number | null;
}

export interface IEntitlementPolicyCapabilityDto {
  code: string;
  /** Tắt ở đây là tắt cho mọi rank, bất kể từng rank cho phép hay không. */
  enabled: boolean;
  ranks: IEntitlementPolicyRankValueDto[];
}

export interface IEntitlementPolicyRevisionDto {
  revisionId: number;
  effectiveFrom: Date;
  changeReason: string | null;
  capabilities: IEntitlementPolicyCapabilityDto[];
}

export interface IGetEntitlementPolicyResponseDto {
  policy: IEntitlementPolicyRevisionDto;
}

export interface IPublishEntitlementPolicyResponseDto {
  policy: IEntitlementPolicyRevisionDto;
}
