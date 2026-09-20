import {
  IGetSystemLogsCommand,
  IGetSystemLogsResult,
  IGetSystemLogsUseCase,
} from '@/application/contracts/admin-config';
import {
  IAdminConfigRepository,
  ISystemLogRepository,
} from '@/domain/ports/repository';
import { PaginationMetaDto, toSkipTake } from '@chantam/service.common-lib/dto';
import { ForbiddenException } from '@chantam/service.common-lib/exception';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class GetSystemLogsUseCase implements IGetSystemLogsUseCase {
  public constructor(
    @Inject(IAdminConfigRepository)
    private readonly permissions: IAdminConfigRepository,
    @Inject(ISystemLogRepository)
    private readonly logs: ISystemLogRepository,
  ) {}

  public async handle(
    command: IGetSystemLogsCommand,
  ): Promise<IGetSystemLogsResult> {
    // Nhật ký gộp cả điểm và giao dịch của người dùng, nên cùng mức quyền với
    // audit chứ không phải quyền đọc cấu hình.
    if (
      !(await this.permissions.hasPermission(command.actorUserId, 'audit.read'))
    )
      throw new ForbiddenException();

    const { skip, take } = toSkipTake(command);
    const { entries, total } = await this.logs.query({
      logType: command.logType,
      userId: command.userId,
      action: command.action,
      from: command.from,
      to: command.to,
      skip,
      take,
    });

    return {
      entries,
      meta: new PaginationMetaDto(Math.floor(skip / take) + 1, take, total),
    };
  }
}
