import {
  IBlockUserCommand,
  IBlockUserUseCase,
  IListBlockedUsersCommand,
  IListBlockedUsersUseCase,
  IUnblockUserCommand,
  IUnblockUserUseCase,
} from '@/application/contracts/user-block';
import {
  UserBlockSelfException,
  UserNotFoundException,
} from '@/domain/exceptions';
import {
  IUserBlockRepository,
  IUserRepository,
} from '@/domain/ports/repository';
import {
  IBlockUserResponseDto,
  IListBlockedUsersResponseDto,
  IUnblockUserResponseDto,
} from '@chantam.vn/chantam.core-lib/dto';
import { PaginationMetaDto, toSkipTake } from '@chantam/service.common-lib/dto';
import { ValidationFailedException } from '@chantam/service.common-lib/exception';
import { Inject, Injectable } from '@nestjs/common';

/**
 * Chặn một người dùng.
 *
 * Hiệu lực xét HAI chiều (xem `IUserBlockRepository`): không ai trong hai người mở được phòng
 * chat trực tiếp mới hay gửi tin vào phòng trực tiếp đã có, và hai người không thấy nhau trong
 * danh sách online. Phòng giao dịch tặng đồ và phòng Rao vặt KHÔNG bị ảnh hưởng — chặn không
 * được làm hỏng một lượt trao đang dở.
 *
 * Người bị chặn không được báo gì.
 */
@Injectable()
export class BlockUserUseCase implements IBlockUserUseCase {
  public constructor(
    @Inject(IUserRepository) private readonly users: IUserRepository,
    @Inject(IUserBlockRepository) private readonly blocks: IUserBlockRepository,
  ) {}

  public async handle(
    command: IBlockUserCommand,
  ): Promise<IBlockUserResponseDto> {
    const byId = command.target.userId?.trim();
    const byUsername = command.target.username?.trim();
    if (Boolean(byId) === Boolean(byUsername))
      throw new ValidationFailedException([
        'block: cần đúng một trong userId hoặc username',
      ]);

    const target = await this.users.findOneBy(
      byId ? { globalId: byId } : { username: byUsername },
    );
    if (!target || target.deletedAt) throw new UserNotFoundException();
    if (target.globalId === command.userId) throw new UserBlockSelfException();

    const { blockedAt, created } = await this.blocks.block({
      blockerId: command.userId,
      blockedId: target.globalId,
    });

    return {
      block: {
        userId: target.globalId,
        username: target.username,
        fullName: target.fullName,
        avatarUrl: target.avatarUrl,
        rank: target.rank,
        blockedAt,
      },
      created,
    };
  }
}

/** Bỏ chặn. Gọi lại khi vốn không chặn không lỗi — nút bấm hai lần không thành lỗi. */
@Injectable()
export class UnblockUserUseCase implements IUnblockUserUseCase {
  public constructor(
    @Inject(IUserBlockRepository) private readonly blocks: IUserBlockRepository,
  ) {}

  public async handle(
    command: IUnblockUserCommand,
  ): Promise<IUnblockUserResponseDto> {
    const unblocked = await this.blocks.unblock({
      blockerId: command.userId,
      blockedId: command.blockedUserId,
    });
    return { unblocked };
  }
}

/** Những người mình đã chặn, mới chặn trước. */
@Injectable()
export class ListBlockedUsersUseCase implements IListBlockedUsersUseCase {
  public constructor(
    @Inject(IUserBlockRepository) private readonly blocks: IUserBlockRepository,
  ) {}

  public async handle(
    command: IListBlockedUsersCommand,
  ): Promise<IListBlockedUsersResponseDto> {
    const { skip, take } = toSkipTake(command);
    const { items, total } = await this.blocks.listBlocked({
      blockerId: command.userId,
      skip,
      take,
    });
    return {
      blocks: items,
      meta: new PaginationMetaDto(Math.floor(skip / take) + 1, take, total),
    };
  }
}
