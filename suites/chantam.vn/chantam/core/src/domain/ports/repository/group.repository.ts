import {
  GroupMemberRoles,
  GroupStatuses,
} from '@chantam.vn/chantam.core-lib/consts';
import { IGeoPoint } from '@chantam/service.persistency-lib';

export interface ICreateGroupParams {
  readonly globalId: string;
  readonly ownerId: string;
  readonly name: string;
  readonly description: string | null;
  readonly avatarUrl: string | null;
  readonly coverUrl: string | null;
  readonly centerLocation: IGeoPoint;
  readonly regionLabel: string;
  readonly radiusKm: number;
  readonly inviteCode: string;
  /** Membership OWNER được tạo trong CÙNG transaction. */
  readonly ownerMembershipId: string;
}

export interface IGroupSummary {
  readonly groupId: string;
  readonly ownerId: string;
  readonly name: string;
  readonly regionLabel: string;
  readonly radiusKm: number;
  readonly status: GroupStatuses;
  readonly memberCount: number;
  /** Chỉ Owner mới thấy — link mời là cửa vào nhóm. */
  readonly inviteCode: string | null;
  readonly myRole: GroupMemberRoles | null;
}

export interface IGroupMemberItem {
  readonly userId: string;
  readonly username: string;
  readonly role: GroupMemberRoles;
  readonly subTeamId: string | null;
  readonly subTeamName: string | null;
  readonly joinedAt: Date;
}

export interface IGroupRepository {
  /**
   * Tạo nhóm và membership OWNER trong MỘT transaction.
   *
   * Tách hai bước là để lại một nhóm không có chủ nếu tiến trình chết giữa
   * chừng — và nhóm đó không ai quản lý được, vì quyền quản lý đọc từ chính
   * bảng membership.
   */
  createWithOwner(params: ICreateGroupParams): Promise<void>;

  /** Nhóm người này đang thuộc về, kèm vai. `null` khi chưa vào nhóm nào. */
  findMine(userId: string): Promise<IGroupSummary | null>;

  /**
   * Nhóm còn ACTIVE ứng với mã mời.
   *
   * `null` khi mã sai HOẶC nhóm đã giải tán — hai thứ này cố ý không phân biệt:
   * trả lời khác nhau là để người lạ dò xem mã nào từng tồn tại.
   */
  findActiveByInviteCode(inviteCode: string): Promise<{
    groupId: string;
    ownerId: string;
  } | null>;

  /** `true` khi người này đã thuộc một nhóm nào đó. */
  hasMembership(userId: string): Promise<boolean>;

  /**
   * Thêm thành viên qua link mời.
   *
   * Ném khi người đó đã có nhóm — ràng buộc UNIQUE ở database là lớp chặn cuối,
   * và đây là lớp cho ra thông báo đọc được.
   */
  addMember(params: {
    globalId: string;
    groupId: string;
    userId: string;
  }): Promise<void>;

  listMembers(params: {
    groupId: string;
    skip: number;
    take: number;
  }): Promise<{ items: IGroupMemberItem[]; total: number }>;

  /**
   * Quyền của một người TRÊN MỘT NHÓM cụ thể.
   *
   * Luôn mang `groupId`: RBAC Admin là toàn cục và không diễn đạt được "có
   * quyền X trên nhóm nào", nên gán quyền nhóm ở đó là cho quyền trên MỌI nhóm.
   */
  hasGroupPermission(params: {
    userId: string;
    groupId: string;
    permission: string;
  }): Promise<boolean>;

  /**
   * Giải tán nhóm khi Owner xoá tài khoản (CHỐT-02, BR-GRP-07).
   *
   * Giữ nguyên membership, ledger và audit — chỉ đổi trạng thái. Xoá đi thì mọi
   * bút toán affiliate đã phát sinh trỏ vào một nhóm không còn tồn tại.
   *
   * Trả số nhóm đã giải tán; `0` là bình thái khi người đó không sở hữu nhóm nào.
   */
  dissolveOwnedBy(ownerId: string): Promise<number>;
}

export const IGroupRepository = Symbol('IGroupRepository');
