import { UserNotFoundException } from '@/domain/exceptions';
import {
  IAdminConfigRepository,
  IPointLedgerRepository,
  IUserRepository,
} from '@/domain/ports/repository';
import { MaxAdminPointAdjustmentDelta } from '@chantam.vn/chantam.core-lib/models';
import {
  ForbiddenException,
  ValidationFailedException,
} from '@chantam/service.common-lib/exception';
import { RankChangeNotifier } from '../rank/rank-change.notifier';
import { AdjustUserPointsUseCase } from './adjust-user-points.use-case';

const ActorId = '11111111-1111-4111-8111-111111111111';
const TargetId = '22222222-2222-4222-8222-222222222222';

function makeDeps(options?: {
  allowed?: boolean;
  applied?: boolean;
  target?: unknown;
}) {
  return {
    ledger: {
      appendAdjustment: jest.fn().mockResolvedValue({
        entryId: 93,
        delta: 56,
        balance: 156,
        rawBalance: 156,
        lifetime: 212,
        applied: options?.applied ?? true,
      }),
    } as unknown as jest.Mocked<IPointLedgerRepository>,
    admin: {
      hasPermission: jest.fn().mockResolvedValue(options?.allowed ?? true),
      appendAudit: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<IAdminConfigRepository>,
    users: {
      findOneBy: jest
        .fn()
        .mockResolvedValue(
          options && 'target' in options
            ? options.target
            : { globalId: TargetId, deletedAt: null },
        ),
    } as unknown as jest.Mocked<IUserRepository>,
    rankChange: {
      afterBalanceChange: jest.fn().mockResolvedValue(null),
    } as unknown as jest.Mocked<RankChangeNotifier>,
  };
}

const build = (deps: ReturnType<typeof makeDeps>) =>
  new AdjustUserPointsUseCase(
    deps.ledger,
    deps.admin,
    deps.users,
    deps.rankChange,
  );

describe('AdjustUserPointsUseCase', () => {
  it('ghi bút toán, ghi audit và tính lại hạng cho NGƯỜI NHẬN', async () => {
    const deps = makeDeps();

    const result = await build(deps).handle({
      actorUserId: ActorId,
      userId: TargetId,
      delta: 56,
      reason: 'Đền lượt trao bị lỗi hệ thống',
    });

    expect(deps.admin.hasPermission).toHaveBeenCalledWith(
      ActorId,
      'point.adjust',
    );
    expect(deps.ledger.appendAdjustment).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: TargetId,
        ruleCode: 'ADMIN_ADJUSTMENT',
        delta: 56,
        actor: ActorId,
        source: 'ADMIN_ADJUSTMENT',
        reason: 'Đền lượt trao bị lỗi hệ thống',
      }),
    );
    // Hạng của NGƯỜI NHẬN, không phải của Admin.
    expect(deps.rankChange.afterBalanceChange).toHaveBeenCalledWith(TargetId);
    expect(deps.admin.appendAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: ActorId,
        action: 'ADJUST_USER_POINTS',
        resourceType: 'USER',
        resourceId: TargetId,
      }),
    );
    expect(result.adjustment.entryId).toBe(93);
    expect(result.adjustment.applied).toBe(true);
  });

  it('thiếu quyền point.adjust thì chặn TRƯỚC khi đụng sổ', async () => {
    const deps = makeDeps({ allowed: false });

    await expect(
      build(deps).handle({
        actorUserId: ActorId,
        userId: TargetId,
        delta: 56,
        reason: 'Đền bù',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(deps.ledger.appendAdjustment).not.toHaveBeenCalled();
    expect(deps.users.findOneBy).not.toHaveBeenCalled();
  });

  it('lý do rỗng bị từ chối', async () => {
    const deps = makeDeps();

    await expect(
      build(deps).handle({
        actorUserId: ActorId,
        userId: TargetId,
        delta: 56,
        reason: '   ',
      }),
    ).rejects.toBeInstanceOf(ValidationFailedException);
    expect(deps.ledger.appendAdjustment).not.toHaveBeenCalled();
  });

  it('delta 0 và delta không nguyên bị từ chối', async () => {
    for (const delta of [0, 1.5]) {
      const deps = makeDeps();
      await expect(
        build(deps).handle({
          actorUserId: ActorId,
          userId: TargetId,
          delta,
          reason: 'Đền bù',
        }),
      ).rejects.toBeInstanceOf(ValidationFailedException);
      expect(deps.ledger.appendAdjustment).not.toHaveBeenCalled();
    }
  });

  it('vượt trần thì chặn — hàng rào chống GÕ NHẦM, cả hai dấu', async () => {
    for (const delta of [
      MaxAdminPointAdjustmentDelta + 1,
      -(MaxAdminPointAdjustmentDelta + 1),
    ]) {
      const deps = makeDeps();
      await expect(
        build(deps).handle({
          actorUserId: ActorId,
          userId: TargetId,
          delta,
          reason: 'Thêm một số 0',
        }),
      ).rejects.toBeInstanceOf(ValidationFailedException);
      expect(deps.ledger.appendAdjustment).not.toHaveBeenCalled();
    }
  });

  it('đúng trần thì CHO qua — biên là hợp lệ', async () => {
    const deps = makeDeps();

    await build(deps).handle({
      actorUserId: ActorId,
      userId: TargetId,
      delta: MaxAdminPointAdjustmentDelta,
      reason: 'Thưởng chiến dịch',
    });

    expect(deps.ledger.appendAdjustment).toHaveBeenCalled();
  });

  it('người nhận không tồn tại ra 404, không để khoá ngoại nổ thành 500', async () => {
    const deps = makeDeps({ target: null });

    await expect(
      build(deps).handle({
        actorUserId: ActorId,
        userId: TargetId,
        delta: 56,
        reason: 'Đền bù',
      }),
    ).rejects.toBeInstanceOf(UserNotFoundException);
    expect(deps.ledger.appendAdjustment).not.toHaveBeenCalled();
  });

  it('tài khoản đã xoá mềm cũng ra 404', async () => {
    const deps = makeDeps({
      target: { globalId: TargetId, deletedAt: new Date() },
    });

    await expect(
      build(deps).handle({
        actorUserId: ActorId,
        userId: TargetId,
        delta: 56,
        reason: 'Đền bù',
      }),
    ).rejects.toBeInstanceOf(UserNotFoundException);
  });

  it('idempotencyKey trùng: KHÔNG ghi audit và KHÔNG tính lại hạng', async () => {
    // `applied: false` nghĩa là không có gì đổi. Ghi audit cho nó là dựng ra hai
    // dòng lịch sử cho một hành động.
    const deps = makeDeps({ applied: false });

    const result = await build(deps).handle({
      actorUserId: ActorId,
      userId: TargetId,
      delta: 56,
      reason: 'Đền bù',
      idempotencyKey: 'admin-retry-1',
    });

    expect(deps.ledger.appendAdjustment).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: 'admin-retry-1' }),
    );
    expect(deps.admin.appendAudit).not.toHaveBeenCalled();
    expect(deps.rankChange.afterBalanceChange).not.toHaveBeenCalled();
    expect(result.adjustment.applied).toBe(false);
  });

  it('bỏ trống idempotencyKey thì mỗi lần gọi là một khoá MỚI', async () => {
    const deps = makeDeps();

    await build(deps).handle({
      actorUserId: ActorId,
      userId: TargetId,
      delta: 56,
      reason: 'Đền bù',
    });
    await build(deps).handle({
      actorUserId: ActorId,
      userId: TargetId,
      delta: 56,
      reason: 'Đền bù',
    });

    const calls = (deps.ledger.appendAdjustment as jest.Mock).mock.calls;
    expect(calls[0][0].idempotencyKey).not.toBe(calls[1][0].idempotencyKey);
    // Và khoá chính là `referenceId` của lần đó, không phải một chuỗi rời.
    expect(calls[0][0].idempotencyKey).toBe(calls[0][0].referenceId);
  });
});
