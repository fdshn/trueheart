import {
  IGetGiftPostCommand,
  IGetGiftPostResult,
  IGetGiftPostUseCase,
} from '@/application/contracts/gift-post';
import { GiftPostNotFoundException } from '@/domain/exceptions';
import { IConfig } from '@/domain/ports/config';
import { IPostRepository } from '@/domain/ports/repository';
import { applyGeoJitter } from '@chantam/service.persistency-lib/geo';
import { Inject, Injectable } from '@nestjs/common';
import { toLegacyGiftPost } from './gift-post-compat.mapper';

@Injectable()
export class GetGiftPostUseCase implements IGetGiftPostUseCase {
  public constructor(
    @Inject(IPostRepository)
    private readonly postRepository: IPostRepository,
    @Inject(IConfig)
    private readonly config: IConfig,
  ) {}

  public async handle(
    command: IGetGiftPostCommand,
  ): Promise<IGetGiftPostResult> {
    const existing = await this.postRepository.findPublicByGlobalId(
      command.giftPostId,
    );

    if (!existing) throw new GiftPostNotFoundException(command.giftPostId);

    const giftPost = toLegacyGiftPost(existing);

    // Route này LUÔN làm nhiễu, không có ngoại lệ nào — và đó không phải một việc còn
    // thiếu, mà là hệ quả bắt buộc của việc `GET /gift-posts/:id` là `@Public()`.
    //
    // Bản trước 01/10 mang một tham số `canViewExactLocation` kèm ghi chú *"Hiện luôn là
    // false vì chưa có xác thực. Khi có auth-lib, giá trị này được suy ra từ trạng thái đơn
    // xin của người gọi"*. auth-lib đã có từ lâu, nhưng tham số đó vẫn hardcode `false` ở
    // controller — nên nó là một nhánh chết **trông như một tính năng**: ai đọc file này
    // đều kết luận đặc tả mục 1.3 đã hiện thực.
    //
    // Lý do thật không phải auth-lib: route này có `@Public()`, nên **không có danh tính
    // người gọi** để mà suy ra quy tắc. Client cần toạ độ thật phải dùng đường canonical
    // `GET /posts/:postId` — nơi đặc tả 1.3 nay chạy thật cho chủ bài và người nhận được chọn.
    //
    // Nhiễu tất định theo `globalId` để pin không nhảy giữa các lần gọi: nhiễu ngẫu nhiên
    // mỗi lần thì gọi vài chục lần rồi lấy tâm cụm là ra vị trí thật.
    giftPost.location = applyGeoJitter(
      giftPost.location,
      giftPost.globalId,
      this.config.geo.jitterRadiusMeters,
    );

    return { giftPost, isLocationApproximate: true };
  }
}
