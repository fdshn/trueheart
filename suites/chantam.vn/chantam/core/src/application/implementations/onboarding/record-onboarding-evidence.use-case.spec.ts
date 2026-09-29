import { PointRuleUnavailableException } from '@/domain/exceptions';
import { OnboardingTaskEvidenceTypes } from '@chantam.vn/chantam.core-lib/consts';
import { RecordOnboardingEvidenceUseCase } from './record-onboarding-evidence.use-case';

const Command = {
  userId: '10000000-0000-4000-8000-000000000001',
  evidenceType: OnboardingTaskEvidenceTypes.PROFILE_COMPLETE,
  evidenceRef: 'profile:updated',
};

describe('RecordOnboardingEvidenceUseCase', () => {
  it('does not promote, award points, or qualify referrals when evidence leaves onboarding incomplete', async () => {
    const completions = {
      recordEvidenceAndDetermineCompletion: jest.fn(async () => ({
        onboardingComplete: false,
      })),
    };
    const points = { handle: jest.fn() };
    const ranks = { handle: jest.fn() };
    const referrals = { handle: jest.fn() };
    const useCase = new RecordOnboardingEvidenceUseCase(
      completions as never,
      points as never,
      ranks as never,
      referrals as never,
    );

    await expect(useCase.handle(Command)).resolves.toEqual({ promoted: false });
    expect(
      completions.recordEvidenceAndDetermineCompletion,
    ).toHaveBeenCalledWith(Command);
    expect(points.handle).not.toHaveBeenCalled();
    expect(ranks.handle).not.toHaveBeenCalled();
    expect(referrals.handle).not.toHaveBeenCalled();
  });

  it('promotes, awards points, and qualifies referral when evidence completes onboarding', async () => {
    const completions = {
      recordEvidenceAndDetermineCompletion: jest.fn(async () => ({
        onboardingComplete: true,
      })),
    };
    const points = { handle: jest.fn(async () => ({})) };
    const ranks = { handle: jest.fn(async () => true) };
    const referrals = { handle: jest.fn(async () => undefined) };
    const useCase = new RecordOnboardingEvidenceUseCase(
      completions as never,
      points as never,
      ranks as never,
      referrals as never,
    );

    await expect(useCase.handle(Command)).resolves.toEqual({ promoted: true });
    expect(points.handle).toHaveBeenCalledWith({
      userId: Command.userId,
      ruleCode: 'ONBOARDING_COMPLETED',
      referenceType: 'ONBOARDING',
      referenceId: Command.userId,
      idempotencyKey: `ONBOARDING_COMPLETED:${Command.userId}`,
      actor: 'SYSTEM',
      source: 'ONBOARDING',
    });
    expect(ranks.handle).toHaveBeenCalledWith({
      userId: Command.userId,
    });
    expect(referrals.handle).toHaveBeenCalledWith({
      refereeId: Command.userId,
    });
  });

  it('retries idempotent referral qualification and point award for complete-onboarding evidence replay', async () => {
    const completions = {
      recordEvidenceAndDetermineCompletion: jest.fn(async () => ({
        onboardingComplete: true,
      })),
    };
    const points = { handle: jest.fn(async () => ({})) };
    const ranks = { handle: jest.fn(async () => false) };
    const referrals = { handle: jest.fn(async () => undefined) };
    const useCase = new RecordOnboardingEvidenceUseCase(
      completions as never,
      points as never,
      ranks as never,
      referrals as never,
    );

    await expect(useCase.handle(Command)).resolves.toEqual({ promoted: false });
    expect(points.handle).toHaveBeenCalledWith({
      userId: Command.userId,
      ruleCode: 'ONBOARDING_COMPLETED',
      referenceType: 'ONBOARDING',
      referenceId: Command.userId,
      idempotencyKey: `ONBOARDING_COMPLETED:${Command.userId}`,
      actor: 'SYSTEM',
      source: 'ONBOARDING',
    });
    expect(referrals.handle).toHaveBeenCalledWith({
      refereeId: Command.userId,
    });
  });

  it('rule điểm bị tắt VẪN thăng hạng và VẪN tính giới thiệu', async () => {
    // Đây là lỗi chặn đã sửa ngày 29/09. Cộng điểm từng đứng TRƯỚC thăng hạng và
    // không nuốt ngoại lệ, nên Admin tắt `ONBOARDING_COMPLETED` là không ai lên
    // được MEMBER — tức không ai đăng được bài. Việc người dùng đã làm là sự thật;
    // thưởng bao nhiêu là chính sách.
    const completions = {
      recordEvidenceAndDetermineCompletion: jest.fn(async () => ({
        onboardingComplete: true,
      })),
    };
    const points = {
      handle: jest
        .fn()
        .mockRejectedValue(new PointRuleUnavailableException('X')),
    };
    const ranks = { handle: jest.fn(async () => true) };
    const referrals = { handle: jest.fn(async () => undefined) };
    const useCase = new RecordOnboardingEvidenceUseCase(
      completions as never,
      points as never,
      ranks as never,
      referrals as never,
    );

    await expect(useCase.handle(Command)).resolves.toEqual({ promoted: true });
    expect(ranks.handle).toHaveBeenCalled();
    expect(referrals.handle).toHaveBeenCalled();
  });

  it('thăng hạng đi TRƯỚC cộng điểm', async () => {
    // Kiểm thứ tự, không chỉ kiểm "có gọi cả hai". Đảo lại là một lỗi cộng điểm
    // bất kỳ — không riêng rule bị tắt — cũng chặn được đường lên MEMBER.
    const order: string[] = [];
    const completions = {
      recordEvidenceAndDetermineCompletion: jest.fn(async () => ({
        onboardingComplete: true,
      })),
    };
    const points = {
      handle: jest.fn(async () => {
        order.push('points');
        return {};
      }),
    };
    const ranks = {
      handle: jest.fn(async () => {
        order.push('rank');
        return true;
      }),
    };
    const referrals = { handle: jest.fn(async () => undefined) };
    const useCase = new RecordOnboardingEvidenceUseCase(
      completions as never,
      points as never,
      ranks as never,
      referrals as never,
    );

    await useCase.handle(Command);

    expect(order).toEqual(['rank', 'points']);
  });

  it('lỗi database khi cộng điểm thì VẪN ném — không nuốt bừa', async () => {
    const completions = {
      recordEvidenceAndDetermineCompletion: jest.fn(async () => ({
        onboardingComplete: true,
      })),
    };
    const points = {
      handle: jest.fn().mockRejectedValue(new Error('ledger sập')),
    };
    const ranks = { handle: jest.fn(async () => true) };
    const referrals = { handle: jest.fn(async () => undefined) };
    const useCase = new RecordOnboardingEvidenceUseCase(
      completions as never,
      points as never,
      ranks as never,
      referrals as never,
    );

    await expect(useCase.handle(Command)).rejects.toThrow('ledger sập');
  });
});
