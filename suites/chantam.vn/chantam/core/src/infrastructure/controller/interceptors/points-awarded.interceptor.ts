import { IPointLedgerRepository } from '@/domain/ports/repository';
import { pointRuleTitle } from '@chantam.vn/chantam.core-lib/models';
import { IAuthPrincipal } from '@chantam/service.auth-lib';
import {
  CallHandler,
  ExecutionContext,
  Inject,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, mergeMap } from 'rxjs';
import { PointAwardScope } from '../../points/point-award-context';

export const PointsAwardedHeaders = {
  awarded: 'X-Points-Awarded',
  message: 'X-Points-Message',
} as const;

interface IHeaderWritable {
  header(name: string, value: string): unknown;
}

/**
 * Gắn `X-Points-Awarded` / `X-Points-Message` vào response của MỌI API có cộng điểm
 * cho người gọi — kể cả API thêm sau này, vì việc bắt điểm nằm ở sổ điểm chứ không ở
 * từng controller.
 *
 * - Chỉ điểm của CHÍNH người gọi. Người nhận xác nhận giao dịch thì người tặng cũng
 *   được điểm, nhưng header của request đó chỉ nói phần người nhận.
 * - Chỉ điểm ĐÃ commit: đọc lại sổ trước khi trả, nên bút toán bị rollback không lọt.
 * - `X-Points-Message` được percent-encode (`encodeURIComponent`): header HTTP chỉ chở
 *   được Latin-1, và Node ném lỗi với chữ như "Đ" — một request cộng điểm thành công
 *   sẽ ra 500. Client giải bằng `decodeURIComponent`.
 * - Điểm cộng SAU khi response đã đi (cron, việc nền) không có header nào để gắn.
 */
@Injectable()
export class PointsAwardedInterceptor implements NestInterceptor {
  private readonly logger = new Logger(PointsAwardedInterceptor.name);

  public constructor(
    @Inject(IPointLedgerRepository)
    private readonly ledger: IPointLedgerRepository,
  ) {}

  public intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const http = context.switchToHttp();
    const userId =
      http.getRequest<{ user?: IAuthPrincipal }>().user?.userId ?? null;
    // Không đăng nhập thì không có ai để báo — và không có ví nào để cộng.
    if (userId === null) return next.handle();

    const scope = new PointAwardScope(userId);
    const reply = http.getResponse<IHeaderWritable>();

    return new Observable((subscriber) =>
      // `subscribe` BÊN TRONG scope: handler chỉ thật sự chạy lúc subscribe, nên mọi
      // lượt ghi sổ của nó — kể cả qua nhiều tầng await — mang theo scope này.
      scope.run(() =>
        next
          .handle()
          .pipe(
            mergeMap(async (body: unknown) => {
              await this.attachHeaders(reply, scope);
              return body;
            }),
          )
          .subscribe(subscriber),
      ),
    );
  }

  private async attachHeaders(
    reply: IHeaderWritable,
    scope: PointAwardScope,
  ): Promise<void> {
    if (scope.entryIds.length === 0 || scope.userId === null) return;

    let awards: { ruleCode: string; delta: number }[];
    try {
      awards = await this.ledger.findCommittedAwards(
        scope.userId,
        scope.entryIds,
      );
    } catch (error) {
      // Header là phần phụ: việc chính (và điểm) đã xong. Đọc lại sổ hỏng thì trả
      // response thiếu header còn hơn biến một request thành công thành 500.
      this.logger.warn(
        `Không đọc lại được sổ điểm để gắn X-Points-*: ${(error as Error).message}`,
      );
      return;
    }
    if (awards.length === 0) return;

    const total = awards.reduce((sum, award) => sum + award.delta, 0);
    const message = [
      ...new Set(awards.map((award) => pointRuleTitle(award.ruleCode))),
    ].join('; ');

    reply.header(PointsAwardedHeaders.awarded, String(total));
    reply.header(PointsAwardedHeaders.message, encodeURIComponent(message));
    // Repo chưa bật CORS (web cùng tên miền), nhưng bật về sau mà thiếu dòng này thì
    // trình duyệt giấu hai header khỏi JavaScript — lỗi im lặng, khó lần.
    reply.header(
      'Access-Control-Expose-Headers',
      `${PointsAwardedHeaders.awarded}, ${PointsAwardedHeaders.message}`,
    );
  }
}
