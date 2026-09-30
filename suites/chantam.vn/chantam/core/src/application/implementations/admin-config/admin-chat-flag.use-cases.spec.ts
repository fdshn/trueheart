import { ChatMessageNotFoundException } from '@/domain/exceptions';
import { ForbiddenException } from '@chantam/service.common-lib/exception';
import {
  GetChatFlagPendingCountUseCase,
  GetChatFlagQueueUseCase,
  ReviewChatFlagUseCase,
} from './admin-chat-flag.use-cases';

const ActorId = '10000000-0000-4000-8000-000000000001';
const FlagId = '70000000-0000-4000-8000-000000000001';

function makeDeps(options: { granted: string[]; reviewed?: boolean }) {
  return {
    permissions: {
      hasPermission: jest.fn(async (_id: string, code: string) =>
        options.granted.includes(code),
      ),
      appendAudit: jest.fn(async () => undefined),
    },
    chat: {
      listPendingFlags: jest.fn(async () => ({ items: [], total: 0 })),
      countPendingFlags: jest.fn(async () => 3),
      reviewFlag: jest.fn(async () => options.reviewed ?? true),
    },
  };
}

describe('GetChatFlagQueueUseCase', () => {
  it('đòi report.read — cùng quyền với xử báo xấu', async () => {
    // Không thêm mã riêng: mã đó sẽ là một dòng `admin_permissions` chưa chắc vai
    // nào được gán, tức đúng loại "quyền seed mà không ai có".
    const deps = makeDeps({ granted: [] });

    await expect(
      new GetChatFlagQueueUseCase(
        deps.permissions as never,
        deps.chat as never,
      ).handle({ actorUserId: ActorId }),
    ).rejects.toThrow(ForbiddenException);
    expect(deps.chat.listPendingFlags).not.toHaveBeenCalled();
  });

  it('trả hàng đợi kèm phân trang', async () => {
    const deps = makeDeps({ granted: ['report.read'] });
    const result = await new GetChatFlagQueueUseCase(
      deps.permissions as never,
      deps.chat as never,
    ).handle({ actorUserId: ActorId, page: 2, pageSize: 10 });

    expect(deps.chat.listPendingFlags).toHaveBeenCalledWith({
      skip: 10,
      take: 10,
    });
    expect(result.meta.page).toBe(2);
  });
});

describe('GetChatFlagPendingCountUseCase', () => {
  it('trả số cờ chưa xem cho badge', async () => {
    const deps = makeDeps({ granted: ['report.read'] });

    await expect(
      new GetChatFlagPendingCountUseCase(
        deps.permissions as never,
        deps.chat as never,
      ).handle({ actorUserId: ActorId }),
    ).resolves.toEqual({ pending: 3 });
  });
});

describe('ReviewChatFlagUseCase', () => {
  const review = (deps: ReturnType<typeof makeDeps>) =>
    new ReviewChatFlagUseCase(deps.permissions as never, deps.chat as never);

  it('đòi report.resolve, không phải report.read', async () => {
    // Đọc hàng đợi và quyết định là hai việc khác nhau: một Moderator chỉ được xem
    // vẫn không được đóng cờ.
    const deps = makeDeps({ granted: ['report.read'] });

    await expect(
      review(deps).handle({
        actorUserId: ActorId,
        flagId: FlagId,
        review: { action: 'DISMISSED' },
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('cờ đã xử thì trả 404, không ghi đè quyết định người trước', async () => {
    const deps = makeDeps({ granted: ['report.resolve'], reviewed: false });

    await expect(
      review(deps).handle({
        actorUserId: ActorId,
        flagId: FlagId,
        review: { action: 'DISMISSED' },
      }),
    ).rejects.toThrow(ChatMessageNotFoundException);
    expect(deps.permissions.appendAudit).not.toHaveBeenCalled();
  });

  it('ghi audit kèm quyết định và lý do', async () => {
    const deps = makeDeps({ granted: ['report.resolve'] });
    await review(deps).handle({
      actorUserId: ActorId,
      flagId: FlagId,
      review: { action: 'USER_WARNED', note: '  đã nhắc người gửi  ' },
    });

    expect(deps.chat.reviewFlag).toHaveBeenCalledWith({
      flagId: FlagId,
      reviewerId: ActorId,
      action: 'USER_WARNED',
      note: 'đã nhắc người gửi',
    });
    expect(deps.permissions.appendAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'REVIEW_CHAT_FLAG',
        resourceId: FlagId,
        after: { action: 'USER_WARNED' },
      }),
    );
  });

  it('ghi chú rỗng thành null, không thành chuỗi trắng', async () => {
    const deps = makeDeps({ granted: ['report.resolve'] });
    await review(deps).handle({
      actorUserId: ActorId,
      flagId: FlagId,
      review: { action: 'DISMISSED', note: '   ' },
    });

    expect(deps.chat.reviewFlag).toHaveBeenCalledWith(
      expect.objectContaining({ note: null }),
    );
  });
});
