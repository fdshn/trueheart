import {
  OnboardingIncompleteException,
  ProfileIncompleteException,
  UserNotFoundException,
} from '@/domain/exceptions';
import { UserRanks } from '@chantam.vn/chantam.core-lib/consts';
import { ProfileGate } from './profile-gate';

const completeProfile = {
  globalId: 'u-1',
  deletedAt: null,
  fullName: 'Nguyễn An',
  avatarUrl: 'https://cdn/avatar.png',
  phone: '+84900000000',
  email: 'an@chantam.test',
  rank: UserRanks.MEMBER,
};

function makeGate(user: unknown) {
  const users = { findOneBy: jest.fn().mockResolvedValue(user) };
  return { gate: new ProfileGate(users as never), users };
}

describe('ProfileGate', () => {
  it('cho qua khi hồ sơ đủ bốn trường', async () => {
    const { gate } = makeGate(completeProfile);

    await expect(gate.assertComplete('u-1')).resolves.toMatchObject({
      globalId: 'u-1',
    });
  });

  it('trả về chính người dùng đó — chỗ gọi không phải nạp lại', async () => {
    // Trả `void` thì mọi chỗ gọi đều phải đi database lần hai cho cùng một hàng.
    const { gate } = makeGate(completeProfile);

    const user = await gate.assertComplete('u-1');

    expect(user.fullName).toBe('Nguyễn An');
  });

  it.each([
    ['fullName', 'Họ tên'],
    ['avatarUrl', 'Avatar'],
    ['phone', 'SĐT'],
    ['email', 'Email'],
  ])('chặn khi thiếu %s và nêu đích danh trường đó', async (field, label) => {
    // Thông báo "hồ sơ chưa đủ" bắt người dùng tự đoán mình thiếu gì, và mỗi
    // lần đoán sai là một lần họ bỏ cuộc.
    const { gate } = makeGate({ ...completeProfile, [field]: null });

    await expect(gate.assertComplete('u-1')).rejects.toThrow(
      ProfileIncompleteException,
    );
    await expect(gate.assertComplete('u-1')).rejects.toMatchObject({
      message: expect.stringContaining(label),
    });
  });

  it('liệt kê ĐỦ các trường thiếu, không chỉ trường đầu tiên', async () => {
    const { gate } = makeGate({
      ...completeProfile,
      phone: null,
      email: null,
    });

    await expect(gate.assertComplete('u-1')).rejects.toMatchObject({
      message: expect.stringContaining('SĐT'),
    });
    await expect(gate.assertComplete('u-1')).rejects.toMatchObject({
      message: expect.stringContaining('Email'),
    });
  });

  it('coi tài khoản đã xoá mềm là không tồn tại', async () => {
    const { gate } = makeGate({ ...completeProfile, deletedAt: new Date() });

    await expect(gate.assertComplete('u-1')).rejects.toThrow(
      UserNotFoundException,
    );
  });

  it('ném UserNotFound khi không có hàng nào', async () => {
    const { gate } = makeGate(null);

    await expect(gate.assertComplete('u-1')).rejects.toThrow(
      UserNotFoundException,
    );
  });

  describe('assertOnboarded', () => {
    it('chặn Viewer — chưa qua cửa vào', async () => {
      const { gate } = makeGate({
        ...completeProfile,
        rank: UserRanks.VIEWER,
      });

      await expect(gate.assertOnboarded('u-1')).rejects.toThrow(
        OnboardingIncompleteException,
      );
    });

    it('cho qua từ Thành viên trở lên', async () => {
      const { gate } = makeGate(completeProfile);

      await expect(gate.assertOnboarded('u-1')).resolves.toMatchObject({
        rank: UserRanks.MEMBER,
      });
    });

    it('vẫn kiểm hồ sơ TRƯỚC khi kiểm rank', async () => {
      // Viewer hồ sơ thiếu phải nghe "thiếu SĐT" chứ không phải "chưa onboard":
      // điền SĐT chính là việc đưa họ ra khỏi Viewer.
      const { gate } = makeGate({
        ...completeProfile,
        rank: UserRanks.VIEWER,
        phone: null,
      });

      await expect(gate.assertOnboarded('u-1')).rejects.toThrow(
        ProfileIncompleteException,
      );
    });
  });
});
