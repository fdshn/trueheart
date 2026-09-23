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
import { ContentSubjectTypes } from '@chantam.vn/chantam.core-lib/consts';
import { Inject, Injectable } from '@nestjs/common';

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
  ) {}

  public async handle(
    command: IRecordContentShareCommand,
  ): Promise<IRecordContentShareResult> {
    if (command.subjectType === ContentSubjectTypes.POST) {
      const post = await this.posts.findOneBy({ globalId: command.subjectId });
      if (!post || post.deletedAt)
        throw new PostNotFoundException(command.subjectId);
    }

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
