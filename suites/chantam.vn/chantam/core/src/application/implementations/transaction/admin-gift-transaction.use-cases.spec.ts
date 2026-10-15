import { GiftTransactionNotFoundException } from '@/domain/exceptions';
import { ForbiddenException } from '@chantam/service.common-lib/exception';
import {
  GetAdminGiftTransactionUseCase,
  ListAdminGiftTransactionsUseCase,
} from './admin-gift-transaction.use-cases';

const ActorId = '10000000-0000-4000-8000-000000000001';
const TransactionId = '50000000-0000-4000-8000-000000000001';

function makeDeps(granted: string[], found = true) {
  return {
    permissions: {
      hasPermission: jest.fn(async (_id: string, code: string) =>
        granted.includes(code),
      ),
    },
    transactions: {
      listForAdmin: jest.fn(async () => ({ items: [], total: 4 })),
      findAdminItem: jest.fn(async () =>
        found ? { globalId: TransactionId, status: 'COMPLETED' } : null,
      ),
      listEvidence: jest.fn(async () => [
        {
          kind: 'HANDOVER',
          slot: 1,
          storageKey: 'transactions/t1/a.jpg',
          uploadedBy: 'giver',
          createdAt: new Date('2026-10-15T00:00:00Z'),
        },
      ]),
    },
    config: { storage: { publicBaseUrl: 'https://cdn.chantam.test/' } },
  };
}

describe('ListAdminGiftTransactionsUseCase (CMS A6)', () => {
  const list = (deps: ReturnType<typeof makeDeps>) =>
    new ListAdminGiftTransactionsUseCase(
      deps.permissions as never,
      deps.transactions as never,
    );

  it('đòi post.read', async () => {
    const deps = makeDeps(['report.read']);
    await expect(list(deps).handle({ actorUserId: ActorId })).rejects.toThrow(
      ForbiddenException,
    );
    expect(deps.transactions.listForAdmin).not.toHaveBeenCalled();
  });

  it('chuyển bộ lọc thiếu thành null và phân trang', async () => {
    const deps = makeDeps(['post.read']);
    const result = await list(deps).handle({
      actorUserId: ActorId,
      userId: 'user-1',
      page: 3,
      pageSize: 10,
    });

    expect(deps.transactions.listForAdmin).toHaveBeenCalledWith({
      status: null,
      userId: 'user-1',
      postId: null,
      skip: 20,
      take: 10,
    });
    expect(result.meta).toMatchObject({ page: 3, total: 4 });
  });
});

describe('GetAdminGiftTransactionUseCase (CMS A6)', () => {
  const get = (deps: ReturnType<typeof makeDeps>) =>
    new GetAdminGiftTransactionUseCase(
      deps.permissions as never,
      deps.transactions as never,
      deps.config as never,
    );

  it('đòi post.read', async () => {
    const deps = makeDeps([]);
    await expect(
      get(deps).handle({ actorUserId: ActorId, transactionId: TransactionId }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('không có thì 404', async () => {
    const deps = makeDeps(['post.read'], false);
    await expect(
      get(deps).handle({ actorUserId: ActorId, transactionId: TransactionId }),
    ).rejects.toThrow(GiftTransactionNotFoundException);
    expect(deps.transactions.listEvidence).not.toHaveBeenCalled();
  });

  it('ảnh bằng chứng ra URL đầy đủ, không lặp dấu gạch chéo', async () => {
    const deps = makeDeps(['post.read']);
    const result = await get(deps).handle({
      actorUserId: ActorId,
      transactionId: TransactionId,
    });

    expect(result.transaction).toEqual({
      transactionId: TransactionId,
      status: 'COMPLETED',
    });
    expect(result.evidence).toEqual([
      expect.objectContaining({
        kind: 'HANDOVER',
        url: 'https://cdn.chantam.test/transactions/t1/a.jpg',
      }),
    ]);
  });
});
