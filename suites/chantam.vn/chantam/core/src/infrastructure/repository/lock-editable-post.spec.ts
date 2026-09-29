import {
  PostHasLiveTransactionException,
  PostInvalidStateException,
} from '@/domain/exceptions';
import { PostEntity } from '@/infrastructure/entity/post.entity';
import { ForbiddenException } from '@chantam/service.common-lib/exception';
import { EntityManager } from 'typeorm';
import { lockEditablePost } from './lock-editable-post';

describe('lockEditablePost', () => {
  const post = {
    globalId: 'post',
    authorId: 'owner',
    status: 'PUBLISHED',
    expiresAt: null,
    deletedAt: null,
  };
  function setup(live = false, overrides = {}) {
    const manager = {
      findOne: jest.fn().mockResolvedValue({ ...post, ...overrides }),
      query: jest.fn().mockResolvedValue([{ exists: live }]),
    };
    return manager;
  }

  it('locks the post and allows waiting requests without changing their queue', async () => {
    const manager = setup();
    await expect(
      lockEditablePost(manager as unknown as EntityManager, 'post', 'owner'),
    ).resolves.toEqual(post);
    expect(manager.findOne).toHaveBeenCalledWith(PostEntity, {
      where: { globalId: 'post' },
      lock: { mode: 'pessimistic_write' },
    });
    expect(manager.query).toHaveBeenCalledTimes(1);
    const sql = manager.query.mock.calls[0][0] as string;
    expect(sql).toContain("status IN ('ACCEPTED', 'DELIVERING')");
    expect(sql).not.toMatch(/UPDATE|DELETE/);
  });

  it('blocks live transactions even while the post remains PUBLISHED', async () => {
    await expect(
      lockEditablePost(
        setup(true) as unknown as EntityManager,
        'post',
        'owner',
      ),
    ).rejects.toBeInstanceOf(PostHasLiveTransactionException);
  });

  it('rejects owner mismatch before reading transactions', async () => {
    const manager = setup();
    await expect(
      lockEditablePost(manager as unknown as EntityManager, 'post', 'stranger'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(manager.query).not.toHaveBeenCalled();
  });

  it.each(['COMPLETED', 'CANCELLED', 'EXPIRED', 'ARCHIVED', 'REJECTED'])(
    'blocks %s',
    async (status) => {
      await expect(
        lockEditablePost(
          setup(false, { status }) as unknown as EntityManager,
          'post',
        ),
      ).rejects.toBeInstanceOf(PostInvalidStateException);
    },
  );

  it('blocks expiry even before the expiry worker changes status', async () => {
    await expect(
      lockEditablePost(
        setup(false, { expiresAt: new Date(0) }) as unknown as EntityManager,
        'post',
      ),
    ).rejects.toBeInstanceOf(PostInvalidStateException);
  });
});
