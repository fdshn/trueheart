import {
  IGetMyPostsCommand,
  IGetMyPostsUseCase,
} from '@/application/contracts/post';
import { IPostRepository } from '@/domain/ports/repository';
import { IGetMyPostsResponseDto } from '@chantam.vn/chantam.core-lib/dto';
import { PaginationMetaDto, toSkipTake } from '@chantam/service.common-lib/dto';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class GetMyPostsUseCase implements IGetMyPostsUseCase {
  public constructor(
    @Inject(IPostRepository)
    private readonly postRepository: IPostRepository,
  ) {}

  public async handle(
    command: IGetMyPostsCommand,
  ): Promise<IGetMyPostsResponseDto> {
    const { skip, take } = toSkipTake(command);
    const { items, total } = await this.postRepository.findMyPosts({
      // Tác giả lấy từ access token, KHÔNG nhận từ query: tin vào query là ai
      // cũng đọc được bài nháp và bài bị từ chối của người khác.
      authorId: command.userId,
      postType: command.postType,
      status: command.status,
      categoryId: command.categoryId,
      skip,
      take,
    });

    // Trả toạ độ THẬT, không làm nhiễu: đây là bài của chính người gọi, và họ
    // cần thấy đúng chỗ mình đã ghim để sửa cho khớp.
    return {
      posts: items,
      meta: new PaginationMetaDto(Math.floor(skip / take) + 1, take, total),
    };
  }
}
