import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ITokenDenyList } from '../contracts';

/**
 * Bản mặc định khi service không khai báo kho lưu cho danh sách chặn.
 *
 * Không im lặng: nó kêu lên lúc khởi động, vì "thu hồi phiên" mà không thu hồi
 * được là loại hỏng hóc nguy hiểm nhất — nhìn từ ngoài mọi thứ vẫn xanh.
 */
@Injectable()
export class NoopTokenDenyList implements ITokenDenyList, OnModuleInit {
  private readonly logger = new Logger(NoopTokenDenyList.name);

  public onModuleInit(): void {
    this.logger.warn(
      'Chưa khai báo ITokenDenyList — access token KHÔNG thu hồi được trước hạn. ' +
        'Sau khi đổi mật khẩu hoặc xoá tài khoản, token cũ vẫn dùng được tới lúc hết hạn.',
    );
  }

  public async revokeIssuedBefore(): Promise<void> {}

  public async isRevoked(): Promise<boolean> {
    return false;
  }
}
