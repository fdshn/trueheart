import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { GetOwnPointLedgerQueryDto } from './point.dto';

describe('GetOwnPointLedgerQueryDto', () => {
  it('uses the standard pagination defaults', async () => {
    const query = plainToInstance(GetOwnPointLedgerQueryDto, {});

    await expect(validate(query)).resolves.toHaveLength(0);
    expect(query).toMatchObject({ page: 1, pageSize: 20 });
  });

  it.each([{ page: 0 }, { pageSize: 0 }, { pageSize: 51 }, { page: 1.5 }])(
    'rejects invalid pagination %#',
    async (input) => {
      await expect(
        validate(plainToInstance(GetOwnPointLedgerQueryDto, input)),
      ).resolves.not.toHaveLength(0);
    },
  );
});
