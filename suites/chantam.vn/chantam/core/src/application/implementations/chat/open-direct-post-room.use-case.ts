import {
  IOpenDirectPostRoomCommand,
  IOpenDirectPostRoomUseCase,
} from '@/application/contracts/chat';
import {
  ChatDirectPostNotSupportedException,
  ChatDirectPostSelfException,
  ChatRoomNotFoundException,
  PostNotFoundException,
} from '@/domain/exceptions';
import { IConfig } from '@/domain/ports/config';
import { IChatRepository, IPostRepository } from '@/domain/ports/repository';
import {
  PostTypes,
  PubliclyVisibleGiftPostStatuses,
} from '@chantam.vn/chantam.core-lib/consts';
import { IOpenDirectPostRoomResponseDto } from '@chantam.vn/chantam.core-lib/dto';
import { Inject, Injectable } from '@nestjs/common';
import { ProfileGate } from '../profile/profile-gate';
import { toRoomSummary } from './chat.use-cases';

/**
 * Người mua mở phòng chat với người bán về MỘT bài Rao vặt (PR #46 §7.2).
 *
 * Không có giao dịch, không có yêu cầu xin nhận: hệ thống chỉ nối hai người, không quản lý
 * mua bán. Phòng đã có thì trả lại phòng cũ — cùng hai người nhưng hai bài khác nhau là hai
 * phòng.
 */
@Injectable()
export class OpenDirectPostRoomUseCase implements IOpenDirectPostRoomUseCase {
  public constructor(
    @Inject(IPostRepository) private readonly posts: IPostRepository,
    @Inject(IChatRepository) private readonly chat: IChatRepository,
    private readonly profileGate: ProfileGate,
    @Inject(IConfig) private readonly config: IConfig,
  ) {}

  public async handle(
    command: IOpenDirectPostRoomCommand,
  ): Promise<IOpenDirectPostRoomResponseDto> {
    // Cùng cổng hồ sơ với chat giao dịch: nhắn tin cho người lạ mà không có hồ sơ là đúng
    // thứ cổng này sinh ra để chặn.
    await this.profileGate.assertComplete(command.userId);

    const post = await this.posts.findOneBy({ globalId: command.postId });
    // Bài không còn công khai (Admin gỡ là `REJECTED`, hết hạn, đã xong) trả 404 như bài
    // không có — cùng tập trạng thái với bảng tin và trang chi tiết.
    if (
      !post ||
      post.deletedAt ||
      !PubliclyVisibleGiftPostStatuses.includes(post.status)
    )
      throw new PostNotFoundException(command.postId);
    if (post.authorId === command.userId)
      throw new ChatDirectPostSelfException();
    if (post.postType !== PostTypes.CLASSIFIED)
      throw new ChatDirectPostNotSupportedException();

    const { room, created } = await this.chat.openDirectPostRoom({
      postId: post.globalId,
      buyerId: command.userId,
      sellerId: post.authorId,
    });

    const summary = await this.chat.describeRoom(room.globalId, command.userId);
    if (!summary) throw new ChatRoomNotFoundException();

    return {
      room: toRoomSummary(summary, this.config.storage.publicBaseUrl),
      created,
    };
  }
}
