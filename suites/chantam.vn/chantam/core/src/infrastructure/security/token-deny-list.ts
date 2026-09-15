import { ITokenDenyList } from '@chantam/service.auth-lib';
import Redis from 'ioredis';

/**
 * Danh sách thu hồi access token, lưu trên Redis.
 *
 * Mỗi tài khoản giữ đúng một khoá: mốc thời gian "mọi token phát trước lúc này
 * đều hỏng". Khoá tự hết hạn sau tuổi thọ access token, vì qua mốc đó thì
 * chẳng còn token nào phát trước nó còn sống để mà chặn.
 *
 * KHÔNG nuốt lỗi Redis như `LoginThrottle` làm. Chống dò mật khẩu hỏng thì chỉ
 * mất một lớp bảo vệ phụ; thu hồi phiên hỏng thì token của kẻ chiếm tài khoản
 * sống tiếp — bên gọi phải biết mà dừng lại.
 */
export class RedisTokenDenyList implements ITokenDenyList {
  public constructor(
    private readonly redis: Redis,
    private readonly accessTtlSeconds: number,
  ) {}

  private key(userId: string): string {
    return `auth:revoked:${userId}`;
  }

  public async revokeIssuedBefore(userId: string): Promise<void> {
    // Giây nguyên, vì `iat` của JWT cũng chỉ có độ phân giải giây. Hệ quả: token
    // phát ra trong cùng giây với lệnh thu hồi vẫn sống. Chấp nhận khe hở dưới
    // một giây đó, đổi lấy việc người dùng đổi mật khẩu xong đăng nhập lại ngay
    // KHÔNG bị chính lệnh thu hồi của mình đá ra.
    const nowSeconds = Math.floor(Date.now() / 1000);

    // Cộng thêm 60 giây phòng lệch đồng hồ giữa các tiến trình.
    await this.redis.set(
      this.key(userId),
      String(nowSeconds),
      'EX',
      this.accessTtlSeconds + 60,
    );
  }

  public async isRevoked(userId: string, issuedAt: Date): Promise<boolean> {
    const stored = await this.redis.get(this.key(userId));

    if (!stored) return false;

    return Math.floor(issuedAt.getTime() / 1000) < Number(stored);
  }
}
