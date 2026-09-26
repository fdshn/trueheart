import {
  IChangeAdminUserStatusCommand,
  IChangeAdminUserStatusResult,
  IChangeAdminUserStatusUseCase,
  IDeleteAdminUserCommand,
  IDeleteAdminUserResult,
  IDeleteAdminUserUseCase,
  IGetAdminUserCommand,
  IGetAdminUserResult,
  IGetAdminUserUseCase,
  IListAdminUsersCommand,
  IListAdminUsersResult,
  IListAdminUsersUseCase,
  IReleaseVerifiedPhoneCommand,
  IReleaseVerifiedPhoneResult,
  IReleaseVerifiedPhoneUseCase,
} from '@/application/contracts/admin-config';
import {
  SelfRoleChangeException,
  UserNotFoundException,
  VerifiedPhoneInUseException,
  VerifiedPhoneNotFoundException,
} from '@/domain/exceptions';
import {
  IAdminConfigRepository,
  IAdminUserRepository,
  IUserSessionRepository,
  IVerifiedPhoneRepository,
} from '@/domain/ports/repository';
import { UserStatuses } from '@chantam.vn/chantam.core-lib/consts';
import { normalizePhoneNumber } from '@chantam.vn/chantam.core-lib/models';
import { ITokenDenyList } from '@chantam/service.auth-lib';
import { PaginationMetaDto, toSkipTake } from '@chantam/service.common-lib/dto';
import {
  ForbiddenException,
  ValidationFailedException,
} from '@chantam/service.common-lib/exception';
import { Inject, Injectable } from '@nestjs/common';

const ManagePermission = 'admin.manage';

/** Những trạng thái khiến phiên đang mở phải bị cắt ngay. */
const LockingStatuses: UserStatuses[] = [
  UserStatuses.SUSPENDED,
  UserStatuses.BANNED,
];

@Injectable()
export class ListAdminUsersUseCase implements IListAdminUsersUseCase {
  public constructor(
    @Inject(IAdminConfigRepository)
    private readonly permissions: IAdminConfigRepository,
    @Inject(IAdminUserRepository)
    private readonly users: IAdminUserRepository,
  ) {}

  public async handle(
    command: IListAdminUsersCommand,
  ): Promise<IListAdminUsersResult> {
    await assertCanManage(this.permissions, command.actorUserId);

    const { skip, take } = toSkipTake(command);
    const { entries, total } = await this.users.search({
      username: command.username,
      email: command.email,
      phone: command.phone,
      rank: command.rank,
      status: command.status,
      adminRole: command.adminRole,
      phoneVerified: command.phoneVerified,
      emailVerified: command.emailVerified,
      accuracyReviewRequired: command.accuracyReviewRequired,
      registeredFrom: command.registeredFrom,
      registeredTo: command.registeredTo,
      includeDeleted: command.includeDeleted,
      skip,
      take,
    });

    return {
      users: entries,
      meta: new PaginationMetaDto(Math.floor(skip / take) + 1, take, total),
    };
  }
}

@Injectable()
export class GetAdminUserUseCase implements IGetAdminUserUseCase {
  public constructor(
    @Inject(IAdminConfigRepository)
    private readonly permissions: IAdminConfigRepository,
    @Inject(IAdminUserRepository)
    private readonly users: IAdminUserRepository,
  ) {}

  public async handle(
    command: IGetAdminUserCommand,
  ): Promise<IGetAdminUserResult> {
    await assertCanManage(this.permissions, command.actorUserId);

    const user = await this.users.findOne(command.targetUserId);
    if (!user) throw new UserNotFoundException();

    return { user };
  }
}

@Injectable()
export class ChangeAdminUserStatusUseCase implements IChangeAdminUserStatusUseCase {
  public constructor(
    @Inject(IAdminConfigRepository)
    private readonly permissions: IAdminConfigRepository,
    @Inject(IAdminUserRepository)
    private readonly users: IAdminUserRepository,
    @Inject(IUserSessionRepository)
    private readonly sessions: IUserSessionRepository,
    @Inject(ITokenDenyList)
    private readonly denyList: ITokenDenyList,
  ) {}

  public async handle(
    command: IChangeAdminUserStatusCommand,
  ): Promise<IChangeAdminUserStatusResult> {
    await assertCanManage(this.permissions, command.actorUserId);
    assertNotSelf(command.actorUserId, command.targetUserId);

    const { status, suspendedUntil, reason } = command.statusChange;
    assertReason(reason);

    if (status === UserStatuses.SUSPENDED && !suspendedUntil)
      throw new ValidationFailedException([
        'suspendedUntil là bắt buộc khi tạm khoá tài khoản',
      ]);

    const user = await this.users.changeStatus({
      actorUserId: command.actorUserId,
      targetUserId: command.targetUserId,
      status,
      // Chỉ SUSPENDED mới giữ mốc; bỏ khoá mà còn mốc cũ là khoá lại lần sau.
      suspendedUntil:
        status === UserStatuses.SUSPENDED ? (suspendedUntil ?? null) : null,
      reason: reason.trim(),
    });

    const revokedSessions = LockingStatuses.includes(status)
      ? await revokeEverything(
          this.denyList,
          this.sessions,
          command.targetUserId,
        )
      : 0;

    return { user, revokedSessions };
  }
}

