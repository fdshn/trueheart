import { SystemLogRepository } from './system-log.repository';

const UserId = '10000000-0000-4000-8000-000000000001';

function makeQuery() {
  return jest
    .fn()
    .mockResolvedValueOnce([
      {
        occurred_at: new Date('2026-09-20T00:00:00.000Z'),
        actor_user_id: UserId,
        subject_user_id: null,
        action: 'PUBLISH',
        resource_type: 'SYSTEM_CONFIG',
        resource_id: 'discovery.default_radius_meters',
        detail: 'Mở rộng bán kính',
      },
    ])
    .mockResolvedValueOnce([{ total: '12' }]);
}

describe('SystemLogRepository', () => {
  it('mỗi loại log đọc từ đúng bảng nguồn của nó', async () => {
    const expectations: [string, string][] = [
      ['ADMIN', 'admin_audit_logs'],
      ['POINT', 'point_ledger'],
      ['RANK', 'rank_transitions'],
      ['TRANSACTION', 'gift_transactions'],
    ];

    for (const [logType, table] of expectations) {
      const query = makeQuery();
      const repository = new SystemLogRepository({ query } as never);

      await repository.query({
        logType: logType as never,
        skip: 0,
        take: 20,
      });

      expect(String(query.mock.calls[0][0])).toContain(`FROM ${table}`);
    }
  });

  it('gắn nhãn loại log vào từng dòng trả về', async () => {
    const query = makeQuery();
    const repository = new SystemLogRepository({ query } as never);

    const page = await repository.query({
      logType: 'ADMIN',
      skip: 0,
      take: 20,
    });

    expect(page.entries[0].logType).toBe('ADMIN');
    expect(page.total).toBe(12);
  });

  it('lọc giao dịch theo người bắt cả vai tặng lẫn vai nhận', async () => {
    // Chỉ bắt một vai thì tra cứu một người chỉ ra nửa số giao dịch của họ.
    const query = makeQuery();
    const repository = new SystemLogRepository({ query } as never);

    await repository.query({
      logType: 'TRANSACTION',
      userId: UserId,
      skip: 0,
      take: 20,
    });

    const [sql, params] = query.mock.calls[0];
    expect(String(sql)).toContain('giver_id = $1');
    expect(String(sql)).toContain('receiver_id = $1');
    expect(params[0]).toBe(UserId);
  });

  it('lọc điểm theo chủ sở hữu bút toán chứ không phải người thao tác', async () => {
    const query = makeQuery();
    const repository = new SystemLogRepository({ query } as never);

    await repository.query({
      logType: 'POINT',
      userId: UserId,
      skip: 0,
      take: 20,
    });

    expect(String(query.mock.calls[0][0])).toContain('user_id = $1');
  });

  it('bỏ trống bộ lọc nghĩa là không lọc', async () => {
    const query = makeQuery();
    const repository = new SystemLogRepository({ query } as never);

    await repository.query({ logType: 'RANK', skip: 0, take: 20 });

    const [sql, params] = query.mock.calls[0];
    expect(String(sql)).not.toContain('WHERE');
    expect(params).toEqual([20, 0]);
  });

  it('đếm tổng theo cùng bộ lọc với danh sách', async () => {
    const query = makeQuery();
    const repository = new SystemLogRepository({ query } as never);

    await repository.query({
      logType: 'POINT',
      action: 'REFERRAL_QUALIFIED',
      skip: 0,
      take: 20,
    });

    const [countSql, countParams] = query.mock.calls[1];
    expect(String(countSql)).toMatch(/COUNT\(\*\)/i);
    expect(String(countSql)).toContain('rule_code = $1');
    expect(countParams).toEqual(['REFERRAL_QUALIFIED']);
  });
});
