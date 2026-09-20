import { AdminConfigRepository } from './admin-config.repository';

describe('AdminConfigRepository', () => {
  it('checks permission through active role assignments', async () => {
    const query = jest.fn().mockResolvedValue([{ allowed: true }]);
    const repository = new AdminConfigRepository({ query } as never);

    await expect(
      repository.hasPermission('user-1', 'config.write'),
    ).resolves.toBe(true);
    expect(query.mock.calls[0][1]).toEqual(['user-1', 'config.write']);
  });

  it('maps sensitive config values to null', async () => {
    const query = jest.fn().mockResolvedValue([
      {
        id: '1',
        config_key: 'smtp.password',
        value_json: 'secret',
        value_type: 'STRING',
        version: '2',
        effective_from: new Date('2026-09-19T00:00:00.000Z'),
        is_sensitive: true,
      },
    ]);
    const repository = new AdminConfigRepository({ query } as never);

    await expect(repository.getPublishedConfigs()).resolves.toEqual([
      {
        id: 1,
        key: 'smtp.password',
        value: null,
        valueType: 'STRING',
        version: 2,
        effectiveFrom: new Date('2026-09-19T00:00:00.000Z'),
        sensitive: true,
      },
    ]);
  });
});

describe('AdminConfigRepository audit filtering', () => {
  function makeQuery() {
    return jest
      .fn()
      .mockResolvedValueOnce([
        {
          id: '9',
          actor_user_id: 'user-1',
          action: 'PUBLISH',
          resource_type: 'SYSTEM_CONFIG',
          resource_id: 'discovery.default_radius_meters',
          reason: 'Mở rộng bán kính',
          created_at: new Date('2026-09-20T00:00:00.000Z'),
        },
      ])
      .mockResolvedValueOnce([{ total: '41' }]);
  }

  it('không lọc theo trường nào khi bộ lọc để trống', async () => {
    // Bỏ trống phải nghĩa là "không lọc", chứ không phải lọc theo chuỗi rỗng —
    // khác nhau là danh sách trả về rỗng trong khi audit vẫn có dữ liệu.
    const query = makeQuery();
    const repository = new AdminConfigRepository({ query } as never);

    const page = await repository.getAuditLogs({ skip: 0, take: 20 });

    const [sql, params] = query.mock.calls[0];
    expect(sql).not.toMatch(/actor_user_id\s*=/);
    expect(sql).not.toMatch(/resource_type\s*=/);
    expect(params).toEqual([20, 0]);
    expect(page.total).toBe(41);
    expect(page.entries[0].actorUserId).toBe('user-1');
  });

  it('lọc theo actor, hành động, loại tài nguyên và khoảng thời gian', async () => {
    const query = makeQuery();
    const repository = new AdminConfigRepository({ query } as never);
    const from = new Date('2026-09-01T00:00:00.000Z');
    const to = new Date('2026-09-30T00:00:00.000Z');

    await repository.getAuditLogs({
      actorUserId: 'user-1',
      action: 'PUBLISH',
      resourceType: 'SYSTEM_CONFIG',
      from,
      to,
      skip: 40,
      take: 20,
    });

    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/actor_user_id\s*=/);
    expect(sql).toMatch(/action\s*=/);
    expect(sql).toMatch(/resource_type\s*=/);
    expect(sql).toMatch(/created_at\s*>=/);
    expect(sql).toMatch(/created_at\s*<=/);
    expect(params).toEqual([
      'user-1',
      'PUBLISH',
      'SYSTEM_CONFIG',
      from,
      to,
      20,
      40,
    ]);
  });

  it('đếm tổng theo cùng bộ lọc với danh sách', async () => {
    // Đếm mà không cùng điều kiện thì phân trang chỉ ra số trang sai.
    const query = makeQuery();
    const repository = new AdminConfigRepository({ query } as never);

    await repository.getAuditLogs({
      resourceType: 'NOTIFICATION_CHANNEL',
      skip: 0,
      take: 10,
    });

    const [countSql, countParams] = query.mock.calls[1];
    expect(countSql).toMatch(/COUNT\(\*\)/i);
    expect(countSql).toMatch(/resource_type\s*=/);
    expect(countParams).toEqual(['NOTIFICATION_CHANNEL']);
  });
});
