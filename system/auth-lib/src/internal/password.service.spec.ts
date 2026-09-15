import { IAuthOptions } from './auth-options';
import { PasswordService } from './password.service';

// 4 vòng thay vì 12: đủ để kiểm hành vi, mà bộ test không mất hàng chục giây.
const options: IAuthOptions = {
  jwtSecret: 'khong-dung-toi-trong-bai-kiem-tra-nay-0123456789',
  accessTtlSeconds: 900,
  refreshTtlSeconds: 2_592_000,
  bcryptRounds: 4,
  publicPathPrefixes: ['/health'],
};

describe('PasswordService', () => {
  const service = new PasswordService(options);

  it('băm rồi kiểm lại đúng mật khẩu', async () => {
    const hashed = await service.hash('MatKhau@123');

    await expect(service.verify('MatKhau@123', hashed)).resolves.toBe(true);
  });

  it('từ chối mật khẩu sai', async () => {
    const hashed = await service.hash('MatKhau@123');

    await expect(service.verify('MatKhau@124', hashed)).resolves.toBe(false);
  });

  it('cùng một mật khẩu băm hai lần ra hai giá trị khác nhau', async () => {
    // Chứng minh có salt. Không có salt thì lộ database là lộ luôn việc những
    // ai đang dùng chung một mật khẩu.
    const [first, second] = await Promise.all([
      service.hash('MatKhau@123'),
      service.hash('MatKhau@123'),
    ]);

    expect(first).not.toBe(second);
    await expect(service.verify('MatKhau@123', first)).resolves.toBe(true);
    await expect(service.verify('MatKhau@123', second)).resolves.toBe(true);
  });

  it('không lưu mật khẩu gốc trong chuỗi băm', async () => {
    const hashed = await service.hash('MatKhau@123');

    expect(hashed).not.toContain('MatKhau@123');
    expect(hashed.startsWith('$2')).toBe(true);
  });

  it('kiểm được mật khẩu băm bằng số vòng cũ', async () => {
    // bcrypt đọc số vòng từ chính chuỗi hash, nên nâng bcryptRounds không làm
    // hỏng mật khẩu của người dùng cũ.
    const old = await new PasswordService({ ...options, bcryptRounds: 4 }).hash(
      'X@1',
    );
    const stronger = new PasswordService({ ...options, bcryptRounds: 6 });

    await expect(stronger.verify('X@1', old)).resolves.toBe(true);
  });
});
