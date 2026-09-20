import { AdminUserRepository } from './admin-user.repository';

const ActorId = '10000000-0000-4000-8000-000000000001';
const TargetId = '20000000-0000-4000-8000-000000000002';

function userRow(overrides: Record<string, unknown> = {}) {
  return {
    global_id: TargetId,
    username: 'nguoi-demo',
    full_name: 'Người Demo',
    email: 'demo@example.com',
    phone: '0912345678',
    rank: 'MEMBER',
    status: 'ACTIVE',
    phone_verified_at: new Date('2026-09-01T00:00:00.000Z'),
    suspended_until: null,
    created_at: new Date('2026-08-01T00:00:00.000Z'),
    deleted_at: null,
    admin_roles: ['POLICY_ADMIN'],
    ...overrides,
  };
}

function makeRepository(query: jest.Mock) {
  return new AdminUserRepository({
    query,
    transaction: async (cb: (m: unknown) => unknown) => cb({ query }),
  } as never);
}

function searchQuery() {
  return jest
    .fn()
    .mockResolvedValueOnce([userRow()])
    .mockResolvedValueOnce([{ total: '7' }]);
}

describe('AdminUserRepository search', () => {
  it('không bao giờ đọc hash mật khẩu ra khỏi database', async () => {
    const query = searchQuery();
    const repository = makeRepository(query);

    const page = await repository.search({ skip: 0, take: 20 });

    expect(String(query.mock.calls[0][0])).not.toContain('password_hash');
    expect(JSON.stringify(page)).not.toContain('password');
  });

  it('bỏ trống bộ lọc nghĩa là không lọc', async () => {
    const query = searchQuery();
    const repository = makeRepository(query);

    await repository.search({ skip: 0, take: 20 });

    const [sql, params] = query.mock.calls[0];
    expect(String(sql)).not.toMatch(/username\s+ILIKE/);
    expect(String(sql)).not.toMatch(/user_account\.rank\s*=/);
    expect(params).toEqual([20, 0]);
  });

  it('mặc định ẩn tài khoản đã xoá', async () => {
    const query = searchQuery();
    const repository = makeRepository(query);

    await repository.search({ skip: 0, take: 20 });

    expect(String(query.mock.calls[0][0])).toContain('deleted_at IS NULL');
  });

  it('bật includeDeleted thì không lọc theo deleted_at nữa', async () => {
    const query = searchQuery();
    const repository = makeRepository(query);

    await repository.search({ includeDeleted: true, skip: 0, take: 20 });

    expect(String(query.mock.calls[0][0])).not.toContain('deleted_at IS NULL');
  });

  it('tìm username và email theo khớp một phần, không phân biệt hoa thường', async () => {
    const query = searchQuery();
    const repository = makeRepository(query);

    await repository.search({
      username: 'demo',
      email: 'Example.COM',
      skip: 0,
      take: 20,
    });

    const [sql, params] = query.mock.calls[0];
    expect(String(sql)).toMatch(/username\s+ILIKE/);
    expect(String(sql)).toMatch(/email\s+ILIKE/);
    expect(params[0]).toBe('%demo%');
    expect(params[1]).toBe('%Example.COM%');
  });

  it('lọc theo hạng, trạng thái, role quản trị và khoảng đăng ký', async () => {
    const query = searchQuery();
    const repository = makeRepository(query);
    const from = new Date('2026-01-01T00:00:00.000Z');
    const to = new Date('2026-12-31T00:00:00.000Z');

    await repository.search({
      rank: 'SILVER' as never,
      status: 'ACTIVE' as never,
      adminRole: 'SUPER_ADMIN',
      phoneVerified: true,
      registeredFrom: from,
      registeredTo: to,
      skip: 0,
      take: 20,
    });

    const sql = String(query.mock.calls[0][0]);
    expect(sql).toMatch(/rank\s*=/);
    expect(sql).toMatch(/status\s*=/);
    expect(sql).toContain('admin_roles');
    expect(sql).toMatch(/phone_verified_at IS NOT NULL/);
    expect(sql).toMatch(/created_at\s*>=/);
    expect(sql).toMatch(/created_at\s*<=/);
  });

  it('đếm tổng theo cùng bộ lọc với danh sách', async () => {
    const query = searchQuery();
    const repository = makeRepository(query);

    const page = await repository.search({
      status: 'BANNED' as never,
      skip: 0,
      take: 20,
    });

    const countSql = String(query.mock.calls[1][0]);
    expect(countSql).toMatch(/COUNT\(\*\)/i);
    expect(countSql).toMatch(/status\s*=/);
    expect(page.total).toBe(7);
  });
});

describe('AdminUserRepository status and deletion', () => {
  it('đổi trạng thái có ghi audit kèm lý do', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([userRow({ status: 'SUSPENDED' })])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([userRow({ status: 'SUSPENDED' })]);
    const repository = makeRepository(query);

    await repository.changeStatus({
      actorUserId: ActorId,
      targetUserId: TargetId,
      status: 'SUSPENDED' as never,
      suspendedUntil: new Date('2026-10-01T00:00:00.000Z'),
      reason: 'Vi phạm quy tắc cộng đồng',
    });

    const audit = query.mock.calls.find(([sql]) =>
      String(sql).includes('admin_audit_logs'),
    );
    expect(audit).toBeDefined();
    expect(JSON.stringify(audit)).toContain('Vi phạm quy tắc cộng đồng');
  });

  it('không cho đổi hạng hay điểm qua đường quản trị user', async () => {
    // Hạng đi qua rank writer, điểm đi qua ledger. Sửa thẳng ở đây là phá
    // đường kiểm toán của cả hai.
    const query = jest
      .fn()
      .mockResolvedValueOnce([userRow()])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([userRow()]);
    const repository = makeRepository(query);

    await repository.changeStatus({
      actorUserId: ActorId,
      targetUserId: TargetId,
      status: 'BANNED' as never,
      suspendedUntil: null,
      reason: 'Gian lận',
    });

    const written = query.mock.calls
      .map(([sql]) => String(sql))
      .filter((sql) => sql.includes('UPDATE users'))
      .join('\n');
    expect(written).not.toMatch(/\brank\s*=/);
    expect(written).not.toContain('user_point_balances');
  });

  it('xoá mềm thì ẩn danh dữ liệu cá nhân nhưng giữ username', async () => {
    // Giữ username để người khác không đăng ký lại tên đó rồi mạo danh.
    const query = jest
      .fn()
      .mockResolvedValueOnce([userRow()])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([userRow({ deleted_at: new Date() })]);
    const repository = makeRepository(query);

    await repository.softDelete({
      actorUserId: ActorId,
      targetUserId: TargetId,
      reason: 'Yêu cầu của người dùng',
    });

    const update = query.mock.calls
      .map(([sql]) => String(sql))
      .find((sql) => sql.includes('UPDATE users'));
    expect(update).toContain('deleted_at');
    expect(update).toContain('email = NULL');
    expect(update).toContain('phone = NULL');
    expect(update).not.toMatch(/username\s*=/);
  });
});
