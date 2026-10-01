import {
  ICreateGiftRequestUseCase,
  IOfferGiftCommand,
  IOfferGiftResult,
  IOfferGiftUseCase,
} from '@/application/contracts/gift-request';
import {
  OfferGiftSourceInvalidException,
  OfferGiftTargetNotWantedException,
  PostNotFoundException,
} from '@/domain/exceptions';
import { IPostRepository } from '@/domain/ports/repository';
import {
  PostTypes,
  PubliclyVisibleGiftPostStatuses,
} from '@chantam.vn/chantam.core-lib/consts';
import { Inject, Injectable } from '@nestjs/common';

/**
 * Giver chủ động tặng cho một bài Muốn Nhận (SRS §19).
 *
 * **Vì sao nó mỏng.** Về dữ liệu, một lời tặng CHÍNH LÀ một hàng `gift_requests`
 * trên bài Muốn Nhận: chủ bài vẫn chọn trong hàng đợi, vẫn có `queue_joined_at`,
 * vẫn đi qua đúng đường duyệt và đúng phép đếm hạn mức. Dựng một bảng riêng cho
 * nó là nhân đôi toàn bộ vòng đời đó rồi phải nhớ sửa cả hai chỗ mãi mãi.
 *
 * Nên use case này chỉ làm phần mà `CreateGiftRequestUseCase` không thể biết —
 * đích phải là bài Muốn Nhận, và bài mang ra tặng phải dùng được — rồi giao lại.
 * Hạn mức yêu cầu đang mở, cổng hồ sơ (F07), chống trùng và thông báo vẫn nằm
 * đúng một chỗ.
 */
@Injectable()
export class OfferGiftUseCase implements IOfferGiftUseCase {
  public constructor(
    @Inject(IPostRepository)
    private readonly postRepository: IPostRepository,
    @Inject(ICreateGiftRequestUseCase)
    private readonly createGiftRequest: ICreateGiftRequestUseCase,
  ) {}

  public async handle(command: IOfferGiftCommand): Promise<IOfferGiftResult> {
    const target = await this.postRepository.findOneBy({
      globalId: command.wantedPostId,
    });

    if (!target || target.deletedAt)
      throw new PostNotFoundException(command.wantedPostId);

    // Chỉ kiểm LOẠI bài ở đây. Bài đóng, bài hết hạn, bài của chính mình đều để
    // `CreateGiftRequestUseCase` xử — nó đã có đúng những phép kiểm đó cùng
    // thông điệp lỗi tương ứng, và chép lại là mở đường cho hai bên lệch nhau.
    if (target.postType !== PostTypes.WANTED)
      throw new OfferGiftTargetNotWantedException();

    if (command.offeringPostId !== undefined)
      await this.assertOfferingPostUsable(
        command.offeringPostId,
        command.offererId,
      );

    return this.createGiftRequest.handle({
      postId: command.wantedPostId,
      requesterId: command.offererId,
      message: command.message,
      offeringPostId: command.offeringPostId ?? null,
    });
  }

  /**
   * Bài mang ra tặng phải là bài Muốn Tặng của CHÍNH người gửi và đang công khai.
   *
   * Cả ba điều kiện trả về cùng một lỗi: người dùng chọn bài từ danh sách bài của
   * họ, nên sai ở đây là sai lựa chọn chứ không phải thiếu quyền — và tách thành
   * ba mã lỗi sẽ nói cho người gọi biết bài nào tồn tại, bài nào không, kể cả
   * bài của người khác.
   */
  private async assertOfferingPostUsable(
    offeringPostId: string,
    offererId: string,
  ): Promise<void> {
    const offering = await this.postRepository.findOneBy({
      globalId: offeringPostId,
    });

    if (
      !offering ||
      offering.deletedAt ||
      offering.authorId !== offererId ||
      offering.postType !== PostTypes.OFFER ||
      !PubliclyVisibleGiftPostStatuses.includes(offering.status as never)
    )
      throw new OfferGiftSourceInvalidException();
  }
}
