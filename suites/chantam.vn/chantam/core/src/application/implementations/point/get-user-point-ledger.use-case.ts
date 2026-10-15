import {
  IGetUserPointLedgerCommand,
  IGetUserPointLedgerUseCase,
} from '@/application/contracts/point';
import { UserNotFoundException } from '@/domain/exceptions';
import {
  IAdminConfigRepository,
  IPointLedgerRepository,
  IUserRepository,
} from '@/domain/ports/repository';
import { IGetOwnPointLedgerResponseDto } from '@chantam.vn/chantam.core-lib/dto';
import { PaginationMetaDto, toSkipTake } from '@chantam/service.common-lib/dto';
import { ForbiddenException } from '@chantam/service.common-lib/exception';
import { Inject, Injectable } from '@nestjs/common';

/**
 * Sổ điểm của một người dùng, xem từ CMS (backlog A7).
 *
 * Cùng hình dạng với `GET /points/me/ledger` — kèm `ruleTitle` và `note` dựng sẵn — để CMS
 * chọn đúng bút toán cần đảo thay vì gõ tay `entryId`. Quyền `point.read`; đảo bút toán
 * vẫn đòi `point.adjust` ở route riêng.
 */
@Injectable()
export class GetUserPointLedgerUseCase implements IGetUserPointLedgerUseCase {
  public constructor(
    @Inject(IPointLedgerRepository)
    private readonly ledger: IPointLedgerRepository,
    @Inject(IAdminConfigRepository)
    private readonly admin: IAdminConfigRepository,
    @Inject(IUserRepository)
    private readonly users: IUserRepository,
  ) {}

  public async handle(
    command: IGetUserPointLedgerCommand,
  ): Promise<IGetOwnPointLedgerResponseDto> {
    if (!(await this.admin.hasPermission(command.actorUserId, 'point.read')))
      throw new ForbiddenException();

    // 404 thay vì một sổ rỗng: id gõ sai và "người này chưa có điểm nào" phải trông khác
    // nhau, nếu không Admin kết luận nhầm rằng người dùng chưa từng được cộng điểm.
    const user = await this.users.findOneBy({ globalId: command.userId });
    if (!user || user.deletedAt) throw new UserNotFoundException();

    const { skip, take } = toSkipTake(command);
    const { entries, total } = await this.ledger.getHistory(command.userId, {
      skip,
      take,
    });
    return {
      entries,
      meta: new PaginationMetaDto(Math.floor(skip / take) + 1, take, total),
    };
  }
}
