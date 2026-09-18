import { PromoteOnboardingMemberUseCase } from './promote-onboarding-member.use-case';

const UserId = '10000000-0000-4000-8000-000000000001';

describe('PromoteOnboardingMemberUseCase', () => {
  it('forwards only the authenticated internal user ID to the rank repository', async () => {
    const ranks = { promoteMemberOnboarding: jest.fn(async () => true) };
    const useCase = new PromoteOnboardingMemberUseCase(ranks as never);

    await expect(useCase.handle({ userId: UserId })).resolves.toBe(true);
    expect(ranks.promoteMemberOnboarding).toHaveBeenCalledWith(UserId);
  });
});
