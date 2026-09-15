import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FastifyRequest } from 'fastify';
import { IAuthPrincipal, ITokenDenyList, ITokenService } from '../contracts';
import { PublicRouteKey } from '../decorators';
import { TokenMissingException, TokenRevokedException } from '../exceptions';
import { IAuthOptions } from '../internal/auth-options';

/**
 * Gắn toàn cục qua `APP_GUARD`, nên **mặc định mọi endpoint đều cần token**.
 * Muốn mở thì đánh dấu `@Public()`.
 *
 * Hướng mặc định này là cố ý: quên đánh dấu `@Public()` làm endpoint bị khoá —
 * lỗi lộ ra ngay lần gọi đầu. Hướng ngược lại (mặc định mở) thì quên một chỗ là
 * lộ dữ liệu mà không ai biết.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  public constructor(
    private readonly reflector: Reflector,
    @Inject(ITokenService)
    private readonly tokenService: ITokenService,
    @Inject(ITokenDenyList)
    private readonly denyList: ITokenDenyList,
    @Inject(IAuthOptions)
    private readonly options: IAuthOptions,
  ) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<FastifyRequest & { user?: IAuthPrincipal }>();

    const isPublic =
      this.reflector.getAllAndOverride<boolean>(PublicRouteKey, [
        context.getHandler(),
        context.getClass(),
      ]) === true || this.isPublicPath(request.url);

    const token = this.extractBearerToken(request);

    // Endpoint công khai vẫn đọc token nếu có: nhiều màn hình đổi nội dung theo
    // việc người xem đã đăng nhập hay chưa (ví dụ có được thấy toạ độ thật
    // không). Token hỏng ở đây thì bỏ qua, không chặn.
    if (isPublic) {
      if (token) {
        try {
          request.user = await this.resolvePrincipal(token);
        } catch {
          request.user = undefined;
        }
      }

      return true;
    }

    if (!token) throw new TokenMissingException();

    request.user = await this.resolvePrincipal(token);

    return true;
  }

  /**
   * Chữ ký hợp lệ vẫn chưa đủ: đổi mật khẩu hay xoá tài khoản xong, token cũ
   * còn hạn nhưng phải chết ngay. Thêm một lượt tra danh sách chặn — O(1), và
   * chỉ tốn một lượt đọc Redis cho mỗi request có token.
   */
  private async resolvePrincipal(token: string): Promise<IAuthPrincipal> {
    const principal = await this.tokenService.verifyAccessToken(token);

    if (
      principal.issuedAt &&
      (await this.denyList.isRevoked(principal.userId, principal.issuedAt))
    )
      throw new TokenRevokedException();

    return principal;
  }

  /** Đối chiếu phần đường dẫn, bỏ query string. */
  private isPublicPath(url: string): boolean {
    const path = url.split('?')[0];

    return this.options.publicPathPrefixes.some(
      (prefix) => path === prefix || path.startsWith(`${prefix}/`),
    );
  }

  private extractBearerToken(request: FastifyRequest): string | undefined {
    const header = request.headers.authorization;

    if (!header) return undefined;

    const [scheme, value] = header.split(' ');

    return scheme?.toLowerCase() === 'bearer' && value ? value : undefined;
  }
}
