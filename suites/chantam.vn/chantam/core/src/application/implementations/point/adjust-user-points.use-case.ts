import {
  IAdjustUserPointsCommand,
  IAdjustUserPointsResult,
  IAdjustUserPointsUseCase,
} from '@/application/contracts/point';
import { UserNotFoundException } from '@/domain/exceptions';
import {
  IAdminConfigRepository,
  IPointLedgerRepository,
  IUserRepository,
} from '@/domain/ports/repository';
import {
  AdminPointAdjustmentRuleCode,
  MaxAdminPointAdjustmentDelta,
} from '@chantam.vn/chantam.core-lib/models';
import {
  ForbiddenException,
  ValidationFailedException,
} from '@chantam/service.common-lib/exception';
import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { RankChangeNotifier } from '../rank/rank-change.notifier';

/**
 * Admin tự cộng/trừ điểm cho một người, kèm lý do (SRS §7.2.4).
 *
 * Khác `ReversePointEntryUseCase` ở chỗ nó KHÔNG bám vào một bút toán có trước:
 * đường kia chỉ phủ nhận được một khoản đã ghi, nên mọi việc bù đắp không ứng
 * với bút toán nào — đền cho người mất lượt trao vì lỗi hệ thống, thưởng một
 * chiến dịch chạy ngoài phần mềm — trước 01/10 chỉ làm được bằng `INSERT` tay
 * vào một bảng append-only có trigger chặn `UPDATE`.
 *
 * `lifetime` chỉ tăng, không bao giờ giảm theo đường này (xem `appendAdjustment`).
 * Muốn phủ nhận một khoản đã cộng thì vẫn phải dùng đường reversal — ở đây là
 * ghi một sự kiện mới, không phải sửa lịch sử.
 */
@Injectable()
export class AdjustUserPointsUseCase implements IAdjustUserPointsUseCase {
  public constructor(
    @Inject(IPointLedgerRepository)
    private readonly ledger: IPointLedgerRepository,
    @Inject(IAdminConfigRepository)
    private readonly admin: IAdminConfigRepository,
    @Inject(IUserRepository)
    private readonly users: IUserRepository,
    private readonly rankChange: RankChangeNotifier,
  ) {}

  public async handle(
    command: IAdjustUserPointsCommand,
  ): Promise<IAdjustUserPointsResult> {
    // Cùng quyền với reversal: cả hai đều là can thiệp vào số điểm của một
    // người cụ thể, và tách ra hai quyền thì chỉ có ảo giác về kiểm soát — ai
    // đảo được một bút toán cũng tự cộng lại được đúng số đó.
    if (!(await this.admin.hasPermission(command.actorUserId, 'point.adjust')))
      throw new ForbiddenException();

    const reason = command.reason?.trim();
    if (!reason)
      throw new ValidationFailedException([
        'reason: phải nêu lý do điều chỉnh',
      ]);

    if (!Number.isInteger(command.delta) || command.delta === 0)
      throw new ValidationFailedException(['delta: phải là số nguyên khác 0']);

    if (Math.abs(command.delta) > MaxAdminPointAdjustmentDelta)
      throw new ValidationFailedException([
        `delta: trị tuyệt đối không được vượt ${MaxAdminPointAdjustmentDelta}`,
      ]);

    // Kiểm người nhận TỒN TẠI trước khi ghi sổ. `point_ledger.user_id` có khoá
    // ngoại tới `users`, nên bỏ qua bước này thì một id gõ sai không ra 404 mà
    // ra 500 từ tầng database — Admin đọc được "lỗi hệ thống" cho lỗi của chính
    // mình.
    const target = await this.users.findOneBy({ globalId: command.userId });
    if (!target || target.deletedAt) throw new UserNotFoundException();

    const referenceId = randomUUID();
    const outcome = await this.ledger.appendAdjustment({
      userId: command.userId,
      ruleCode: AdminPointAdjustmentRuleCode,
      delta: command.delta,
      referenceType: 'ADMIN_ADJUSTMENT',
      referenceId,
      // Bỏ trống thì mỗi lần gọi là một lần điều chỉnh mới. Dùng `referenceId`
      // vừa sinh làm khoá: nó duy nhất cho đúng lần gọi này.
      idempotencyKey: command.idempotencyKey?.trim() || referenceId,
      actor: command.actorUserId,
      source: 'ADMIN_ADJUSTMENT',
      reason,
    });

    // Ghi audit CHỈ KHI thực sự có bút toán mới. Một lần gọi lại với cùng
    // `idempotencyKey` không đổi gì cả, và ghi audit cho nó là dựng ra hai dòng
    // lịch sử cho một hành động — người đọc lại sẽ đếm thành hai lần can thiệp.
    if (outcome.applied) {
      await this.admin.appendAudit({
        actorUserId: command.actorUserId,
        action: 'ADJUST_USER_POINTS',
        resourceType: 'USER',
        resourceId: command.userId,
        before: null,
        after: {
          entryId: outcome.entryId,
          delta: outcome.delta,
          balance: outcome.balance,
          rawBalance: outcome.rawBalance,
          lifetime: outcome.lifetime,
        },
        reason,
      });

      // Cộng/trừ điểm có thể vượt hoặc tụt khỏi ngưỡng hạng, y như mọi biến
      // động điểm khác. Bỏ bước này thì con số và cái hạng nói hai chuyện khác
      // nhau.
      await this.rankChange.afterBalanceChange(command.userId);
    }

    return {
      adjustment: {
        entryId: outcome.entryId,
        delta: outcome.delta,
        balance: outcome.balance,
        rawBalance: outcome.rawBalance,
        lifetime: outcome.lifetime,
        applied: outcome.applied,
      },
    };
  }
}
