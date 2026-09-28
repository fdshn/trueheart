import {
  IUpdatePostCommand,
  IUpdatePostResult,
  IUpdatePostUseCase,
} from '@/application/contracts/post';
import { assertEditablePost } from '@/domain/consts/post-edit-policy';
import {
  CategoryNotFoundException,
  PostHasLiveTransactionException,
  PostNotFoundException,
  PostSosNotAllowedException,
} from '@/domain/exceptions';
import {
  ICategoryRepository,
  IEntitlementRepository,
  IPostRepository,
} from '@/domain/ports/repository';
import {
  DeliveryMethods,
  GiftPostStatuses,
  PostTypes,
} from '@chantam.vn/chantam.core-lib/consts';
import {
  ForbiddenException,
  ValidationFailedException,
} from '@chantam/service.common-lib/exception';
import { definedProps } from '@chantam/service.common-lib/utils';
import { Inject, Injectable } from '@nestjs/common';

/**
 * Sửa bài của chính mình.
 *
 * CẤM khi bài đã có người nhận (`RESERVED`) hoặc đang bàn giao (`DELIVERING`).
 * Người nhận đồng ý "tủ lạnh Sanyo còn tốt" rồi mở lại thấy "quạt cũ" — và với
 * tin rao vặt thì sửa được cả giá sau khi đã chốt người. Không có bản ghi nào
 * nói nội dung từng khác, nên tranh chấp xong không ai dựng lại được.
 *
 * KHÔNG đụng tới `status`. Trước 26/09, sửa một bài `REJECTED` sẽ đẩy nó về
 * `PENDING_REVIEW` để duyệt lại — nhưng nay không còn duyệt trước, nên giữ nếp
 * đó là cho tác giả tự gỡ lệnh gỡ bài của Admin bằng cách sửa một dấu phẩy.
 * Bài đã bị gỡ chỉ Admin trả lại được.
 */
/** Trùng đúng danh sách mà gỡ bài và hậu kiểm của Admin đều từ chối chạm. */
const LiveTransactionStatuses: readonly string[] = [
  GiftPostStatuses.RESERVED,
  GiftPostStatuses.DELIVERING,
];

@Injectable()
export class UpdatePostUseCase implements IUpdatePostUseCase {
  public constructor(
    @Inject(IPostRepository)
    private readonly postRepository: IPostRepository,
    @Inject(ICategoryRepository)
    private readonly categoryRepository: ICategoryRepository,
    @Inject(IEntitlementRepository)
    private readonly entitlementRepository: IEntitlementRepository,
  ) {}

  public async handle(command: IUpdatePostCommand): Promise<IUpdatePostResult> {
    const post = await this.postRepository.findOneBy({
      globalId: command.postId,
    });
    if (!post || post.deletedAt)
      throw new PostNotFoundException(command.postId);
    if (post.authorId !== command.userId) throw new ForbiddenException();

    if (LiveTransactionStatuses.includes(post.status))
      throw new PostHasLiveTransactionException();
    assertEditablePost(post);

    const input = command.post;
    if (
      input.categoryId !== undefined &&
      input.categoryId !== post.categoryId
    ) {
      const category = await this.categoryRepository.findOneBy({
        globalId: input.categoryId,
      });
      if (!category || category.deletedAt || !category.isActive)
        throw new CategoryNotFoundException();
    }
    if (input.isSos === true && !post.isSos) {
      const capability = await this.entitlementRepository.getCapability(
        command.userId,
        'POST_SOS',
      );
      if (!capability?.allowed) throw new PostSosNotAllowedException();
    }

    const hasOfferDetails = command.post.estimatedValue !== undefined;
    if (hasOfferDetails && post.postType !== PostTypes.OFFER)
      throw new ValidationFailedException([
        'estimatedValue chỉ áp dụng cho bài OFFER',
      ]);
    if (
      input.condition !== undefined &&
      ![PostTypes.OFFER, PostTypes.CLASSIFIED].includes(post.postType)
    )
      throw new ValidationFailedException([
        'condition chỉ áp dụng cho bài OFFER và CLASSIFIED',
      ]);
    if (
      (input.price !== undefined || input.negotiable !== undefined) &&
      post.postType !== PostTypes.CLASSIFIED
    )
      throw new ValidationFailedException([
        'price và negotiable chỉ áp dụng cho bài CLASSIFIED',
      ]);

    const deliveryMethod =
      input.deliveryMethod === undefined
        ? post.deliveryMethod
        : input.deliveryMethod;
    if (
      input.shipPayer != null &&
      deliveryMethod !== DeliveryMethods.GIVER_SHIPS
    )
      throw new ValidationFailedException([
        'shipPayer chỉ khai được khi deliveryMethod là GIVER_SHIPS',
      ]);
    const allocated = post.totalQuantity - post.remainingQuantity;
    if (input.totalQuantity !== undefined && input.totalQuantity <= allocated)
      throw new ValidationFailedException([
        'Số lượng phải lớn hơn số lượng đã phân bổ; dùng Đóng tin để ngừng nhận thêm',
      ]);
    const hasDetails =
      hasOfferDetails ||
      input.condition !== undefined ||
      input.price !== undefined ||
      input.negotiable !== undefined;

    const updated = await this.postRepository.updateOwnedContent({
      postId: command.postId,
      authorId: command.userId,
      expectedUpdatedAt: post.updatedAt,
      changes: definedProps({
        categoryId: input.categoryId,
        totalQuantity: input.totalQuantity,
        remainingQuantity:
          input.totalQuantity === undefined
            ? undefined
            : input.totalQuantity - allocated,
        isSos: input.isSos,
        deliveryMethod: input.deliveryMethod,
        shipPayer:
          deliveryMethod !== DeliveryMethods.GIVER_SHIPS
            ? null
            : input.shipPayer,
        title: command.post.title,
        description: command.post.description,
        areaLabel: command.post.areaLabel,
        location: command.post.location
          ? {
              lat: command.post.location.lat,
              lng: command.post.location.lng,
            }
          : undefined,
        details: !hasDetails
          ? undefined
          : {
              ...post.details,
              ...definedProps({
                price: input.price,
                negotiable: input.negotiable,
              }),
              ...(command.post.condition === undefined
                ? {}
                : { condition: command.post.condition }),
              ...(command.post.estimatedValue === undefined
                ? {}
                : { estimatedValue: command.post.estimatedValue }),
            },
      }),
    });

    return { post: updated };
  }
}
