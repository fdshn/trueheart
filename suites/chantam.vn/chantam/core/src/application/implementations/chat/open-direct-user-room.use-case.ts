import {
  IOpenDirectUserRoomCommand,
  IOpenDirectUserRoomUseCase,
} from '@/application/contracts/chat';
import {
  ChatDirectUserSelfException,
  ChatRecipientUnavailableException,
  ChatRoomNotFoundException,
  TooManyRequestsException,
  UserNotFoundException,
} from '@/domain/exceptions';
import { IConfig } from '@/domain/ports/config';
import {
  IAdminConfigRepository,
  IChatRepository,
  IUserRepository,
} from '@/domain/ports/repository';
import { UserStatuses } from '@chantam.vn/chantam.core-lib/consts';
import { IOpenDirectUserRoomResponseDto } from '@chantam.vn/chantam.core-lib/dto';
import { ValidationFailedException } from '@chantam/service.common-lib/exception';
import { Inject, Injectable } from '@nestjs/common';
import { ProfileGate } from '../profile/profile-gate';
import { toRoomSummary } from './chat.use-cases';

/** Số phòng `DIRECT_USER` MỚI một người mở được trong 24 giờ — Admin chỉnh được. */
export const DirectUserDailyLimitConfigKey = 'chat.direct_user_daily_limit';
export const DefaultDirectUserDailyLimit = 20;

/**
 * Cấu hình hỏng (thiếu, không phải số nguyên, âm) thì về mặc định: một dòng JSON gõ nhầm
 * không được biến thành "không giới hạn". `0` là hợp lệ — Admin tắt hẳn khi bị spam.
 */
export function normalizeDirectUserDailyLimit(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
    ? value
    : DefaultDirectUserDailyLimit;
}

/**
 * Mở phòng chat trực tiếp với một người dùng — từ danh sách online hoặc hồ sơ công khai.
 *
 * Một cặp người đúng một phòng, dù ai mở trước; mở lại trả phòng cũ (`created: false`).
 * Phòng MỚI phải qua: hồ sơ đủ của người mở, không có quan hệ chặn, người nhận cho phép
 * người lạ nhắn tin (hoặc hai người đã từng có phòng chat), và còn suất trong ngày.
 *
 * Chặn và "không nhận tin người lạ" ra CÙNG một lỗi chung: người bị chặn không được biết mình
 * bị chặn.
 */
@Injectable()
export class OpenDirectUserRoomUseCase implements IOpenDirectUserRoomUseCase {
  public constructor(
    @Inject(IUserRepository) private readonly users: IUserRepository,
    @Inject(IChatRepository) private readonly chat: IChatRepository,
    private readonly profileGate: ProfileGate,
    @Inject(IAdminConfigRepository)
    private readonly adminConfig: IAdminConfigRepository,
    @Inject(IConfig) private readonly config: IConfig,
  ) {}

  public async handle(
    command: IOpenDirectUserRoomCommand,
  ): Promise<IOpenDirectUserRoomResponseDto> {
    const byId = command.target.userId?.trim();
    const byUsername = command.target.username?.trim();
    if (Boolean(byId) === Boolean(byUsername))
      throw new ValidationFailedException([
        'room: cần đúng một trong userId hoặc username',
      ]);

    await this.profileGate.assertComplete(command.userId);

    const target = await this.users.findOneBy(
      byId ? { globalId: byId } : { username: byUsername },
    );
    // Tài khoản bị treo hay khoá trả 404 như không có: nhắn vào một tài khoản không đăng nhập
    // được là tin không ai đọc.
    if (!target || target.deletedAt || target.status !== UserStatuses.ACTIVE)
      throw new UserNotFoundException();
    if (target.globalId === command.userId)
      throw new ChatDirectUserSelfException();

    const outcome = await this.chat.openDirectUserRoom({
      initiatorId: command.userId,
      recipientId: target.globalId,
      dailyLimit: normalizeDirectUserDailyLimit(
        await this.adminConfig.getConfigValue(DirectUserDailyLimitConfigKey),
      ),
    });
    if (outcome.status === 'RECIPIENT_UNAVAILABLE')
      throw new ChatRecipientUnavailableException();
    if (outcome.status === 'DAILY_LIMIT_REACHED')
      throw new TooManyRequestsException(outcome.retryAfterSeconds);

    const summary = await this.chat.describeRoom(
      outcome.room.globalId,
      command.userId,
    );
    if (!summary) throw new ChatRoomNotFoundException();

    return {
      room: toRoomSummary(summary, this.config.storage.publicBaseUrl),
      created: outcome.created,
    };
  }
}
