import {
  IGetGiftPostCommand,
  IGetGiftPostResult,
  IGetGiftPostUseCase,
} from '@/application/contracts/gift-post';
import { GiftPostNotFoundException } from '@/domain/exceptions';
import { IConfig } from '@/domain/ports/config';
import { IGiftPostRepository } from '@/domain/ports/repository';
import { applyGeoJitter } from '@chantam/service.persistency-lib/geo';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class GetGiftPostUseCase implements IGetGiftPostUseCase {
  public constructor(
    @Inject(IGiftPostRepository)
    private readonly giftPostRepository: IGiftPostRepository,
    @Inject(IConfig)
    private readonly config: IConfig,
  ) {}

  public async handle(
    command: IGetGiftPostCommand,
  ): Promise<IGetGiftPostResult> {
    const existing = await this.giftPostRepository.findOneBy({
      globalId: command.giftPostId,
    });

    if (!existing || existing.deletedAt)
      throw new GiftPostNotFoundException(command.giftPostId);

    const canViewExactLocation = command.canViewExactLocation ?? false;

    // Chỉ người đã được duyệt nhận mới thấy toạ độ thật (đặc tả mục 1.3).
    // Nhiễu tất định theo globalId để pin không nhảy giữa các lần gọi — nếu
    // nhiễu ngẫu nhiên, gọi nhiều lần rồi lấy tâm cụm là ra vị trí thật.
    if (!canViewExactLocation)
      existing.location = applyGeoJitter(
        existing.location,
        existing.globalId,
        this.config.geo.jitterRadiusMeters,
      );

    return {
      giftPost: existing,
      isLocationApproximate: !canViewExactLocation,
    };
  }
}
