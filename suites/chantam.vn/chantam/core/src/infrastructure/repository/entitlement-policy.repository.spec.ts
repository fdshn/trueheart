import { UserRanks } from '@chantam.vn/chantam.core-lib/consts';
import { EntitlementRepository } from './entitlement.repository';

const ActorId = '10000000-0000-4000-8000-000000000001';

function policyRow(overrides: Record<string, unknown> = {}) {
  return {
    revision_id: '7',
    effective_from: new Date('2026-09-01T00:00:00.000Z'),
    change_reason: 'Bản khởi tạo',
    code: 'POST_SOS',
    enabled: true,
    rank: UserRanks.SILVER,
    allowed: true,
    limit_value: null,
    ...overrides,
  };
}

/** Bảng hai capability × hai rank — đủ để thấy ô nào bị đụng, ô nào không. */
const CurrentPolicy = [
  policyRow({ code: 'POST_OPEN', rank: UserRanks.MEMBER, limit_value: '3' }),
  policyRow({ code: 'POST_OPEN', rank: UserRanks.GOLD, limit_value: '20' }),
  policyRow({ code: 'POST_SOS', rank: UserRanks.MEMBER, allowed: false }),
  policyRow({ code: 'POST_SOS', rank: UserRanks.GOLD, allowed: true }),
];

/**
 * Trả kết quả theo nội dung câu lệnh chứ không theo thứ tự gọi — đổi thứ tự
 * trong repository thì test vẫn phải đúng, còn đổi ngữ nghĩa thì phải gãy.
 */
function makeQuery(policyRows = CurrentPolicy) {
  return jest.fn(async (sql: string, _params?: unknown[]) => {
    const text = String(sql);

    if (text.includes('FOR UPDATE')) return [{ id: '7', bundle_id: '1' }];
    if (text.includes('FROM config_revisions')) return policyRows;
    if (text.includes('INSERT INTO config_revisions'))
      return [
        { id: '8', effective_from: new Date('2026-09-20T00:00:00.000Z') },
      ];
    if (text.includes('INSERT INTO capability_policies')) return [{ id: '99' }];
    return [];
  });
}

function makeRepository(query: jest.Mock) {
  return new EntitlementRepository(
    {
      query,
      transaction: async (cb: (m: unknown) => unknown) => cb({ query }),
    } as never,
    // Đường publish không đọc bộ đếm nào; mock để đủ chự ký.
    { countOpenByRequester: jest.fn(async () => 0) } as never,
  );
}

function rankValuesFor(query: jest.Mock, code: string) {
  // Mỗi capability insert xong mới tới các rank của nó, nên cắt theo mốc
  // insert policy là lấy đúng nhóm rank thuộc capability đó.
  const calls = query.mock.calls;
  const start = calls.findIndex(
    ([sql, params]) =>
      String(sql).includes('INSERT INTO capability_policies') &&
      (params as unknown[])?.[1] === code,
  );
  const values: { rank: string; allowed: boolean; limit: number | null }[] = [];

  for (const [sql, params] of calls.slice(start + 1)) {
    if (String(sql).includes('INSERT INTO capability_policies')) break;
    if (!String(sql).includes('INSERT INTO capability_rank_values')) continue;
    const row = params as unknown[];
    values.push({
      rank: row[1] as string,
      allowed: row[2] as boolean,
      limit: row[3] as number | null,
    });
  }

  return values;
}

describe('EntitlementRepository getPolicyRevision', () => {
  it('gom các dòng phẳng thành bảng capability × rank', async () => {
    const repository = makeRepository(makeQuery());

    const policy = await repository.getPolicyRevision();

    expect(policy.revisionId).toBe(7);
    expect(policy.capabilities).toHaveLength(2);
    const offer = policy.capabilities.find((item) => item.code === 'POST_OPEN');
    expect(offer?.ranks).toEqual([
      { rank: UserRanks.MEMBER, allowed: true, limit: 3 },
      { rank: UserRanks.GOLD, allowed: true, limit: 20 },
    ]);
  });

  it('không có bản nào hiệu lực thì báo lỗi chứ không đoán mặc định', async () => {
    // Đoán bừa quota ở đây là âm thầm mở hoặc khoá quyền của toàn hệ thống.
    const repository = makeRepository(makeQuery([]));

    await expect(repository.getPolicyRevision()).rejects.toThrow();
  });
});

