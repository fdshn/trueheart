import { PATH_METADATA } from '@nestjs/common/constants';

/**
 * Decorator `@ApiErrorResponses` dựng exception NGAY lúc nạp file — exception cần tham số
 * mà khai thiếu thì server chết lúc khởi động, còn unit test của use case không thấy gì
 * (24/10: `ValidationFailedException` khai không kèm danh sách lỗi mẫu).
 */
describe('LeaderboardController', () => {
  it('nạp được file — mọi decorator dựng được exception của nó', async () => {
    const { LeaderboardController } = await import('./leaderboard.controller');
    expect(Reflect.getMetadata(PATH_METADATA, LeaderboardController)).toBe(
      'leaderboards',
    );
  });
});
