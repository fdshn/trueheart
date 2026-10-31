import {
  UserBlockSelfException,
  UserNotFoundException,
} from '@/domain/exceptions';
import { ValidationFailedException } from '@chantam/service.common-lib/exception';
import {
  BlockUserUseCase,
  ListBlockedUsersUseCase,
  UnblockUserUseCase,
} from './user-block.use-cases';

const Me = '10000000-0000-4000-8000-000000000001';
const Other = '20000000-0000-4000-8000-000000000002';
const BlockedAt = new Date('2026-10-31T01:00:00.000Z');

const other = (overrides: Record<string, unknown> = {}) => ({
  globalId: Other,
  username: 'nguoi-khac',
  fullName: 'Người Khác',
  avatarUrl: null,
  rank: 'MEMBER',
  deletedAt: null,
  ...overrides,
});

function make(found: object | null = other(), created = true) {
  const users = { findOneBy: jest.fn(async () => found) };
  const blocks = {
    block: jest.fn(async () => ({ blockedAt: BlockedAt, created })),
    unblock: jest.fn(async () => true),
    listBlocked: jest.fn(async () => ({ items: [], total: 0 })),
  };
  return {
    users,
    blocks,
    block: new BlockUserUseCase(users as never, blocks as never),
  };
}

describe('BlockUserUseCase', () => {
  it('chặn theo userId: trả người bị chặn kèm mốc chặn', async () => {
    const { users, blocks, block } = make();

    const result = await block.handle({
      userId: Me,
      target: { userId: Other },
    });

    expect(users.findOneBy).toHaveBeenCalledWith({ globalId: Other });
    expect(blocks.block).toHaveBeenCalledWith({
      blockerId: Me,
      blockedId: Other,
    });
    expect(result).toEqual({
      block: {
        userId: Other,
        username: 'nguoi-khac',
        fullName: 'Người Khác',
        avatarUrl: null,
        rank: 'MEMBER',
        blockedAt: BlockedAt,
      },
      created: true,
    });
  });

  it('chặn theo username (từ hồ sơ công khai, nơi không có id)', async () => {
    const { users, block } = make();

    await block.handle({ userId: Me, target: { username: '  nguoi-khac ' } });

    expect(users.findOneBy).toHaveBeenCalledWith({ username: 'nguoi-khac' });
  });

  it('chặn lại người đã chặn: không lỗi, created=false', async () => {
    const { block } = make(other(), false);

    const result = await block.handle({
      userId: Me,
      target: { userId: Other },
    });

    expect(result.created).toBe(false);
  });

  it.each([
    ['không có gì', {}],
    ['cả hai cùng có', { userId: Other, username: 'nguoi-khac' }],
  ])('đầu vào %s: 400', async (_label, target) => {
    const { blocks, block } = make();

    await expect(block.handle({ userId: Me, target })).rejects.toBeInstanceOf(
      ValidationFailedException,
    );
    expect(blocks.block).not.toHaveBeenCalled();
  });

  it('chặn chính mình: lỗi riêng, không ghi', async () => {
    const { blocks, block } = make(other({ globalId: Me }));

    await expect(
      block.handle({ userId: Me, target: { userId: Me } }),
    ).rejects.toBeInstanceOf(UserBlockSelfException);
    expect(blocks.block).not.toHaveBeenCalled();
  });

  it.each([
    ['không tồn tại', null],
    ['đã xoá', other({ deletedAt: new Date() })],
  ])('người bị chặn %s: 404', async (_label, found) => {
    const { block } = make(found);

    await expect(
      block.handle({ userId: Me, target: { userId: Other } }),
    ).rejects.toBeInstanceOf(UserNotFoundException);
  });
});

describe('UnblockUserUseCase', () => {
  it('bỏ chặn; gọi lại khi vốn không chặn cũng không lỗi', async () => {
    const blocks = { unblock: jest.fn(async () => false) };

    const result = await new UnblockUserUseCase(blocks as never).handle({
      userId: Me,
      blockedUserId: Other,
    });

    expect(blocks.unblock).toHaveBeenCalledWith({
      blockerId: Me,
      blockedId: Other,
    });
    expect(result).toEqual({ unblocked: false });
  });
});

describe('ListBlockedUsersUseCase', () => {
  it('chỉ danh sách của chính người gọi, có phân trang', async () => {
    const blocks = {
      listBlocked: jest.fn(async () => ({
        items: [
          {
            userId: Other,
            username: 'nguoi-khac',
            fullName: null,
            avatarUrl: null,
            rank: 'MEMBER',
            blockedAt: BlockedAt,
          },
        ],
        total: 21,
      })),
    };

    const result = await new ListBlockedUsersUseCase(blocks as never).handle({
      userId: Me,
      page: 2,
      pageSize: 20,
    });

    expect(blocks.listBlocked).toHaveBeenCalledWith({
      blockerId: Me,
      skip: 20,
      take: 20,
    });
    expect(result.blocks).toHaveLength(1);
    expect(result.meta).toMatchObject({ page: 2, total: 21 });
  });
});
