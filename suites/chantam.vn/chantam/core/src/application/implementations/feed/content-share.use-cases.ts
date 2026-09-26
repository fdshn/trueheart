import {
  IRecordContentShareCommand,
  IRecordContentShareResult,
  IRecordContentShareUseCase,
} from '@/application/contracts/feed';
import { PostNotFoundException } from '@/domain/exceptions';
import { IConfig } from '@/domain/ports/config';
import {
  IContentShareRepository,
  IPostRepository,
} from '@/domain/ports/repository';
import { IRequestThrottle } from '@/domain/ports/security';
import { ContentSubjectTypes } from '@chantam.vn/chantam.core-lib/consts';
import { Inject, Injectable } from '@nestjs/common';

/**
 * Một người chia sẻ MỘT bài bao lâu thì được tính lượt tiếp theo.
 *
 * `share_count` đếm theo LƯỢT, không đếm theo người (chốt 26/09) — nên không có
 * gì tự chặn việc gọi endpoint này một nghìn lần để bài hiện "1.000 lượt chia
 * sẻ". Người thật không chia sẻ lại cùng một bài trong vòng một giờ; máy thì có.
 */
const ShareCooldownSeconds = 3_600;

/**
 * Ghi nhận một lượt chia sẻ link ra ngoài.
 *
 * Không nhân bản nội dung lên tường người chia sẻ — QĐ-3. Server chỉ:
 *   1. xác bài còn tồn tại,
 *   2. ghi một dòng append-only vào `content_shares`,
 *   3. tăng `share_count` trong cùng transaction,
 *   4. trả đường dẫn chuẩn để client mở khay hệ điều hành.
 */
@Injectable()
export class RecordContentShareUseCase implements IRecordContentShareUseCase {
  public constructor(
    @Inject(IContentShareRepository)
    private readonly shares: IContentShareRepository,
    @Inject(IPostRepository)
    private readonly posts: IPostRepository,
    @Inject(IConfig)
    private readonly config: IConfig,
    @Inject(IRequestThrottle)
    private readonly throttle: IRequestThrottle,
  ) {}

  public async handle(
    command: IRecordContentShareCommand,
  ): Promise<IRecordContentShareResult> {
    if (command.subjectType === ContentSubjectTypes.POST) {
      const post = await this.posts.findOneBy({ globalId: command.subjectId });
      if (!post || post.deletedAt)
        throw new PostNotFoundException(command.subjectId);
    }

    // Khoá theo CẢ người lẫn bài: chặn theo người thôi thì một người chia sẻ
    // mười bài khác nhau trong một phút cũng bị chặn, mà đó là hành vi bình
    // thường của người đang lướt.
    const bucket = `share:${command.subjectType}:${command.subjectId}`;
    await this.throttle.assertWithinLimit({
      bucket,
      key: command.userId,
      limit: 1,
    });

    const channel =
      command.channel && command.channel.trim().length > 0
        ? command.channel.trim().slice(0, 40)
        : null;

    const { shareCount } = await this.shares.recordShare({
      subjectType: command.subjectType,
      subjectId: command.subjectId,
      userId: command.userId,
      channel,
    });

    // Đếm SAU khi ghi: chết giữa chừng thì lượt này không tính, còn đếm trước
    // là chặn mất một lượt chưa bao giờ xảy ra.
    await this.throttle.registerHit({
      bucket,
      key: command.userId,
      windowSeconds: ShareCooldownSeconds,
    });

    // Chỉ đường dẫn tương đối: ghép tên miền hộ client là sinh ra link chết khi
    // đổi môi trường. `shareUrl` tuyệt đối chỉ có khi web công khai đã cấu hình.
    const deepLinkPath = `/posts/${command.subjectId}`;
    const base = this.config.web.publicBaseUrl.replace(/\/$/, '');
    const shareUrl = base ? `${base}${deepLinkPath}` : null;

    return {
      share: {
        deepLinkPath,
        shareUrl,
        shareCount,
      },
    };
  }
}
