import {
  DefaultDashboardWindowDays,
  IGetAdminDashboardCommand,
  IGetAdminDashboardResult,
  IGetAdminDashboardUseCase,
  MaxDashboardWindowDays,
} from '@/application/contracts/admin-config';
import { IAdminConfigRepository } from '@/domain/ports/repository';
import { AdminDashboardRepository } from '@/infrastructure/repository/admin-dashboard.repository';
import { ForbiddenException } from '@chantam/service.common-lib/exception';
import { Inject, Injectable } from '@nestjs/common';

/**
 * Bảng số liệu điều hành (F59).
 *
 * Use case tự kiểm quyền dù guard đã chặn: còn đường gọi khác ngoài HTTP — CLI và
 * job nền không đi qua guard nào. Đây là nếp chung của mọi use case admin trong
 * repo, không phải kiểm hai lần cho chắc.
 */
@Injectable()
export class GetAdminDashboardUseCase implements IGetAdminDashboardUseCase {
  public constructor(
    @Inject(IAdminConfigRepository)
    private readonly permissions: IAdminConfigRepository,
    private readonly dashboard: AdminDashboardRepository,
  ) {}

  public async handle(
    command: IGetAdminDashboardCommand,
  ): Promise<IGetAdminDashboardResult> {
    if (
      !(await this.permissions.hasPermission(
        command.actorUserId,
        'dashboard.read',
      ))
    )
      throw new ForbiddenException();

    // Kẹp thay vì ném: cửa sổ ngoài khoảng đến từ một ô nhập trên màn hình Admin,
    // và một con số 99999 do gõ nhầm không nên trả lỗi — nó nên trả số liệu của
    // cửa sổ dài nhất còn hợp lý.
    const windowDays = Math.min(
      MaxDashboardWindowDays,
      Math.max(1, Math.trunc(command.windowDays ?? DefaultDashboardWindowDays)),
    );

    return { dashboard: await this.dashboard.read(windowDays) };
  }
}