@Injectable()
export class DeleteAdminUserUseCase implements IDeleteAdminUserUseCase {
  public constructor(
    @Inject(IAdminConfigRepository)
    private readonly permissions: IAdminConfigRepository,
    @Inject(IAdminUserRepository)
    private readonly users: IAdminUserRepository,
    @Inject(IUserSessionRepository)
    private readonly sessions: IUserSessionRepository,
    @Inject(ITokenDenyList)
    private readonly denyList: ITokenDenyList,
  ) {}

  public async handle(
    command: IDeleteAdminUserCommand,
  ): Promise<IDeleteAdminUserResult> {
    await assertCanManage(this.permissions, command.actorUserId);
    assertNotSelf(command.actorUserId, command.targetUserId);
    assertReason(command.deletion.reason);

    const user = await this.users.softDelete({
      actorUserId: command.actorUserId,
      targetUserId: command.targetUserId,
      reason: command.deletion.reason.trim(),
    });

    return {
      user,
      revokedSessions: await revokeEverything(
        this.denyList,
        this.sessions,
        command.targetUserId,
      ),
    };
  }
}

async function assertCanManage(
  permissions: IAdminConfigRepository,
  actorUserId: string,
): Promise<void> {
  if (!(await permissions.hasPermission(actorUserId, ManagePermission)))
    throw new ForbiddenException();
}

function assertNotSelf(actorUserId: string, targetUserId: string): void {
  // Tự khoá hoặc tự xoá là tự nhốt mình ra ngoài, và nếu đó là admin cuối cùng
  // thì không còn ai mở lại được.
  if (actorUserId === targetUserId) throw new SelfRoleChangeException();
}

function assertReason(reason: string): void {
  if (!reason?.trim())
    throw new ValidationFailedException(['reason không được để trống']);
}

/**
 * Giết access token TRƯỚC, rồi mới thu hồi phiên trong database.
 *
 * Thiếu vế đầu thì token cũ sống tới lúc hết hạn; thiếu vế sau thì nạn nhân gọi
 * `/refresh` là có token mới. Redis và Postgres không chung transaction nên thứ
 * tự là thứ duy nhất bảo vệ được.
 */
async function revokeEverything(
  denyList: ITokenDenyList,
  sessions: IUserSessionRepository,
  userId: string,
): Promise<number> {
  await denyList.revokeIssuedBefore(userId);

  const result = await sessions
    .createQueryBuilder()
    .update()
    .set({ revokedAt: () => 'now()', fcmToken: null })
    .where('user_id = :userId', { userId })
    .andWhere('revoked_at IS NULL')
    .execute();

  return result.affected ?? 0;
}

/**
 * Van xả cho sổ số đã xác minh.
 *
 * Một SĐT chỉ xác minh được cho MỘT tài khoản, vĩnh viễn — đó là thứ chặn vòng
 * lặp tài khoản ảo. Nhưng mất máy, đổi số, hay số bị nhà mạng thu hồi rồi cấp
 * cho người khác đều là chuyện sẽ xảy ra, và không có van thì người dùng thật
 * bị khoá vĩnh viễn khỏi chính số của mình.
 */
@Injectable()
export class ReleaseVerifiedPhoneUseCase implements IReleaseVerifiedPhoneUseCase {
  public constructor(
    @Inject(IAdminConfigRepository)
    private readonly permissions: IAdminConfigRepository,
    @Inject(IVerifiedPhoneRepository)
    private readonly verifiedPhones: IVerifiedPhoneRepository,
  ) {}

  public async handle(
    command: IReleaseVerifiedPhoneCommand,
  ): Promise<IReleaseVerifiedPhoneResult> {
    await assertCanManage(this.permissions, command.actorUserId);
    assertReason(command.release.reason);

    // Nắn trước khi tra: Admin gõ `0912345678` còn sổ lưu băm của
    // `+84912345678`, không nắn thì không bao giờ tìm thấy gì.
    const phone = normalizePhoneNumber(command.release.phone);

    if (!phone)
      throw new ValidationFailedException([
        'release.phone: số điện thoại không hợp lệ',
      ]);

    const outcome = await this.verifiedPhones.release({
      phone,
      actorUserId: command.actorUserId,
      reason: command.release.reason.trim(),
    });

    if (outcome.status === 'NOT_FOUND')
      throw new VerifiedPhoneNotFoundException();

    if (outcome.status === 'IN_USE')
      throw new VerifiedPhoneInUseException(outcome.holder.username);

    return {
      phone,
      previousHolder: {
        userId: outcome.holder.userId,
        username: outcome.holder.username,
        verifiedAt: outcome.holder.verifiedAt,
        holderDeleted: outcome.holder.holderDeleted,
      },
    };
  }
}
