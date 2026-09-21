import {
  ICreatePostCommand,
  ICreatePostResult,
  ICreatePostUseCase,
} from '@/application/contracts/post';
import {
  CategoryNotFoundException,
  OnboardingIncompleteException,
  PostQuotaExceededException,
  PostSosNotAllowedException,
  ProfileIncompleteException,
  UserNotFoundException,
} from '@/domain/exceptions';
import {
  ICategoryRepository,
  IEntitlementRepository,
  IPostRepository,
  IUserRepository,
} from '@/domain/ports/repository';
import {
  GiftPostStatuses,
  PostTypes,
  UserRanks,
} from '@chantam.vn/chantam.core-lib/consts';
import { isProfileComplete } from '@chantam.vn/chantam.core-lib/models';
import { ValidationFailedException } from '@chantam/service.common-lib/exception';
import { makeGlobalId, slugify } from '@chantam/service.common-lib/utils';
import { Inject, Injectable } from '@nestjs/common';

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
    @Inject(IUserRepository)
    private readonly userRepository: IUserRepository,
    @Inject(IEntitlementRepository)
    private readonly entitlementRepository: IEntitlementRepository,
  ) {}

  public async handle(command: ICreatePostCommand): Promise<ICreatePostResult> {
    const user = await this.userRepository.findOneBy({
      globalId: command.userId,
    });
    if (!user || user.deletedAt) throw new UserNotFoundException();

    if (!isProfileComplete(user)) {
      const missing = [
        !user.fullName && 'Họ tên',
        !user.avatarUrl && 'Avatar',
        !user.phone && 'SĐT',
        !user.email && 'Email',
      ].filter(Boolean) as string[];
      throw new ProfileIncompleteException(missing);
    }
    if (user.rank === UserRanks.VIEWER)
      throw new OnboardingIncompleteException();

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
        status: GiftPostStatuses.PENDING_REVIEW,
        totalQuantity,
        remainingQuantity: totalQuantity,
        details: buildPostDetails(post),
        expiresAt: null,
        renewedCount: 0,
        isSos,
        charityTransferStatus: null,
        charityTransferRequestedAt: null,
        charityTransferNote: null,
        deletedAt: null,
      },
    );

    if (!created) throw new PostQuotaExceededException(quota);

    return {
      post: await this.postRepository.findOneByOrFail({ globalId }),
    };
  }
}
