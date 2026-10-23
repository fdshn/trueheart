import { PATH_METADATA } from '@nestjs/common/constants';

/** Xem `leaderboard.controller.spec.ts`: decorator dựng exception ngay lúc nạp file. */
describe('AdminLeaderboardController', () => {
  it('nạp được file — mọi decorator dựng được exception của nó', async () => {
    const { AdminLeaderboardController } =
      await import('./admin-leaderboard.controller');
    expect(Reflect.getMetadata(PATH_METADATA, AdminLeaderboardController)).toBe(
      'admin',
    );
  });
});
