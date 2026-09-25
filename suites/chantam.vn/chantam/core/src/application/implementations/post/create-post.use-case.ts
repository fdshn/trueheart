import {
  ICreatePostCommand,
  ICreatePostResult,
  ICreatePostUseCase,
} from '@/application/contracts/post';
import {
  CategoryNotFoundException,
  PostQuotaExceededException,
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
  PostSelectionModes,
  PostTypes,
} from '@chantam.vn/chantam.core-lib/consts';
import { postExpiryDate } from '@chantam.vn/chantam.core-lib/models';
import { ValidationFailedException } from '@chantam/service.common-lib/exception';
import { makeGlobalId, slugify } from '@chantam/service.common-lib/utils';
import { Inject, Injectable } from '@nestjs/common';
import { ProfileGate } from '../profile/profile-gate';

/**
 * Phần nội dung riêng của từng loại bài, lưu vào `details` JSONB.
 *
 * Mỗi loại chỉ ghi đúng trường của mình. Gom hết vào một cục là sau này đọc
 * `details.price` của bài tặng ra `undefined` mà không biết là do loại bài
 * không có giá hay do dữ liệu hỏng.
 */
function buildPostDetails(
  post: ICreatePostCommand['post'],
): Record<string, unknown> {
  if (post.postType === PostTypes.OFFER)
    return { condition: post.condition, estimatedValue: post.estimatedValue };

  if (post.postType === PostTypes.CLASSIFIED)
    return {
      price: post.price,
      condition: post.condition,
      // Mặc định là không thương lượng: im lặng mà hiểu thành "có thương lượng"
      // là hứa hộ người bán một điều họ không nói.
      negotiable: post.negotiable ?? false,
    };

  return {};
}

@Injectable()
export class CreatePostUseCase implements ICreatePostUseCase {
  public constructor(
    @Inject(IPostRepository)
    private readonly postRepository: IPostRepository,
    @Inject(ICategoryRepository)
    private readonly categoryRepository: ICategoryRepository,
    @Inject(IEntitlementRepository)
    private readonly entitlementRepository: IEntitlementRepository,
    private readonly profileGate: ProfileGate,
  ) {}

  public async handle(command: ICreatePostCommand): Promise<ICreatePostResult> {
    await this.profileGate.assertOnboarded(command.userId);

    const { post } = command;
    const category = await this.categoryRepository.findOneBy({
      globalId: post.categoryId,
    });
    if (!category || category.deletedAt || !category.isActive)
      throw new CategoryNotFoundException();

    const createdAt = new Date();
    const globalId = makeGlobalId(
      `/posts/${command.userId}/${slugify(post.title)}/${createdAt.toISOString()}`,
    );
    if (
      post.postType !== PostTypes.OFFER &&
      post.postType !== PostTypes.CLASSIFIED &&
      post.condition !== undefined
    )
      throw new ValidationFailedException([
        'condition chỉ áp dụng cho bài OFFER và CLASSIFIED',
      ]);

    if (post.postType !== PostTypes.OFFER && post.estimatedValue !== undefined)
      throw new ValidationFailedException([
        'estimatedValue chỉ áp dụng cho bài OFFER',
      ]);

    // Giá và cờ thương lượng chỉ có nghĩa với tin rao bán. Lọt sang bài tặng
    // là biến món quà thành món hàng ngay trên giao diện.
    if (
      post.postType !== PostTypes.CLASSIFIED &&
      (post.price !== undefined || post.negotiable !== undefined)
    )
      throw new ValidationFailedException([
        'price và negotiable chỉ áp dụng cho bài CLASSIFIED',
      ]);

    // Bắt buộc ở tầng use case chứ không chỉ ở DTO: tin rao bán thiếu giá thì
    // không sắp xếp, không lọc khoảng giá, và người mua phải hỏi mới biết.
    if (post.postType === PostTypes.CLASSIFIED) {
      if (post.price === undefined)
        throw new ValidationFailedException(['bài CLASSIFIED phải có price']);
      if (post.condition === undefined)
        throw new ValidationFailedException([
          'bài CLASSIFIED phải có condition',
        ]);
    }

    // SOS là quyền theo Rank, không phải một ô tuỳ ý trên form. Chỉ kiểm khi
    // người dùng thật sự bật nó — bài thường không nên tốn một truy vấn
    // entitlement chỉ để biết mình không cần quyền gì.
    const isSos = post.isSos ?? false;
    if (isSos) {
      const sosCapability = await this.entitlementRepository.getCapability(
        command.userId,
        'POST_SOS',
      );
      if (!sosCapability?.allowed) throw new PostSosNotAllowedException();
    }

    // Tự đến lấy thì không có phí ship để mà trả. Ràng buộc này cũng có ở
    // database; chặn ở đây để trả 400 nói đúng chuyện thay vì 500 từ Postgres.
    if (
      post.shipPayer !== undefined &&
      post.deliveryMethod !== DeliveryMethods.GIVER_SHIPS
    )
      throw new ValidationFailedException([
        'shipPayer chỉ khai được khi deliveryMethod là GIVER_SHIPS',
      ]);

    // selectionMode chỉ có ý nghĩa với bài OFFER. Bài khác truyền lên thì báo
    // lỗi ngay tại use case — DTO optional không che được sai ngữ nghĩa.
    if (post.selectionMode !== undefined && post.postType !== PostTypes.OFFER) {
      throw new ValidationFailedException([
        'selectionMode chỉ áp dụng cho bài OFFER',
      ]);
    }
    const selectionMode =
      post.postType === PostTypes.OFFER
        ? (post.selectionMode ?? PostSelectionModes.OPTIMAL)
        : PostSelectionModes.OPTIMAL;

    const totalQuantity =
      post.postType === PostTypes.OFFER ? (post.totalQuantity ?? 1) : 1;
    const capability = await this.entitlementRepository.getCapability(
      command.userId,
      post.postType === PostTypes.WANTED ? 'POST_WANTED' : 'POST_OFFER',
    );
    const quota = capability?.limit ?? 0;
    if (!capability?.allowed) throw new PostQuotaExceededException(quota);
    const created = await this.postRepository.createPostWithinQuota(
      command.userId,
      quota,
      {
        globalId,
        postType: post.postType,
        authorId: command.userId,
        categoryId: category.globalId,
        title: post.title,
        description: post.description,
        location: post.location,
        areaLabel: post.areaLabel,
        // Bài lên thẳng, KHÔNG chờ duyệt (chốt 26/09). Đồng hồ ba tháng vì thế
        // cũng bắt đầu ngay tại đây, không phải ở tay người kiểm duyệt.
        status: GiftPostStatuses.PUBLISHED,
        totalQuantity,
        remainingQuantity: totalQuantity,
        details: buildPostDetails(post),
        expiresAt: postExpiryDate(new Date()),
        renewedCount: 0,
        reactionCount: 0,
        commentCount: 0,
        shareCount: 0,
        isSos,
        deliveryMethod: post.deliveryMethod ?? null,
        shipPayer: post.shipPayer ?? null,
        charityTransferStatus: null,
        charityTransferRequestedAt: null,
        charityTransferNote: null,
        selectionMode,
        selectionDeadline: null,
        likeCount: 0,
        deletedAt: null,
      },
    );

    if (!created) throw new PostQuotaExceededException(quota);

    return {
      post: await this.postRepository.findOneByOrFail({ globalId }),
    };
  }
}
