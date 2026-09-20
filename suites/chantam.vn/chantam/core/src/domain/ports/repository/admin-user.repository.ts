import { UserRanks, UserStatuses } from '@chantam.vn/chantam.core-lib/consts';

/** Hồ sơ người dùng ở góc nhìn quản trị. Không bao giờ chứa hash mật khẩu. */
export interface IAdminUserSummary {
  readonly userId: string;
  readonly username: string;
  readonly fullName: string | null;
  readonly email: string | null;
  readonly phone: string | null;
  readonly rank: UserRanks;
  readonly status: UserStatuses;
  readonly phoneVerified: boolean;
  readonly suspendedUntil: Date | null;
  readonly createdAt: Date;
  readonly deletedAt: Date | null;
  readonly adminRoles: string[];
}

export interface IAdminUserQuery {
  /** Khớp một phần, không phân biệt hoa thường. */
  readonly username?: string;
  readonly email?: string;
  readonly phone?: string;
  readonly rank?: UserRanks;
  readonly status?: UserStatuses;
  /** Chỉ lấy người đang giữ role quản trị này. */
  readonly adminRole?: string;
  readonly phoneVerified?: boolean;
  readonly registeredFrom?: Date;
  readonly registeredTo?: Date;
  /**
   * Mặc định ẩn tài khoản đã xoá. Bật lên khi cần tra cứu lịch sử — dữ liệu
   * cá nhân đã bị ẩn danh lúc xoá nên vẫn không lộ gì thêm.
   */
  readonly includeDeleted?: boolean;
  readonly skip: number;
  readonly take: number;
}

export interface IAdminUserPage {
  readonly entries: IAdminUserSummary[];
  readonly total: number;
}

export interface IAdminUserStatusChange {
  readonly actorUserId: string;
  readonly targetUserId: string;
  readonly status: UserStatuses;
  readonly suspendedUntil: Date | null;
  readonly reason: string;
}

export interface IAdminUserDeletion {
  readonly actorUserId: string;
  readonly targetUserId: string;
  readonly reason: string;
}

export interface IAdminUserRepository {
  search(query: IAdminUserQuery): Promise<IAdminUserPage>;
  findOne(userId: string): Promise<IAdminUserSummary | null>;
  /** Đổi trạng thái tài khoản và ghi audit. KHÔNG đụng tới hạng hay điểm. */
  changeStatus(change: IAdminUserStatusChange): Promise<IAdminUserSummary>;
  /** Xoá mềm kèm ẩn danh dữ liệu cá nhân, giữ username để chống mạo danh. */
  softDelete(deletion: IAdminUserDeletion): Promise<IAdminUserSummary>;
}

export const IAdminUserRepository = Symbol('IAdminUserRepository');
