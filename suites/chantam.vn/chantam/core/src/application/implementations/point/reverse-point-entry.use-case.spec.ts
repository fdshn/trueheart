import { PointEntryNotReversibleException } from '@/domain/exceptions';
import {
  IAdminConfigRepository,
  IPointLedgerRepository,
} from '@/domain/ports/repository';
import {
  ForbiddenException,
  ValidationFailedException,
} from '@chantam/service.common-lib/exception';
import { RankChangeNotifier } from '../rank/rank-change.notifier';
import { ReversePointEntryUseCase } from './reverse-point-entry.use-case';

const ActorId = '11111111-1111-4111-8111-111111111111';
const OwnerId = '22222222-2222-4222-8222-222222222222';
const EntryId = 42;

function makeDeps(
  outcome: unknown = {
    status: 'REVERSED',
    userId: OwnerId,
    result: {
      entryId: 99,
      delta: -56,
      balance: 0,
      rawBalance: -6,
      lifetime: 100,
      applied: true,
    },
  },
  allowed = true,
) {
  return {
    ledger: {
      reverseEntry: jest.fn().mockResolvedValue(outcome),
    } as unknown as jest.Mocked<IPointLedgerRepository>,
    admin: {
      hasPermission: jest.fn().mockResolvedValue(allowed),
      appendAudit: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<IAdminConfigRepository>,
    // Xét hạng + báo tụt hạng nay đi qua RankChangeNotifier; ca "có báo đúng
    // không" nằm ở rank-change.notifier.spec.ts.
    rankChange: {
      afterBalanceChange: jest.fn().mockResolvedValue(null),
    } as unknown as jest.Mocked<RankChangeNotifier>,
  };
}

const build = (deps: ReturnType<typeof makeDeps>) =>
  new ReversePointEntryUseCase(deps.ledger, deps.admin, deps.rankChange);

describe('ReversePointEntryUseCase', () => {
  it('hoàn được và tính lại hạng cho CHỦ tài khoản, không phải Admin', async () => {
    // Hoàn một khoản thưởng ghi nhầm mà để hạng nguyên thì con số và cái hạng
    // nói hai chuyện khác nhau.
    const deps = makeDeps();

    const result = await build(deps).handle({
      actorUserId: ActorId,
      entryId: EntryId,
      reversal: { reason: 'Ghi nhầm hai lần' },
    });

    expect(deps.admin.hasPermission).toHaveBeenCalledWith(
      ActorId,
      'point.adjust',
    );
    expect(deps.ledger.reverseEntry).toHaveBeenCalledWith({
      entryId: EntryId,
      actorUserId: ActorId,
      reason: 'Ghi nhầm hai lần',
    });
    expect(deps.rankChange.afterBalanceChange).toHaveBeenCalledWith(OwnerId);
    expect(result.reversal.entryId).toBe(99);
    expect(result.reversal.delta).toBe(-56);
  });

  it('thiếu quyền point.adjust thì chặn TRƯỚC khi đụng sổ', async () => {
    const deps = makeDeps(undefined, false);

    await expect(
      build(deps).handle({
        actorUserId: ActorId,
        entryId: EntryId,
        reversal: { reason: 'Ghi nhầm' },
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(deps.ledger.reverseEntry).not.toHaveBeenCalled();
  });

  it('lý do rỗng bị từ chối — bút toán đảo phải giải thích được', async () => {
    const deps = makeDeps();

    await expect(
      build(deps).handle({
        actorUserId: ActorId,
        entryId: EntryId,
        reversal: { reason: '   ' },
      }),
    ).rejects.toBeInstanceOf(ValidationFailedException);
    expect(deps.ledger.reverseEntry).not.toHaveBeenCalled();
  });

  it('cắt khoảng trắng thừa của lý do', async () => {
    const deps = makeDeps();

    await build(deps).handle({
      actorUserId: ActorId,
      entryId: EntryId,
      reversal: { reason: '  Ghi nhầm  ' },
    });

    expect(deps.ledger.reverseEntry).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'Ghi nhầm' }),
    );
  });

  it('không tìm thấy và đã hoàn rồi trả CÙNG một lỗi', async () => {
    // Admin không cần phân biệt: cả hai đều dẫn tới cùng một hành động là xem
    // lại danh sách.
    for (const status of ['NOT_FOUND', 'NOT_REVERSIBLE']) {
      const deps = makeDeps({ status });

      await expect(
        build(deps).handle({
          actorUserId: ActorId,
          entryId: EntryId,
          reversal: { reason: 'Ghi nhầm' },
        }),
      ).rejects.toBeInstanceOf(PointEntryNotReversibleException);
    }
  });

  it('ghi audit kèm actor, lý do và số dư hai phía (BR-ADM-POINT-07)', async () => {
    // Trước 01/10 đường này chỉ ghi ledger. Hai đường cùng quyền `point.adjust`
    // để lại hai mức dấu vết khác nhau là đúng thứ sổ audit tồn tại để chặn.
    const deps = makeDeps();

    await build(deps).handle({
      actorUserId: ActorId,
      entryId: EntryId,
      reversal: { reason: 'Ghi nhầm hai lần' },
    });

    expect(deps.admin.appendAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: ActorId,
        action: 'REVERSE_POINT_ENTRY',
        resourceType: 'USER',
        // Chủ tài khoản bị ảnh hưởng, KHÔNG phải Admin.
        resourceId: OwnerId,
        reason: 'Ghi nhầm hai lần',
      }),
    );
  });

  it('hoàn thất bại thì KHÔNG ghi audit', async () => {
    const deps = makeDeps({ status: 'NOT_FOUND' });

    await expect(
      build(deps).handle({
        actorUserId: ActorId,
        entryId: EntryId,
        reversal: { reason: 'Ghi nhầm' },
      }),
    ).rejects.toBeInstanceOf(PointEntryNotReversibleException);
    expect(deps.admin.appendAudit).not.toHaveBeenCalled();
  });

  it('hoàn thất bại thì KHÔNG tính lại hạng', async () => {
    const deps = makeDeps({ status: 'NOT_FOUND' });

    await expect(
      build(deps).handle({
        actorUserId: ActorId,
        entryId: EntryId,
        reversal: { reason: 'Ghi nhầm' },
      }),
    ).rejects.toBeInstanceOf(PointEntryNotReversibleException);
    expect(deps.rankChange.afterBalanceChange).not.toHaveBeenCalled();
  });
});
