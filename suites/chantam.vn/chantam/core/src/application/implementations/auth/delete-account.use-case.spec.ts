import { UserHasOpenTransactionsException } from '@/domain/exceptions';
import { DeleteAccountUseCase } from './delete-account.use-case';

const UserId = '10000000-0000-4000-8000-000000000001';

function makeDeps(openTransactions: number) {
  const execute = jest.fn(async () => ({ affected: 2 }));
  const builder = {
    update: () => builder,
    set: () => builder,
    where: () => builder,
    andWhere: () => builder,
    execute,
  };

  return {
    users: {
      findOneBy: jest.fn(async () => ({
        globalId: UserId,
        passwordHash: 'hash',
        deletedAt: null,
      })),
      update: jest.fn(async () => undefined),
    },
    sessions: { createQueryBuilder: () => builder },
    passwords: { verify: jest.fn(async () => true) },
    denyList: { revokeIssuedBefore: jest.fn(async () => undefined) },
    transactions: {
      countOpenForUser: jest.fn(async () => openTransactions),
    },
    groups: { dissolveOwnedBy: jest.fn(async () => 0) },
  };
}

function makeUseCase(deps: ReturnType<typeof makeDeps>) {
  return new DeleteAccountUseCase(
    deps.users as never,
    deps.sessions as never,
    deps.passwords as never,
    deps.denyList as never,
    deps.transactions as never,
    deps.groups as never,
  );
}

const Command = { userId: UserId, account: { password: 'mat-khau' } };

describe('DeleteAccountUseCase', () => {
  it('chặn xoá khi còn giao dịch dở dang, không đụng gì tới dữ liệu', async () => {
    // Xoá giữa chừng là bỏ phía bên kia treo với một lượt trao không bao giờ
    // kết thúc.
    const deps = makeDeps(2);

    await expect(makeUseCase(deps).handle(Command)).rejects.toBeInstanceOf(
      UserHasOpenTransactionsException,
    );
    expect(deps.users.update).not.toHaveBeenCalled();
    expect(deps.denyList.revokeIssuedBefore).not.toHaveBeenCalled();
  });

  it('kiểm giao dịch dở dang TRƯỚC khi thu hồi token', async () => {
    // Thu hồi trước rồi mới phát hiện không xoá được là đá người dùng ra khỏi
    // phiên đang đăng nhập dù tài khoản vẫn còn nguyên.
    const deps = makeDeps(1);

    await expect(makeUseCase(deps).handle(Command)).rejects.toThrow();
    expect(deps.transactions.countOpenForUser).toHaveBeenCalledWith(UserId);
    expect(deps.denyList.revokeIssuedBefore).not.toHaveBeenCalled();
  });

  it('xoá được khi không còn giao dịch dở dang', async () => {
    const deps = makeDeps(0);

    const result = await makeUseCase(deps).handle(Command);

    expect(deps.users.update).toHaveBeenCalledTimes(1);
    expect(deps.denyList.revokeIssuedBefore).toHaveBeenCalledWith(UserId);
    expect(result.revokedSessions).toBe(2);
  });

  it('sai mật khẩu thì không kiểm giao dịch, cũng không xoá', async () => {
    const deps = makeDeps(0);
    deps.passwords.verify.mockResolvedValue(false as never);

    await expect(makeUseCase(deps).handle(Command)).rejects.toThrow();
    expect(deps.transactions.countOpenForUser).not.toHaveBeenCalled();
    expect(deps.users.update).not.toHaveBeenCalled();
  });

  it('Owner xoá tài khoản thì nhóm giải tán', async () => {
    // CHỐT-02: giữ nguyên membership, ledger và audit — chỉ đổi trạng thái.
    const deps = makeDeps(0);

    await makeUseCase(deps).handle({
      userId: UserId,
      account: { password: 'mat-khau-dung' },
    });

    expect(deps.groups.dissolveOwnedBy).toHaveBeenCalledWith(UserId);
  });

  it('còn lượt trao dở dang thì KHÔNG đụng tới nhóm', async () => {
    // Chặn ở bước trên thì tài khoản vẫn nguyên, nên nhóm cũng phải nguyên.
    const deps = makeDeps(2);

    await expect(
      makeUseCase(deps).handle({
        userId: UserId,
        account: { password: 'mat-khau-dung' },
      }),
    ).rejects.toBeDefined();

    expect(deps.groups.dissolveOwnedBy).not.toHaveBeenCalled();
  });
});
