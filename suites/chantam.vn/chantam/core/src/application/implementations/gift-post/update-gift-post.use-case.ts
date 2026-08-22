import {
  IUpdateGiftPostCommand,
  IUpdateGiftPostResult,
  IUpdateGiftPostUseCase,
} from '@/application/contracts/gift-post';
import { ClosedGiftPostStatuses } from '@/domain/consts';
import {
  GiftPostAlreadyClosedException,
  GiftPostNotFoundException,
} from '@/domain/exceptions';
import { IGiftPostRepository } from '@/domain/ports/repository';
import { definedProps } from '@chantam/service.common-lib/utils';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class UpdateGiftPostUseCase implements IUpdateGiftPostUseCase {
  public constructor(
    @Inject(IGiftPostRepository)
    private readonly giftPostRepository: IGiftPostRepository,
  ) {}

  public async handle(
    command: IUpdateGiftPostCommand,
  ): Promise<IUpdateGiftPostResult> {
    const { giftPostId, giftPost } = command;

    const existing = await this.giftPostRepository.findOneBy({
      globalId: giftPostId,
    });

    if (!existing || existing.deletedAt)
      throw new GiftPostNotFoundException(giftPostId);

    if (
      ClosedGiftPostStatuses.includes(
        existing.status as (typeof ClosedGiftPostStatuses)[number],
      )
    )
      throw new GiftPostAlreadyClosedException(giftPostId, existing.status);

    // `definedProps` loại các khoá `undefined` — nếu không, trải object sẽ ghi
    // đè giá trị đang có bằng `undefined` ở một số đường dẫn của TypeORM.
    await this.giftPostRepository.update(
      { globalId: giftPostId },
      definedProps(giftPost),
    );

    return {
      giftPost: await this.giftPostRepository.findOneByOrFail({
        globalId: giftPostId,
      }),
    };
  }
}
