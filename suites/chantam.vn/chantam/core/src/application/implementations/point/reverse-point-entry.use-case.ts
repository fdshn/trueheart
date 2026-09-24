import {
  IReversePointEntryCommand,
  IReversePointEntryResult,
  IReversePointEntryUseCase,
} from '@/application/contracts/point';
import { PointEntryNotReversibleException } from '@/domain/exceptions';
import {
  IAdminConfigRepository,
  IPointLedgerRepository,
  IRankRepository,
} from '@/domain/ports/repository';
import {
  ForbiddenException,
  ValidationFailedException,
} from '@chantam/service.common-lib/exception';
import { Inject, Injectable } from '@nestjs/common';

/**
 * Hoàn một bút toán điểm đã ghi (F39).
 *
 * Ghi THÊM một bút toán ngược chứ không sửa dòng cũ: ledger chỉ ghi thêm, và
 * lịch sử phải đọc ra được cả cái sai lẫn cái sửa.
 *
 * Tính lại hạng sau khi hoàn — hoàn một khoản thưởng ghi nhầm mà để hạng
 * nguyên thì con số và cái hạng nói hai chuyện khác nhau.
 */
@Injectable()
export class ReversePointEntryUseCase implements IReversePointEntryUseCase {
  public constructor(
    @Inject(IPointLedgerRepository)
    private readonly ledger: IPointLedgerRepository,
    @Inject(IAdminConfigRepository)
    private readonly admin: IAdminConfigRepository,
    @Inject(IRankRepository) private readonly ranks: IRankRepository,
  ) {}

  public async handle(
    command: IReversePointEntryCommand,
  ): Promise<IReversePointEntryResult> {
    if (!(await this.admin.hasPermission(command.actorUserId, 'point.adjust')))
      throw new ForbiddenException();

    const reason = command.reversal.reason?.trim();
    if (!reason)
      throw new ValidationFailedException([
        'reversal.reason: phải nêu lý do hoàn',
      ]);

    const outcome = await this.ledger.reverseEntry({
      entryId: command.entryId,
      actorUserId: command.actorUserId,
      reason,
    });

    // "Không tìm thấy" và "đã hoàn rồi" trả cùng một lỗi: Admin không cần phân
    // biệt, và cả hai đều dẫn tới cùng một hành động là xem lại danh sách.
    if (outcome.status !== 'REVERSED')
      throw new PointEntryNotReversibleException();

    await this.ranks.reconcileNormalRank(outcome.userId);

    return {
      reversal: {
        entryId: outcome.result.entryId,
        delta: outcome.result.delta,
        balance: outcome.result.balance,
        rawBalance: outcome.result.rawBalance,
        lifetime: outcome.result.lifetime,
      },
    };
  }
}
