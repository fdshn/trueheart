import {
  IRequestPasswordResetCommand,
  IRequestPasswordResetResult,
  IRequestPasswordResetUseCase,
} from '@/application/contracts/auth';
import { IOtpSender } from '@/domain/ports/notification';
import { IUserRepository } from '@/domain/ports/repository';
import { IOtpStore } from '@/domain/ports/security';
import { UserStatuses } from '@chantam.vn/chantam.core-lib/consts';
import { PasswordResetChannels } from '@chantam.vn/chantam.core-lib/dto';
import { IUserEntity } from '@chantam.vn/chantam.core-lib/entities';
import { Inject, Injectable } from '@nestjs/common';

export const PasswordResetPurpose = 'password-reset';

/** Che email thành `ngu***@gmail.com`, giữ đủ để chủ nhận ra, không đủ để người lạ đọc. */
function maskEmail(email: string): string {
  const [local, domain] = email.split('@');

  if (!domain) return '***';

  return `${local.slice(0, 3)}***@${domain}`;
}

/** Che số điện thoại thành `098***4567`. */
function maskPhone(phone: string): string {
  if (phone.length < 7) return '***';

  return `${phone.slice(0, 3)}***${phone.slice(-4)}`;
}

@Injectable()
export class RequestPasswordResetUseCase implements IRequestPasswordResetUseCase {
  public constructor(
    @Inject(IUserRepository)
    private readonly userRepository: IUserRepository,
    @Inject(IOtpStore)
    private readonly otpStore: IOtpStore,
    @Inject(IOtpSender)
    private readonly otpSender: IOtpSender,
  ) {}

  public async handle(
    command: IRequestPasswordResetCommand,
  ): Promise<IRequestPasswordResetResult> {
    const identifier = command.reset.identifier.trim();
    const user = await this.userRepository.findByIdentifier(identifier);

    // Chưa gửi được ĐÚNG KÊNH của người này thì KHÔNG sinh mã: sinh ra rồi
    // không gửi được chỉ tạo rác trong Redis và một lời hứa sai với người dùng.
    // Hỏi theo kênh đã chọn, vì cắm được email không có nghĩa là gửi được SMS.
    // Hướng thẳng sang Admin, đúng nhánh mà F05 đã định cho trường hợp không có
    // kênh khôi phục.
    const picked = user ? this.pickTarget(user) : null;
    const target =
      picked && (await this.otpSender.canSend(picked.channel)) ? picked : null;

    // Tài khoản không tồn tại và tài khoản không có email/SĐT trả về HỆT NHAU.
    // Nếu khác, endpoint này trở thành công cụ dò xem tài khoản nào có thật —
    // đúng lỗ hổng mà màn đăng nhập đã cẩn thận tránh.
    if (!user || !target)
      return {
        channel: PasswordResetChannels.ADMIN_SUPPORT,
        maskedTarget: null,
        expiresInSeconds: null,
      };

    const { code, expiresInSeconds } = await this.otpStore.issue(
      PasswordResetPurpose,
      user.globalId,
    );

    await this.otpSender.send(target.channel, target.value, code);

    return {
      channel: target.channel,
      maskedTarget: target.masked,
      expiresInSeconds,
    };
  }

  /** Ưu tiên email vì gửi email rẻ hơn và không bị giới hạn tin nhắn. */
  private pickTarget(user: IUserEntity): {
    channel: PasswordResetChannels;
    value: string;
    masked: string;
  } | null {
    // Tài khoản bị khoá vĩnh viễn thì không cho đặt lại mật khẩu.
    if (user.status === UserStatuses.BANNED) return null;

    // CHỈ email đã xác minh. Địa chỉ mới gõ vào hồ sơ thì chưa ai chứng minh là
    // của mình — gõ nhầm một ký tự là gửi mã đặt lại mật khẩu cho người lạ, và
    // họ đổi mật khẩu xong là chủ thật mất luôn tài khoản.
    if (user.email && user.emailVerifiedAt)
      return {
        channel: PasswordResetChannels.EMAIL,
        value: user.email,
        masked: maskEmail(user.email),
      };

    // SĐT thì không cần kiểm thêm: `phone_verified_at` là điều kiện của cổng
    // hồ sơ, nhưng ở đây vẫn phải tự kiểm vì người dùng đổi SĐT là mốc đó về
    // null mà tài khoản vẫn còn số cũ trong cột.
    if (user.phone && user.phoneVerifiedAt)
      return {
        channel: PasswordResetChannels.SMS,
        value: user.phone,
        masked: maskPhone(user.phone),
      };

    return null;
  }
}
