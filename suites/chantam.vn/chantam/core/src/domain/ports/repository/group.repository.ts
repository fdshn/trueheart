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

export interface IGroupOverview {
  readonly groupId: string;
  readonly ownerId: string;
  readonly ownerUsername: string;
  readonly name: string;
  readonly description: string | null;
  readonly avatarUrl: string | null;
  readonly coverUrl: string | null;
  readonly regionLabel: string;
  readonly radiusKm: number;
  readonly status: GroupStatuses;
  readonly activatedAt: Date;
  readonly memberCount: number;
  readonly subTeamCount: number;
  readonly myRole: GroupMemberRoles;
  readonly mySubTeamId: string | null;
  /** Chỉ Owner mới thấy — cùng quy tắc với `GET /groups/me`. */
  readonly inviteCode: string | null;
}

export interface IGroupActivityItem {
  readonly kind: 'MEMBER_JOINED' | 'POST_PUBLISHED' | 'GIFT_COMPLETED';
  readonly occurredAt: Date;
  readonly actorId: string;
  readonly actorUsername: string;
  /** Bài liên quan, nếu loại sự kiện có. */
  readonly subjectId: string | null;
  readonly subjectLabel: string | null;
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
   * Trang tổng quan một nhóm, nhìn từ mắt `viewerId`.
   *
   * `null` khi nhóm không tồn tại HOẶC người xem không thuộc nhóm đó — câu truy
   * vấn `INNER JOIN` membership, nên nó không phụ thuộc vào việc tầng trên có
   * nhớ kiểm quyền hay không.
   */
  findOverview(params: {
    groupId: string;
    viewerId: string;
  }): Promise<IGroupOverview | null>;

  /**
   * Dòng hoạt động của nhóm, dựng TỪ dữ liệu đã có (F55).
   *
   * Ba loại: thành viên mới vào, bài công khai của thành viên, lượt trao hoàn tất
   * tính cho phía người tặng. Không có bảng sự kiện riêng — một bảng như vậy đòi
   * mọi đường ghi phải nhớ append vào đó, và chỗ nào quên thì hoạt động thiếu một
   * cách không ai thấy.
   *
   * `subTeamId` khác rỗng = chỉ hoạt động của người trong tổ đó (dành cho trưởng
   * tổ, quyền `group.subteam.activity.view`).
   */
  listActivities(params: {
    groupId: string;
    subTeamId?: string | null;
    skip: number;
    take: number;
  }): Promise<{ items: IGroupActivityItem[]; total: number }>;

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

  /**
   * `true` khi người này đang thuộc một nhóm CÒN HIỆU LỰC.
   *
   * Dòng membership của một nhóm đã giải tán là lịch sử, không tính — nếu tính
   * thì thành viên cũ không lập được nhóm mới, mà cũng không vào được nhóm nào
   * khác vì đường duy nhất để vào là link mời cho tài khoản MỚI.
   */
  hasMembership(userId: string): Promise<boolean>;

  /**
   * Membership còn hiệu lực của một người trong một nhóm.
   *
   * Dùng để biết trưởng tổ đang ở tổ nào: `GET /groups/:id/members` trả tổ của
   * chính họ khi họ chỉ có `group.subteam.member.view`.
   */
  findMembership(params: {
    userId: string;
    groupId: string;
  }): Promise<{ role: GroupMemberRoles; subTeamId: string | null } | null>;

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

  createSubTeam(params: {
    globalId: string;
    groupId: string;
    name: string;
  }): Promise<void>;

  /**
   * Xoá MỀM một tổ, và gỡ mọi thành viên khỏi tổ đó trong cùng transaction.
   *
   * Người trong tổ vẫn ở lại NHÓM — tổ là cách tổ chức, không phải điều kiện ở
   * lại. Trưởng tổ của tổ bị xoá hạ về `MEMBER`: phạm vi của vai đó đọc từ
   * `sub_team_id`, nên giữ vai là để lại một người mang danh trưởng mà mọi
   * endpoint đều từ chối.
   *
   * Trả `false` khi tổ không tồn tại, thuộc nhóm khác, hoặc đã xoá rồi.
   */
  deleteSubTeam(params: {
    groupId: string;
    subTeamId: string;
  }): Promise<boolean>;

  /** `subTeamId` khác `undefined`/`null` = chỉ tổ đó (dành cho trưởng tổ). */
  listSubTeams(params: {
    groupId: string;
    subTeamId?: string | null;
  }): Promise<{ subTeamId: string; name: string; memberCount: number }[]>;

  /**
   * Xếp một thành viên vào tổ và/hoặc đổi vai.
   *
   * `subTeamId` phải thuộc CHÍNH nhóm đó — nếu không, Owner nhóm A xếp được
   * người của mình vào tổ của nhóm B. Trả `false` khi không khớp gì.
   *
   * KHÔNG đổi được vai `OWNER`: chủ nhóm là người tạo, và hạ vai họ bằng endpoint
   * quản lý thành viên là để lại một nhóm không ai quản trị được.
   */
  assignMember(params: {
    groupId: string;
    userId: string;
    /**
     * `undefined` = GIỮ tổ hiện tại, `null` = gỡ khỏi tổ.
     *
     * Hai thứ này phải khác nhau. Gộp chúng lại thì không có cách nào đổi vai mà
     * giữ tổ, và phong trưởng tổ cho ai sẽ gỡ họ khỏi đúng cái tổ họ sắp quản.
     */
    subTeamId?: string | null;
    role: GroupMemberRoles | null;
  }): Promise<boolean>;

  listMembers(params: {
    groupId: string;
    /** Chỉ thành viên của tổ này. `undefined`/`null` = cả nhóm. */
    subTeamId?: string | null;
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
   * Bộ quyền ĐANG HIỆU LỰC của từng vai, kèm số phiên bản.
   *
   * Dòng mốc của bộ rỗng (`EmptyGroupPermissionSetMarker`) bị lọc ra — nó giữ chỗ
   * cho phiên bản, không phải một quyền.
   */
  listRolePermissions(): Promise<
    { role: GroupMemberRoles; version: number; permissions: string[] }[]
  >;

  /**
   * Thay CẢ TẬP quyền của một vai, ghi thành phiên bản mới.
   *
   * Dòng cũ ở lại làm lịch sử: một bộ quyền ghi đè tại chỗ thì không tra lại được
   * bộ nào đang chạy lúc một trưởng nhóm bị từ chối.
   *
   * Trả `before` để nơi gọi ghi audit — so được trước/sau là toàn bộ giá trị của
   * một dòng audit.
   */
  replaceRolePermissions(params: {
    role: GroupMemberRoles;
    permissions: readonly string[];
    actorUserId: string;
    changeReason: string;
  }): Promise<{ version: number; permissions: string[]; before: string[] }>;

  /**
   * Giải tán nhóm khi Owner xoá tài khoản (CHỐT-02, BR-GRP-07).
   *
   * Giữ nguyên membership, ledger và audit — chỉ đổi trạng thái. Xoá đi thì mọi
   * bút toán affiliate đã phát sinh trỏ vào một nhóm không còn tồn tại.
   *
   * Membership của nhóm đó cũng chuyển sang `DISSOLVED` trong CÙNG transaction:
   * dòng ở lại làm lịch sử, nhưng thôi hiệu lực để thành viên cũ không bị khoá
   * ngoài hệ thống nhóm vĩnh viễn.
   *
   * Trả số nhóm đã giải tán; `0` là bình thái khi người đó không sở hữu nhóm nào.
   */
  dissolveOwnedBy(ownerId: string): Promise<number>;
}

export const IGroupRepository = Symbol('IGroupRepository');
