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
    const canViewExactLocation = command.canViewExactLocation ?? false;

    // Chỉ người đã được duyệt nhận mới thấy toạ độ thật (đặc tả mục 1.3).
    // Nhiễu tất định theo globalId để pin không nhảy giữa các lần gọi — nếu
    // nhiễu ngẫu nhiên, gọi nhiều lần rồi lấy tâm cụm là ra vị trí thật.
    if (!canViewExactLocation)
      giftPost.location = applyGeoJitter(
        giftPost.location,
        giftPost.globalId,
        this.config.geo.jitterRadiusMeters,
      );

    return {
      giftPost,
      isLocationApproximate: !canViewExactLocation,
    };
  }
}
