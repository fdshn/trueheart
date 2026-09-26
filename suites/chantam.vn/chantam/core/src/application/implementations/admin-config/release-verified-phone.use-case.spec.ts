import {
  VerifiedPhoneInUseException,
  VerifiedPhoneNotFoundException,
} from '@/domain/exceptions';
import {
  ForbiddenException,
  ValidationFailedException,
} from '@chantam/service.common-lib/exception';
import { ReleaseVerifiedPhoneUseCase } from './admin-user.use-cases';

const ActorId = '11111111-1111-4111-8111-111111111111';
const HolderId = '22222222-2222-4222-8222-222222222222';

const Holder = {
  userId: HolderId,
  username: 'chu-cu',
  verifiedAt: new Date('2026-01-01T00:00:00Z'),
  holderDeleted: true,
  stillVerified: false,
};

function makeDeps(
  outcome: unknown = { status: 'RELEASED', holder: Holder },
  allowed = true,
) {
  return {
    permissions: { hasPermission: jest.fn(async () => allowed) },
    verifiedPhones: { claim: jest.fn(), release: jest.fn(async () => outcome) },
  };
}

function makeUseCase(deps: ReturnType<typeof makeDeps>) {
  return new ReleaseVerifiedPhoneUseCase(
    deps.permissions as never,
    deps.verifiedPhones as never,
  );
}

const Command = {
  actorUserId: ActorId,
  release: { phone: '0912345678', reason: 'Người dùng mất tài khoản cũ' },
};

describe('ReleaseVerifiedPhoneUseCase', () => {
  it('nắn số về E.164 trước khi tra sổ', async () => {
    // Admin gõ `0912345678`, sổ lưu băm của `+84912345678`. Không nắn thì không
    // bao giờ tìm thấy gì, và Admin tưởng số đó chưa từng xác minh.
    const deps = makeDeps();

    const result = await makeUseCase(deps).handle(Command);

    expect(deps.verifiedPhones.release).toHaveBeenCalledWith(
      expect.objectContaining({ phone: '+84912345678' }),
    );
    expect(result.phone).toBe('+84912345678');
    expect(result.previousHolder.username).toBe('chu-cu');
  });

  it('thiếu quyền thì KHÔNG đụng tới sổ', async () => {
    const deps = makeDeps(undefined, false);

    await expect(makeUseCase(deps).handle(Command)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(deps.verifiedPhones.release).not.toHaveBeenCalled();
  });

  it('thiếu lý do thì từ chối — đây là thao tác sẽ bị hỏi lại', async () => {
    const deps = makeDeps();

    await expect(
      makeUseCase(deps).handle({
        ...Command,
        release: { ...Command.release, reason: '   ' },
      }),
    ).rejects.toBeInstanceOf(ValidationFailedException);
    expect(deps.verifiedPhones.release).not.toHaveBeenCalled();
  });

  it('số không nắn được thì báo lỗi nhập liệu', async () => {
    const deps = makeDeps();

    await expect(
      makeUseCase(deps).handle({
        ...Command,
        release: { ...Command.release, phone: '12' },
      }),
    ).rejects.toBeInstanceOf(ValidationFailedException);
  });

  it('số chưa từng xác minh thì 404', async () => {
    const deps = makeDeps({ status: 'NOT_FOUND' });

    await expect(makeUseCase(deps).handle(Command)).rejects.toBeInstanceOf(
      VerifiedPhoneNotFoundException,
    );
  });

  it('người giữ còn sống và vẫn xác minh thì 409, kèm tên để Admin biết xử ai', async () => {
    const deps = makeDeps({
      status: 'IN_USE',
      holder: { ...Holder, holderDeleted: false, stillVerified: true },
    });

    await expect(makeUseCase(deps).handle(Command)).rejects.toBeInstanceOf(
      VerifiedPhoneInUseException,
    );
  });
});
