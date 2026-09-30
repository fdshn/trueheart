import { IConfig } from '@/domain/ports/config';
import { IRequestThrottle } from '@/domain/ports/security';
import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
} from '@nestjs/common';
import { FastifyRequest } from 'fastify';

/**
 * Trần gọi CHUNG cho mọi endpoint, theo IP mỗi phút.
 *
 * ## Vì sao cần, khi đã có `IRequestThrottle` ở nhiều chỗ
 *
 * Những trần đang có — chat, báo xấu, đăng nhập, đăng ký — chặn theo **hành vi**, và
 * mỗi cái áp ở chính chỗ gọi. Nhờ vậy chúng nói được thông báo đúng ngữ cảnh, nhưng
 * cũng có nghĩa: **một endpoint mới quên gọi thì không có gì đỡ**. `DEFERRED.md`
 * liệt trần chung là điều kiện trước public launch, và đây là nó.
 *
 * Hai lớp không trùng việc: lớp này chặn lụt thô từ một nguồn, lớp kia chặn lạm
 * dụng một hành vi cụ thể ở mức thấp hơn nhiều (5 lượt đăng ký/giờ so với 600
 * request/phút).
 *
 * ## Cái bẫy phải nói rõ: proxy
 *
 * Đứng sau nginx hay Cloudflare mà không bật `TRUST_PROXY` thì `request.ip` là IP
 * của PROXY, nên mọi người dùng chung một bucket — và trần chung sẽ đánh sập cả API
 * ngay khi tổng lưu lượng vượt ngưỡng. Lớp bảo vệ trở thành lỗ tự gây, đúng kiểu
 * hỏng khó truy nhất: nó chỉ xuất hiện khi có tải.
 *
 * Ngược lại, bật `TRUST_PROXY` khi KHÔNG có proxy thì ai cũng tự khai
 * `X-Forwarded-For` được, và trần chung thành vô nghĩa vì mỗi request là một IP mới.
 *
 * Nên `trustProxy` là env riêng, mặc định `false`, và `main.ts` truyền nó vào
 * `FastifyAdapter` để chính Fastify phân giải `request.ip` — không tự đọc header ở
 * đây, vì Fastify đã làm đúng việc đó (lấy IP ngoài cùng bên trái đáng tin).
 *
 * ## Vì sao KHÔNG áp cho `/health`
 *
 * Healthcheck của hạ tầng gọi nó liên tục, và một `/health` bị 429 làm cổng kiểm
 * tra sau triển khai chớp tắt vô cớ — rồi người ta sẽ tắt cổng đó đi. Đúng chỗ
 * không nên có trần.
 *
 * ## Fail open
 *
 * `IRequestThrottle` tự nuốt lỗi Redis và cho qua. Giữ nguyên tinh thần đó: chặn
 * toàn bộ người dùng chỉ vì Redis hỏng là đánh đổi tệ hơn hẳn.
 */
@Injectable()
export class GlobalRateLimitGuard implements CanActivate {
  private static readonly WindowSeconds = 60;
  private static readonly ExemptPaths = ['/health'];

  public constructor(
    @Inject(IRequestThrottle) private readonly throttle: IRequestThrottle,
    @Inject(IConfig) private readonly config: IConfig,
  ) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    // Chỉ áp cho HTTP. WebSocket có đường riêng và một tin nhắn chat không nên
    // tiêu hạn mức của một lượt gọi API.
    if (context.getType() !== 'http') return true;

    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const path = request.routeOptions?.url ?? request.url;
    if (
      GlobalRateLimitGuard.ExemptPaths.some((exempt) => path.startsWith(exempt))
    )
      return true;

    const limit = this.config.auth.globalRateLimitPerMinute;
    // `request.ip` KHÔNG rỗng trên Fastify, nhưng vẫn phòng: một khoá rỗng sẽ gộp
    // mọi nguồn không xác định vào cùng một bucket, tức đúng lỗi mà `trustProxy`
    // sinh ra để tránh.
    const source = request.ip || 'khong-ro-nguon';

    // Hỏi TRƯỚC rồi đếm SAU, đúng lối `IRequestThrottle` đang dùng ở mọi nơi: đếm
    // trước thì chính lượt bị từ chối cũng làm cửa sổ dài thêm.
    await this.throttle.assertWithinLimit({
      bucket: 'http:global',
      key: source,
      limit,
    });
    await this.throttle.registerHit({
      bucket: 'http:global',
      key: source,
      windowSeconds: GlobalRateLimitGuard.WindowSeconds,
    });

    return true;
  }
}
