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
