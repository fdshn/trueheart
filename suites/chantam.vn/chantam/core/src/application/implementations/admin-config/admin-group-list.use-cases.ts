import {
  IListAdminGroupsCommand,
  IListAdminGroupsResult,
  IListAdminGroupsUseCase,
} from '@/application/contracts/admin-config';
import {
  IAdminConfigRepository,
  IGroupRepository,
} from '@/domain/ports/repository';
import { PaginationMetaDto, toSkipTake } from '@chantam/service.common-lib/dto';
import { ForbiddenException } from '@chantam/service.common-lib/exception';
import { Inject, Injectable } from '@nestjs/common';

/**
 * Hai màn CMS cần chọn nhóm: gửi thông báo hàng loạt (`notification.manage`) và
 * lọc sự kiện affiliate (`config.read`). Có MỘT trong hai là đủ — thêm mã riêng
 * là seed một dòng `admin_permissions` chưa chắc vai nào được gán.
 */
const PickerPermissions = ['notification.manage', 'config.read'] as const;

/** Danh sách nhóm cho CMS chọn nhóm (CMS A5). */
@Injectable()
export class ListAdminGroupsUseCase implements IListAdminGroupsUseCase {
  public constructor(
    @Inject(IAdminConfigRepository)
    private readonly permissions: IAdminConfigRepository,
    @Inject(IGroupRepository) private readonly groups: IGroupRepository,
  ) {}

  public async handle(
    command: IListAdminGroupsCommand,
  ): Promise<IListAdminGroupsResult> {
    let allowed = false;
    for (const code of PickerPermissions)
      if (await this.permissions.hasPermission(command.actorUserId, code)) {
        allowed = true;
        break;
      }
    if (!allowed) throw new ForbiddenException();

    const { skip, take } = toSkipTake(command);
    const { items, total } = await this.groups.listForAdmin({
      // Chuỗi trắng là "không lọc", không phải "khớp mọi tên có dấu cách".
      keyword: command.keyword?.trim() || null,
      status: command.status ?? null,
      skip,
      take,
    });

    return {
      groups: items,
      meta: new PaginationMetaDto(Math.floor(skip / take) + 1, take, total),
    };
  }
}
