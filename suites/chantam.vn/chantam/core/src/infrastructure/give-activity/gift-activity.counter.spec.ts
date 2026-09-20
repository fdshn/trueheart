import { UserRanks } from '@chantam.vn/chantam.core-lib/consts';
import { GiftActivityCounter } from './gift-activity.counter';

const UserId = '10000000-0000-4000-8000-000000000001';

describe('GiftActivityCounter', () => {
  it('báo khả dụng và trả số lượt đã hoàn tất trong chu kỳ', async () => {
    // Đây chính là thứ mở khoá F12: chừng nào bộ đếm còn báo unavailable thì
    // không ai lên được Bạc và không chu kỳ duy trì nào được mở.
    const transactions = { countCompletedByGiver: jest.fn(async () => 2) };
    const counter = new GiftActivityCounter(transactions as never);
    const cycleStart = new Date('2026-07-01T00:00:00.000Z');
    const cycleEnd = new Date('2026-10-01T00:00:00.000Z');

    await expect(
      counter.countCompletedGifts({
        userId: UserId,
        cycleStart,
        cycleEnd,
        rank: UserRanks.SILVER,
      }),
    ).resolves.toEqual({ available: true, completedGifts: 2 });

    expect(transactions.countCompletedByGiver).toHaveBeenCalledWith(UserId, {
      from: cycleStart,
      to: cycleEnd,
    });
  });

  it('đếm trọn đời khi xét thăng hạng thường', async () => {
    const transactions = { countCompletedByGiver: jest.fn(async () => 7) };
    const counter = new GiftActivityCounter(transactions as never);

    await expect(
      counter.countLifetimeCompletedGifts({
        userId: UserId,
        rank: UserRanks.MEMBER,
      }),
    ).resolves.toEqual({ available: true, completedGifts: 7 });

    // Không truyền cửa sổ: thăng hạng xét theo cả quá trình, không theo quý.
    expect(transactions.countCompletedByGiver).toHaveBeenCalledWith(UserId);
  });

  it('không có lượt nào vẫn là khả dụng với số 0, không phải unavailable', async () => {
    // Khác nhau rất lớn: 0 là "đã xét, chưa đạt" và có thể dẫn tới giáng hạng;
    // unavailable là "chưa xét được" và phải giữ nguyên hạng.
    const transactions = { countCompletedByGiver: jest.fn(async () => 0) };
    const counter = new GiftActivityCounter(transactions as never);

    await expect(
      counter.countLifetimeCompletedGifts({
        userId: UserId,
        rank: UserRanks.MEMBER,
      }),
    ).resolves.toEqual({ available: true, completedGifts: 0 });
  });
});
