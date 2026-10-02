import {
  IReversePointEntryCommand,
  IReversePointEntryResult,
  IReversePointEntryUseCase,
} from '@/application/contracts/point';
import { PointEntryNotReversibleException } from '@/domain/exceptions';
import {
  IAdminConfigRepository,
  IPointLedgerRepository,
} from '@/domain/ports/repository';
import {
  ForbiddenException,
  ValidationFailedException,
} from '@chantam/service.common-lib/exception';
import { Inject, Injectable } from '@nestjs/common';
import { RankChangeNotifier } from '../rank/rank-change.notifier';

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
    private readonly rankChange: RankChangeNotifier,
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

    // Ghi audit. `BR-ADM-POINT-07` đòi MỌI thao tác quản trị đổi điểm phải lưu cả
    // Point Ledger VÀ Audit Log kèm actor, giá trị trước/sau và lý do — trước
    // 01/10 đường này chỉ ghi ledger, nên một lần Admin đảo bút toán của người
    // khác không để lại dấu nào ở sổ audit. Lộ ra khi thêm `POST /admin/points/adjust`
    // bên cạnh: hai đường cùng quyền `point.adjust` để lại hai mức dấu vết khác nhau.
    //
    // `before`/`after` là số dư quanh bút toán ĐẢO, không phải nội dung bút toán
    // gốc: người đọc audit cần biết tài khoản đó đứng ở đâu trước và sau can thiệp.
    await this.admin.appendAudit({
      actorUserId: command.actorUserId,
      action: 'REVERSE_POINT_ENTRY',
      resourceType: 'USER',
      resourceId: outcome.userId,
      before: {
        reversedEntryId: command.entryId,
        rawBalance: outcome.result.rawBalance - outcome.result.delta,
      },
      after: {
        entryId: outcome.result.entryId,
        delta: outcome.result.delta,
        balance: outcome.result.balance,
        rawBalance: outcome.result.rawBalance,
        lifetime: outcome.result.lifetime,
      },
      reason,
    });

    // Hoàn một khoản CỘNG có thể kéo balance xuống dưới ngưỡng, nên phải xét
    // lại hạng và báo cho người dùng y như mọi biến động điểm khác.
    await this.rankChange.afterBalanceChange(outcome.userId);

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
