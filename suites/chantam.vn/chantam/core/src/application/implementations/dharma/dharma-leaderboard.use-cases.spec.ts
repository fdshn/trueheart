import { ValidationFailedException } from '@chantam/service.common-lib/exception';
import { GetForumEngagementLeaderboardUseCase } from './dharma-leaderboard.use-cases';

const Author = {
  username: 'cu-si-minh',
  fullName: 'Cư sĩ Minh',
  avatarUrl: null,
  rank: 'MEMBER',
};

function makeRepository(rows: object[] = []) {
  return { rankForumEngagement: jest.fn().mockResolvedValue(rows) };
}

// 2026-10-31 18:00 UTC là 01:00 ngày 01/11 giờ Việt Nam — "tháng hiện tại" là 2026-11.
const clock = () => new Date('2026-10-31T18:00:00.000Z');

describe('GetForumEngagementLeaderboardUseCase', () => {
  it('mặc định tháng hiện tại theo giờ Việt Nam, khung [đầu tháng, đầu tháng sau)', async () => {
    const repository = makeRepository();

    const result = await new GetForumEngagementLeaderboardUseCase(
      repository as never,
      clock,
    ).handle({});

    expect(result.leaderboard.month).toBe('2026-11');
    expect(result.leaderboard.period).toBe('MONTH');
    expect(repository.rankForumEngagement).toHaveBeenCalledWith({
      start: new Date('2026-10-31T17:00:00.000Z'),
      end: new Date('2026-11-30T17:00:00.000Z'),
      limit: 10,
    });
  });

  it('tháng chỉ định và limit được kẹp vào 1..50', async () => {
    const repository = makeRepository();

    await new GetForumEngagementLeaderboardUseCase(
      repository as never,
      clock,
    ).handle({
      month: '2026-09',
      limit: 500,
    });

    expect(repository.rankForumEngagement).toHaveBeenCalledWith(
      expect.objectContaining({
        start: new Date('2026-08-31T17:00:00.000Z'),
        limit: 50,
      }),
    );
  });

  it('tháng sai dạng: 400', async () => {
    await expect(
      new GetForumEngagementLeaderboardUseCase(
        makeRepository() as never,
        clock,
      ).handle({
        month: '2026-13',
      }),
    ).rejects.toBeInstanceOf(ValidationFailedException);
  });

  it('người ẩn danh: không lộ tác giả, không lộ chủ đề (tiêu đề dẫn về người viết); không trả userId', async () => {
    const repository = makeRepository([
      {
        position: 1,
        engagementCount: 30,
        threadCount: 2,
        isAnonymous: false,
        author: Author,
        topThread: {
          id: 't1',
          title: 'Tụng kinh buổi sáng',
          engagementCount: 20,
        },
      },
      {
        position: 2,
        engagementCount: 12,
        threadCount: 1,
        isAnonymous: true,
        author: { ...Author, username: 'an-danh' },
        topThread: {
          id: 't2',
          title: 'Chủ đề của người ẩn danh',
          engagementCount: 12,
        },
      },
    ]);

    const { leaderboard } = await new GetForumEngagementLeaderboardUseCase(
      repository as never,
      clock,
    ).handle({});

    expect(leaderboard.entries[0]).toEqual({
      position: 1,
      isAnonymous: false,
      author: Author,
      engagementCount: 30,
      threadCount: 2,
      topThread: {
        id: 't1',
        title: 'Tụng kinh buổi sáng',
        engagementCount: 20,
      },
    });
    expect(leaderboard.entries[1]).toMatchObject({
      position: 2,
      isAnonymous: true,
      author: null,
      topThread: null,
      engagementCount: 12,
    });
    expect(JSON.stringify(leaderboard)).not.toContain('an-danh');
    expect(JSON.stringify(leaderboard)).not.toContain('userId');
  });
});
