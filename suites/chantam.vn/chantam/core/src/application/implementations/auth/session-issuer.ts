import { IConfig } from '@/domain/ports/config';
import { IUserSessionRepository } from '@/domain/ports/repository';
import { IAuthResultDto, IOwnUserDto } from '@chantam.vn/chantam.core-lib/dto';
import { IUserEntity } from '@chantam.vn/chantam.core-lib/entities';
import { isProfileComplete } from '@chantam.vn/chantam.core-lib/models';
import { ITokenService } from '@chantam/service.auth-lib';
import { Inject, Injectable } from '@nestjs/common';

/**
 * Cấp phiên mới cho một tài khoản.
 *
 * Dùng chung bởi đăng ký, đăng nhập và làm mới phiên — ba đường đi khác nhau
 * nhưng đều phải kết thúc bằng đúng một trạng thái phiên, nếu không sẽ có đường
 * quên thu hồi phiên cũ hoặc quên xoá FCM token.
 */
@Injectable()
export class SessionIssuer {
  public constructor(
    @Inject(IUserSessionRepository)
    private readonly sessionRepository: IUserSessionRepository,
    @Inject(ITokenService)
    private readonly tokenService: ITokenService,
    @Inject(IConfig)
    private readonly config: IConfig,
  ) {}

  public async issue(
    user: IUserEntity,
    deviceId: string,
    fcmToken?: string,
  ): Promise<IAuthResultDto> {
    // Một thiết bị chỉ giữ một phiên. Không thu hồi phiên cũ thì mỗi lần mở app
    // lại đẻ thêm một hàng, và bảng phiên phình ra vô hạn.
    await this.sessionRepository.revokeByDevice(user.globalId, deviceId);

    const refreshToken = this.tokenService.generateRefreshToken();

    await this.sessionRepository.insert({
      userId: user.globalId,
      refreshTokenHash: this.tokenService.hashRefreshToken(refreshToken),
      deviceId,
      fcmToken: fcmToken ?? null,
      expiresAt: new Date(
        Date.now() + this.config.auth.refreshTtlSeconds * 1000,
      ),
      revokedAt: null,
    });

    const accessToken = await this.tokenService.signAccessToken({
      userId: user.globalId,
      username: user.username,
      rank: user.rank,
      status: user.status,
    });

    return {
      session: {
        accessToken,
        refreshToken,
        expiresIn: this.config.auth.accessTtlSeconds,
      },
      user: SessionIssuer.toOwnUserDto(user),
    };
  }

  /**
   * Ánh xạ entity sang DTO của chính chủ.
   *
   * Cố ý liệt kê từng trường chứ không trải object: trải thì mỗi cột thêm vào
   * `users` về sau sẽ tự động rò ra API mà không ai nhận ra.
   */
  public static toOwnUserDto(user: IUserEntity): IOwnUserDto {
    return {
      userId: user.globalId,
      username: user.username,
      fullName: user.fullName,
      avatarUrl: user.avatarUrl,
      email: user.email,
      phone: user.phone,
      rank: user.rank,
      status: user.status,
      phoneVerified: user.phoneVerifiedAt !== null,
      profileComplete: isProfileComplete(user),
    };
  }
}