describe('EntitlementRepository publishPolicyRevision', () => {
  const publish = (capabilities: unknown[]) => ({
    actorUserId: ActorId,
    changeReason: 'Hạ quota Gold',
    capabilities: capabilities as never,
  });

  it('giữ nguyên mọi ô không được nhắc tới', async () => {
    // Sửa quota Gold mà vô tình ghi đè Member là đổi luật với người không liên
    // quan tới thay đổi này.
    const query = makeQuery();
    const repository = makeRepository(query);

    await repository.publishPolicyRevision(
      publish([
        { code: 'POST_OPEN', ranks: [{ rank: UserRanks.GOLD, limit: 10 }] },
      ]),
    );

    expect(rankValuesFor(query, 'POST_OPEN')).toEqual([
      { rank: UserRanks.MEMBER, allowed: true, limit: 3 },
      { rank: UserRanks.GOLD, allowed: true, limit: 10 },
    ]);
    expect(rankValuesFor(query, 'POST_SOS')).toEqual([
      { rank: UserRanks.MEMBER, allowed: false, limit: null },
      { rank: UserRanks.GOLD, allowed: true, limit: null },
    ]);
  });

  it('mở quyền SOS cho một rank mà không đụng quota bài', async () => {
    const query = makeQuery();
    const repository = makeRepository(query);

    await repository.publishPolicyRevision(
      publish([
        {
          code: 'POST_SOS',
          ranks: [{ rank: UserRanks.MEMBER, allowed: true }],
        },
      ]),
    );

    expect(rankValuesFor(query, 'POST_SOS')).toEqual([
      { rank: UserRanks.MEMBER, allowed: true, limit: null },
      { rank: UserRanks.GOLD, allowed: true, limit: null },
    ]);
  });

  it('giữ phân biệt limit null với limit 0 ở tầng lưu', async () => {
    // Tầng lưu không được gộp hai giá trị này. Dùng một capability `GATE`: ở đó
    // `limit` không được đọc nên cả hai đều vô hại, và phép kiểm nói đúng điều nó
    // muốn nói.
    const query = makeQuery();
    const repository = makeRepository(query);

    await repository.publishPolicyRevision(
      publish([
        {
          code: 'POST_SOS',
          ranks: [
            { rank: UserRanks.MEMBER, limit: 0 },
            { rank: UserRanks.GOLD, limit: null },
          ],
        },
      ]),
    );

    // `allowed` không được nhắc tới nên giữ nguyên giá trị cũ của từng bậc — MEMBER
    // vẫn `false` vì SOS là từ Bạc trở lên. Đó chính là lý lẽ của `applyPatches`.
    expect(rankValuesFor(query, 'POST_SOS')).toEqual([
      { rank: UserRanks.MEMBER, allowed: false, limit: 0 },
      { rank: UserRanks.GOLD, allowed: true, limit: null },
    ]);
  });

  it('từ chối QUOTA đang bật mà hạn mức là null', async () => {
    // Ô trống bị `create-post` đọc thành 0, nên Admin xoá trống định MỞ khoá thì thực
    // tế là KHOÁ SẠCH cả bậc đó, và người dùng nhận thông báo "quota 0" không nói gì
    // về cấu hình. Chặn ngay tại đây thay vì để nó thành một sự cố im lặng.
    const query = makeQuery();
    const repository = makeRepository(query);

    await expect(
      repository.publishPolicyRevision(
        publish([
          {
            code: 'POST_OPEN',
            ranks: [{ rank: UserRanks.GOLD, allowed: true, limit: null }],
          },
        ]),
      ),
    ).rejects.toThrow();

    const wrote = query.mock.calls.some(([sql]) =>
      String(sql).includes('INSERT INTO config_revisions'),
    );
    expect(wrote).toBe(false);
  });

  it('từ chối QUOTA vừa cho phép vừa hạn mức 0', async () => {
    // "Cho phép nhưng hạn mức không" là hai câu đánh nhau; muốn cấm thì đặt
    // `allowed: false`, đúng cách bậc VIEWER đang được seed.
    const query = makeQuery();
    const repository = makeRepository(query);

    await expect(
      repository.publishPolicyRevision(
        publish([
          {
            code: 'OPEN_REQUEST_QUOTA',
            ranks: [{ rank: UserRanks.MEMBER, allowed: true, limit: 0 }],
          },
        ]),
      ),
    ).rejects.toThrow();
  });

  it('từ chối mã capability không có thật, không ghi gì cả', async () => {
    const query = makeQuery();
    const repository = makeRepository(query);

    await expect(
      repository.publishPolicyRevision(
        publish([{ code: 'POST_TELEPATHY', enabled: true }]),
      ),
    ).rejects.toThrow();

    const wrote = query.mock.calls.some(([sql]) =>
      String(sql).includes('INSERT INTO config_revisions'),
    );
    expect(wrote).toBe(false);
  });

  it('khoá bản hiện hành rồi đóng nó TRƯỚC khi mở bản mới', async () => {
    // Ràng buộc GIST cấm hai bản PUBLISHED trùng khung thời gian: mở trước thì
    // insert bị từ chối. Khoá là để hai admin bấm lưu cùng lúc không ghi đè nhau.
    const query = makeQuery();
    const repository = makeRepository(query);

    await repository.publishPolicyRevision(
      publish([{ code: 'POST_SOS', enabled: false }]),
    );

    const order = query.mock.calls.map(([sql]) => String(sql));
    const lock = order.findIndex((sql) => sql.includes('FOR UPDATE'));
    const close = order.findIndex((sql) =>
      sql.includes('UPDATE config_revisions'),
    );
    const open = order.findIndex((sql) =>
      sql.includes('INSERT INTO config_revisions'),
    );

    expect(lock).toBeGreaterThanOrEqual(0);
    expect(lock).toBeLessThan(close);
    expect(close).toBeLessThan(open);
  });

  it('đóng bản cũ đúng bằng mốc bản mới bắt đầu, không chừa khe hở', async () => {
    // Chừa khe giữa hai bản là có khoảnh khắc không bản nào hiệu lực, và mọi
    // lần kiểm quota rơi vào đó đều hỏng.
    const query = makeQuery();
    const repository = makeRepository(query);

    await repository.publishPolicyRevision(
      publish([{ code: 'POST_SOS', enabled: false }]),
    );

    const close = query.mock.calls.find(([sql]) =>
      String(sql).includes('UPDATE config_revisions'),
    );
    const open = query.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO config_revisions'),
    );

    expect((close?.[1] as unknown[])[1]).toEqual((open?.[1] as unknown[])[1]);
  });

  it('ghi audit kèm giá trị trước và sau', async () => {
    const query = makeQuery();
    const repository = makeRepository(query);

    await repository.publishPolicyRevision(
      publish([
        { code: 'POST_OPEN', ranks: [{ rank: UserRanks.GOLD, limit: 10 }] },
      ]),
    );

    const audit = query.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO admin_audit_logs'),
    );
    const params = audit?.[1] as unknown[];

    expect(params[0]).toBe(ActorId);
    expect(String(params[2])).toContain('"limit":20');
    expect(String(params[3])).toContain('"limit":10');
    expect(params[4]).toBe('Hạ quota Gold');
  });

  it('đóng bản cũ bằng CẢ effective_to VÀ status = ARCHIVED', async () => {
    // Bản trước 01/10 chỉ đặt `effective_to`, nên sau N lượt publish có N dòng đều
    // mang `PUBLISHED`. Các đường đọc vẫn đúng vì chúng lọc cả khung thời gian — nhưng
    // `GET /admin/entitlements/history` trả chính cột `status` ra cho Admin đọc, nên một
    // cột nói sai thành một câu trả lời sai.
    const query = makeQuery();
    const repository = makeRepository(query);

    await repository.publishPolicyRevision(
      publish([
        { code: 'POST_OPEN', ranks: [{ rank: UserRanks.GOLD, limit: 25 }] },
      ]),
    );

    const closing = query.mock.calls.find(([sql]) =>
      String(sql).includes('UPDATE config_revisions'),
    );
    expect(closing).toBeDefined();
    expect(String(closing?.[0])).toContain('ARCHIVED');
    expect(String(closing?.[0])).toContain('effective_to');
  });
});
