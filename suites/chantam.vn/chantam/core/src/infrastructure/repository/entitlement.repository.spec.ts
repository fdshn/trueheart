import { UserRanks } from '@chantam.vn/chantam.core-lib/consts';
import { EntitlementRepository } from './entitlement.repository';

const UserId = '10000000-0000-4000-8000-000000000001';

function makeQuery(policyRows: unknown[], openPosts: string) {
  return jest
    .fn()
    .mockResolvedValueOnce(policyRows)
    .mockResolvedValueOnce([{ open_posts: openPosts }]);
}

describe('EntitlementRepository', () => {
  it('maps the published rank policy and reports real post usage', async () => {
    const query = makeQuery(
      [
        {
          rank: UserRanks.SILVER,
          revision_id: '7',
          code: 'POST_OPEN',
          allowed: true,
          limit_value: '10',
        },
        {
          rank: UserRanks.SILVER,
          revision_id: '7',
          code: 'CREATE_GROUP',
          allowed: false,
          limit_value: null,
        },
      ],
      '4',
    );
    const repository = new EntitlementRepository({ query } as never);

    await expect(repository.getOwnEntitlements(UserId)).resolves.toEqual({
      rank: UserRanks.SILVER,
      policyRevisionId: 7,
      capabilities: [
        {
          code: 'POST_OPEN',
          allowed: true,
          limit: 10,
          used: 4,
          remaining: 6,
          reasonCode: null,
        },
        {
          // Chưa có khái niệm "đã dùng" cho quyền ngoài đăng bài.
          code: 'CREATE_GROUP',
          allowed: false,
          limit: null,
          used: 0,
          remaining: null,
          reasonCode: 'RANK_REQUIREMENT_NOT_MET',
        },
      ],
    });
  });

  it('đếm đúng những trạng thái mà quota thật sự chặn', async () => {
    // Lệch định nghĩa với createPostWithinQuota là endpoint báo một đằng còn
    // lúc đăng bài lại chặn một nẻo.
    const query = makeQuery(
      [
        {
          rank: UserRanks.MEMBER,
          revision_id: '8',
          code: 'POST_OPEN',
          allowed: true,
          limit_value: '3',
        },
      ],
      '1',
    );
    const repository = new EntitlementRepository({ query } as never);

    await repository.getOwnEntitlements(UserId);

    const [sql, params] = query.mock.calls[1];
    expect(sql).toContain('FROM posts');
    expect(sql).toContain('deleted_at IS NULL');
    for (const status of [
      'PENDING_REVIEW',
      'PUBLISHED',
      'RESERVED',
      'DELIVERING',
    ])
      expect(sql).toContain(status);
    expect(params).toEqual([UserId]);
  });

  it('không trả remaining âm khi đã vượt hạn mức', async () => {
    const query = makeQuery(
      [
        {
          rank: UserRanks.MEMBER,
          revision_id: '8',
          code: 'POST_OPEN',
          allowed: true,
          limit_value: '3',
        },
      ],
      '5',
    );
    const repository = new EntitlementRepository({ query } as never);

    await expect(
      repository.getCapability(UserId, 'POST_OPEN'),
    ).resolves.toEqual({
      code: 'POST_OPEN',
      allowed: true,
      limit: 3,
      used: 5,
      remaining: 0,
      reasonCode: null,
    });
  });

  it('giữ nguyên không giới hạn khi limit là null', async () => {
    const query = makeQuery(
      [
        {
          rank: UserRanks.DIAMOND,
          revision_id: '9',
          code: 'POST_OPEN',
          allowed: true,
          limit_value: null,
        },
      ],
      '12',
    );
    const repository = new EntitlementRepository({ query } as never);

    await expect(
      repository.getCapability(UserId, 'POST_OPEN'),
    ).resolves.toEqual({
      code: 'POST_OPEN',
      allowed: true,
      limit: null,
      used: 12,
      remaining: null,
      reasonCode: null,
    });
  });
});
