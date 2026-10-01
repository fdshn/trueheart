import { UserRanks } from '@chantam.vn/chantam.core-lib/consts';
import { CapabilityKinds } from '@chantam.vn/chantam.core-lib/models';
import { EntitlementRepository } from './entitlement.repository';

const UserId = '10000000-0000-4000-8000-000000000001';

function makeRepository(
  policyRows: unknown[],
  usage: { openPosts?: string; openRequests?: number } = {},
) {
  const query = jest
    .fn()
    .mockResolvedValueOnce(policyRows)
    .mockResolvedValueOnce([{ open_posts: usage.openPosts ?? '0' }]);
  const giftRequests = {
    countOpenByRequester: jest.fn(async () => usage.openRequests ?? 0),
  };

  return {
    query,
    giftRequests,
    repository: new EntitlementRepository(
      { query } as never,
      giftRequests as never,
    ),
  };
}

const row = (code: string, over: Record<string, unknown> = {}) => ({
  rank: UserRanks.SILVER,
  revision_id: '7',
  code,
  allowed: true,
  limit_value: null,
  ...over,
});

describe('EntitlementRepository', () => {
  it('đếm thật cho capability QUOTA, và KHÔNG bịa số cho loại khác', async () => {
    const { repository } = makeRepository(
      [
        row('POST_OPEN', { limit_value: '10' }),
        row('CREATE_GROUP', { allowed: false }),
        row('DISCOVERY_RADIUS', { limit_value: '20000' }),
      ],
      { openPosts: '4' },
    );

    await expect(repository.getOwnEntitlements(UserId)).resolves.toEqual({
      rank: UserRanks.SILVER,
      policyRevisionId: 7,
      capabilities: [
        {
          code: 'POST_OPEN',
          kind: CapabilityKinds.QUOTA,
          allowed: true,
          limit: 10,
          used: 4,
          remaining: 6,
          reasonCode: null,
        },
        {
          // GATE: chỉ `allowed` có nghĩa. `used: null` chứ không `0` — "không
          // đếm" và "đã dùng 0" là hai câu khác nhau.
          code: 'CREATE_GROUP',
          kind: CapabilityKinds.GATE,
          allowed: false,
          limit: null,
          used: null,
          remaining: null,
          reasonCode: 'RANK_REQUIREMENT_NOT_MET',
        },
        {
          // VALUE: mang một con số KHÔNG tiêu dần. Trước 01/10 chỗ này trả
          // `remaining: 20000` — "còn lại 20 km" không nói lên gì.
          code: 'DISCOVERY_RADIUS',
          kind: CapabilityKinds.VALUE,
          allowed: true,
          limit: 20000,
          used: null,
          remaining: null,
          reasonCode: null,
        },
      ],
    });
  });

  it('OPEN_REQUEST_QUOTA báo đúng số yêu cầu đang mở', async () => {
    // Đây là lỗi đo được 01/10: một người có đúng 5/5 yêu cầu đang mở — server
    // trả 403 "đang có 5/5 yêu cầu chưa ngã ngũ" — mà endpoint này nói
    // `used: 0, remaining: 5`. §24.6 bảo app dùng chính nó để ẩn/hiện nút, nên
    // app hiện nút "Xin nhận" rồi người dùng ăn 403.
    const { repository, giftRequests } = makeRepository(
      [row('OPEN_REQUEST_QUOTA', { limit_value: '5' })],
      { openRequests: 5 },
    );

    await expect(
      repository.getCapability(UserId, 'OPEN_REQUEST_QUOTA'),
    ).resolves.toEqual({
      code: 'OPEN_REQUEST_QUOTA',
      kind: CapabilityKinds.QUOTA,
      allowed: true,
      limit: 5,
      used: 5,
      remaining: 0,
      reasonCode: null,
    });
    expect(giftRequests.countOpenByRequester).toHaveBeenCalledWith(UserId);
  });

  it('dùng ĐÚNG nguồn đếm của đường chặn, không chép lại câu SQL', async () => {
    // `countOpenByRequester` mang cả lý lẽ về việc JOIN sang `posts` và việc
    // STANDBY vẫn tính. Một bản chép thứ hai ở đây sẽ lệch ở lần sửa sau, và khi
    // lệch thì con số app thấy lại khác con số server chặn theo — đúng cái lỗi
    // đang được sửa, ở một chỗ mới.
    const { repository, giftRequests, query } = makeRepository(
      [row('OPEN_REQUEST_QUOTA', { limit_value: '5' })],
      { openRequests: 2 },
    );

    await repository.getOwnEntitlements(UserId);

    expect(giftRequests.countOpenByRequester).toHaveBeenCalledTimes(1);
    const statements = query.mock.calls.map(([sql]) => String(sql)).join('\n');
    expect(statements).not.toContain('FROM gift_requests');
  });

  it('không đếm gì khi không có capability QUOTA nào', async () => {
    // Một màn hình Admin không nên kéo chín lượt đếm để trả bảy số `null`.
    const { repository, query, giftRequests } = makeRepository([
      row('CREATE_GROUP', { allowed: false }),
      row('POST_SOS'),
    ]);

    await repository.getOwnEntitlements(UserId);

    expect(giftRequests.countOpenByRequester).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('đếm bài đang mở đúng những trạng thái mà quota thật sự chặn', async () => {
    // Lệch định nghĩa với `createPostWithinQuota` là endpoint báo một đằng còn
    // lúc đăng bài lại chặn một nẻo.
    const { repository, query } = makeRepository(
      [row('POST_OPEN', { rank: UserRanks.MEMBER, limit_value: '3' })],
      { openPosts: '1' },
    );

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
    const { repository } = makeRepository(
      [row('POST_OPEN', { limit_value: '3' })],
      { openPosts: '5' },
    );

    await expect(
      repository.getCapability(UserId, 'POST_OPEN'),
    ).resolves.toEqual({
      code: 'POST_OPEN',
      kind: CapabilityKinds.QUOTA,
      allowed: true,
      limit: 3,
      used: 5,
      remaining: 0,
      reasonCode: null,
    });
  });

  it('limit null trên một QUOTA là 0, không phải không giới hạn', async () => {
    // Ghi chú DTO trước 01/10 nói `null` nghĩa là "không giới hạn", trong khi
    // `create-post` và `create-gift-request` đều đọc `limit ?? 0`. Hai cách hiểu
    // NGƯỢC HẲN nhau cho cùng một ô. Giữ lối fail-closed, và nói đúng nó ra —
    // `assertLimitsUsable` chặn việc tạo thêm ô trống như vậy ở đường Admin ghi.
    const { repository } = makeRepository(
      [row('POST_OPEN', { rank: UserRanks.DIAMOND, limit_value: null })],
      { openPosts: '12' },
    );

    await expect(
      repository.getCapability(UserId, 'POST_OPEN'),
    ).resolves.toEqual({
      code: 'POST_OPEN',
      kind: CapabilityKinds.QUOTA,
      allowed: true,
      limit: null,
      used: 12,
      remaining: 0,
      reasonCode: null,
    });
  });
});
