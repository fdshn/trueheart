import { IAdminConfigRepository } from '@/domain/ports/repository';
import { IAuthPrincipal } from '@chantam/service.auth-lib';
import { ForbiddenException } from '@chantam/service.common-lib/exception';
import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FastifyRequest } from 'fastify';
import { RequiredPermissionKey } from './requires-permission.decorator';

/** Mọi đường dẫn dưới tiền tố này đều phải khai quyền. */
const AdminPathPattern = /\/admin(\/|$|\?)/;

/**
 * Chặn theo quyền đã khai bằng `@RequiresPermission`.
 *
 * Route dưới `/admin` mà KHÔNG khai quyền thì bị từ chối. Hướng mặc định này là
 * cố ý: thêm endpoint admin mà quên decorator thì nó khoá ngay lần gọi đầu, còn
 * hướng ngược lại là lặng lẽ mở một cửa quản trị.
 *
 * Guard này là lớp ngoài; use case vẫn tự kiểm quyền vì còn có đường gọi khác
 * ngoài HTTP (CLI, job nền) không đi qua guard nào.
 */
@Injectable()
export class AdminPermissionGuard implements CanActivate {
  public constructor(
    private readonly reflector: Reflector,
    @Inject(IAdminConfigRepository)
    private readonly permissions: IAdminConfigRepository,
  ) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;

    const request = context
      .switchToHttp()
      .getRequest<FastifyRequest & { user?: IAuthPrincipal }>();
    const required = this.reflector.getAllAndOverride<string>(
      RequiredPermissionKey,
      [context.getHandler(), context.getClass()],
    );

    if (!required) {
      // Không khai quyền: chỉ cho qua khi KHÔNG phải route quản trị.
      if (AdminPathPattern.test(request.url ?? ''))
        throw new ForbiddenException();

      return true;
    }

    const principal = request.user;
    if (!principal) throw new ForbiddenException();

    // Đọc lại từ database, không tin snapshot trong token.
    if (!(await this.permissions.hasPermission(principal.userId, required)))
      throw new ForbiddenException();

    return true;
  }
}
