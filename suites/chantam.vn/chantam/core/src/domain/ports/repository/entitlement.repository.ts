import { UserRanks } from '@chantam.vn/chantam.core-lib/consts';
import {
  IEntitlementDto,
  IEntitlementPolicyRevisionDto,
  IEntitlementsSummaryDto,
} from '@chantam.vn/chantam.core-lib/dto';

/**
 * Một ô cần đổi trong bảng capability × rank.
 *
 * `allowed` và `limit` đều không bắt buộc: bỏ trống là giữ nguyên giá trị đang
 * có, chứ không phải đặt về false/null. Nhờ vậy admin sửa quota Gold mà không
 * phải gửi lại toàn bộ bảng và vô tình ghi đè thay đổi của người khác.
 */
export interface IEntitlementPolicyRankPatch {
  readonly rank: UserRanks;
  readonly allowed?: boolean;
  readonly limit?: number | null;
}

export interface IEntitlementPolicyCapabilityPatch {
  readonly code: string;
  readonly enabled?: boolean;
  readonly ranks?: IEntitlementPolicyRankPatch[];
}

export interface IPublishEntitlementPolicyCommand {
  readonly actorUserId: string;
  readonly changeReason: string;
  readonly capabilities: IEntitlementPolicyCapabilityPatch[];
}

export interface IEntitlementRepository {
  getOwnEntitlements(userId: string): Promise<IEntitlementsSummaryDto>;
  getCapability(userId: string, code: string): Promise<IEntitlementDto | null>;
  /** Bản chính sách đang hiệu lực tại thời điểm gọi. */
  getPolicyRevision(): Promise<IEntitlementPolicyRevisionDto>;
  /**
   * Đóng bản đang hiệu lực và mở bản mới trong cùng một transaction.
   *
   * Không sửa tại chỗ: `config_revisions` có ràng buộc GIST cấm hai bản
   * PUBLISHED cùng scope trùng khung thời gian, và lịch sử ai đổi gì lúc nào
   * chính là thứ khiến bảng này đáng tin.
   */
  publishPolicyRevision(
    command: IPublishEntitlementPolicyCommand,
  ): Promise<IEntitlementPolicyRevisionDto>;
}

export const IEntitlementRepository = Symbol('IEntitlementRepository');
