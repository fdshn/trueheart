import {
  DemoPassword,
  ensureDemoSeedAllowed,
  seedDemoData,
} from './seed-demo-data';

describe('seedDemoData', () => {
  it('chỉ chạy khi người vận hành xác nhận rõ ràng', () => {
    expect(() => ensureDemoSeedAllowed(undefined)).toThrow(
      'SEED_DEMO_DATA=true',
    );
    expect(() => ensureDemoSeedAllowed('false')).toThrow('SEED_DEMO_DATA=true');
    expect(() => ensureDemoSeedAllowed('true')).not.toThrow();
  });

  it('dùng một mật khẩu demo được công bố rõ, không hardcode mật khẩu người thật', () => {
    expect(DemoPassword).toBe('Demo@12345');
  });

  it('upserts canonical posts instead of the retired gift_posts table', async () => {
    const query = jest.fn(async (_statement: string) => ({ rows: [] }));

    await seedDemoData({ query });

    const sql = query.mock.calls.map(([statement]) => statement).join('\n');

    expect(sql).toContain('INSERT INTO users');
    expect(sql).toContain('INSERT INTO posts');
    expect(sql).not.toContain('INSERT INTO gift_posts');
    expect(sql).toContain('ON CONFLICT (global_id) DO UPDATE');
    expect(sql).not.toContain('TRUNCATE');
    expect(sql).not.toContain('DELETE FROM');
  });
});
