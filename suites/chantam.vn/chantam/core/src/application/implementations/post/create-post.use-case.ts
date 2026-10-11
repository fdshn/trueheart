import {
  ICreatePostCommand,
  ICreatePostResult,
  ICreatePostUseCase,
} from '@/application/contracts/post';
import {
  assertCategoryAssignable,
  assertPostTypeAllowed,
} from '@/application/implementations/category/category-guards';
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
import {
  classifiedPricingGaps,
  postExpiryDateFor,
  resolveQuotaLimit,
  selectionDeadlineFrom,
  usesSelectionLifecycle,
} from '@chantam.vn/chantam.core-lib/models';
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
      // `null` khi nguời bán không khai giá thị trường. Ghi khóa với giá trị `null` thay vì
      // bỏ hẳn khóa: `details` là `jsonb` không có lược đồ, nên một khóa VẮNG MẶT
      // không nói được là "chưa khai" hay "phiên bản cũ chưa có trường này".
      marketPrice: post.marketPrice ?? null,
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

    // Tổ tiên cũng phải đang bật. Thiếu vế này thì một danh mục active dưới một cha
    // đã tắt vẫn gán được qua API — dù nó vô hình trên cây nên người dùng không
    // chọn được nó ở giao diện nào.
    await assertCategoryAssignable(this.categoryRepository, post.categoryId);

    // `postTypes` của danh mục nay được KIỂM, không chỉ dùng để tỉa cây hiển thị.
    // Trước 30/09 nó xuất hiện đúng hai chỗ — mapper trả ra và `pruneByPostType` —
    // nên server nói với client "danh mục này chỉ nhận OFFER", client tuân, còn một
    // lượt gọi API trực tiếp thì đặt WANTED vào đó được. Đo được: bài WANTED vào
    // danh mục khai `{OFFER}` tạo thành công.
    assertPostTypeAllowed(category, post.postType);

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
      (post.price !== undefined ||
        post.negotiable !== undefined ||
        post.marketPrice !== undefined)
    )
      throw new ValidationFailedException([
        'price, marketPrice và negotiable chỉ áp dụng cho bài CLASSIFIED',
      ]);

    // Bắt buộc ở tầng use case chứ không chỉ ở DTO: tin rao bán thiếu giá thì
    // không sắp xếp, không lọc khoảng giá, và người mua phải hỏi mới biết.
    if (post.postType === PostTypes.CLASSIFIED) {
      if (post.price === undefined)
        throw new ValidationFailedException(['bài CLASSIFIED phải có price']);
      // `marketPrice` thì KHÔNG bắt buộc, và cũng không bắt phải lẻn hơn `price` —
      // CHỐT-05 nói rõ hệ thống không ép mức giảm tối thiểu nào. Xem docblock
      // `models/classified.ts`.
      const pricingGaps = classifiedPricingGaps({
        price: post.price,
        marketPrice: post.marketPrice,
      });
      if (pricingGaps.length > 0)
        throw new ValidationFailedException(pricingGaps);
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

    // `selectionMode` vẫn chỉ áp cho `OFFER`. CHỐT-10 muốn cả `WANTED`, nhưng
    // nhận cờ đó cho `WANTED` bây giờ là tạo một cái núm KHÔNG LÀM GÌ — hoặc tệ
    // hơn, làm sai: xem `usesSelectionLifecycle`. Loại bài khác truyền lên thì
    // báo lỗi ngay tại use case, DTO optional không che được sai ngữ nghĩa.
    if (
      post.selectionMode !== undefined &&
      !usesSelectionLifecycle(post.postType)
    ) {
      throw new ValidationFailedException([
        'selectionMode chỉ áp dụng cho bài OFFER',
      ]);
    }
    const selectionMode = usesSelectionLifecycle(post.postType)
      ? (post.selectionMode ?? PostSelectionModes.OPTIMAL)
      : PostSelectionModes.OPTIMAL;

    const totalQuantity = [
      PostTypes.OFFER,
      PostTypes.WANTED,
      PostTypes.CLASSIFIED,
    ].includes(post.postType)
      ? (post.totalQuantity ?? 1)
      : 1;
    // MỘT hạn mức cho mọi loại bài. Trước 26/09 có hai capability `POST_OFFER`
    // và `POST_WANTED`, nhưng phép đếm bên dưới là mọi bài đang mở bất kể loại
    // — nên hai con số đó là hai cái thước đo cùng một rổ, và đặt lệch nhau cho
    // ra hành vi không giải thích được.
    const capability = await this.entitlementRepository.getCapability(
      command.userId,
      'POST_OPEN',
    );
    // `resolveQuotaLimit` chứ không `?? 0` tại chỗ: lựa chọn fail-closed cho ô trống
    // giờ ở một hàm có tên, vì nó ngược với nghĩa mà người đọc DTO dễ đoán.
    const quota = resolveQuotaLimit(capability?.limit ?? null);
    if (!capability?.allowed) throw new PostQuotaExceededException(quota);
    // MỘT mốc dùng cho cả hai hạn. Gọi `new Date()` hai lần thì hai cái mốc lệch
    // nhau vài milli giây — vô hại hôm nay, nhưng nó làm `expires_at` không còn
    // đúng bằng `selection_deadline + 30 ngày`, và phép kiểm nào so hai cột đó sẽ
    // đỏ theo kiểu không lặp lại được.
    const publishedAt = new Date();
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
        // Bài lên thẳng, KHÔNG chờ duyệt (chốt 26/09). Đồng hồ vì thế cũng bắt
        // đầu ngay tại đây, không phải ở tay người kiểm duyệt — nên `publishedAt`
        // dưới đây ĐÚNG là mốc đăng mà CHỐT-10 đếm từ, và không cần một cột
        // `published_at` riêng để nhớ lại nó.
        status: GiftPostStatuses.PUBLISHED,
        totalQuantity,
        remainingQuantity: totalQuantity,
        details: buildPostDetails(post),
        // `OFFER`/`WANTED`: 37 ngày (7 xét + 30 mở rộng, CHỐT-10). Loại khác giữ
        // 3 tháng của CHỐT-05/07.
        expiresAt: postExpiryDateFor(post.postType, publishedAt),
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
        // Đặt NGAY tại đây, cho cả `INSTANT`. Tới 06/10 cột này là `null` cho tới
        // khi có phản hồi đầu tiên — nên một bài không ai xin thì đồng hồ không
        // bao giờ chạy, không bao giờ vào giai đoạn mở rộng, và chỉ chết ở mốc ba
        // tháng. Đó đúng là thứ CHỐT-10 sửa.
        selectionDeadline: usesSelectionLifecycle(post.postType)
          ? selectionDeadlineFrom(publishedAt)
          : null,
        deletedAt: null,
      },
    );

    if (!created) throw new PostQuotaExceededException(quota);

    return {
      post: await this.postRepository.findOneByOrFail({ globalId }),
    };
  }
}
