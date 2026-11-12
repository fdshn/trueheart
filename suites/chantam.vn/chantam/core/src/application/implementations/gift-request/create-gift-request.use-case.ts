import {
  ICreateGiftRequestCommand,
  ICreateGiftRequestResult,
  ICreateGiftRequestUseCase,
} from '@/application/contracts/gift-request';
import {
  CannotRequestOwnPostException,
  GiftRequestDuplicatedException,
  GiftRequestQuantityExceedsStockException,
  OpenRequestQuotaExceededException,
  PostNotAcceptingRequestsException,
  PostNotFoundException,
} from '@/domain/exceptions';
import {
  IAdminConfigRepository,
  IEntitlementRepository,
  IGiftRequestRepository,
  IPostRepository,
} from '@/domain/ports/repository';
import { isUniqueViolation } from '@/infrastructure/repository/unique-violation';
import {
  GiftPostStatuses,
  GiftRequestStatuses,
  PostSelectionModes,
  PostTypes,
} from '@chantam.vn/chantam.core-lib/consts';
import {
  resolveQuotaLimit,
  usesSelectionLifecycle,
} from '@chantam.vn/chantam.core-lib/models';
import { makeGlobalId } from '@chantam/service.common-lib/utils';
import { Inject, Injectable, Optional } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ProfileGate } from '../profile/profile-gate';
import { assertClassifiedTransactionsAllowed } from '../shared/classified-guard';
import { toGiftRequestDto } from './gift-request.mapper';
import { RequestLifecycleNotifier } from './request-lifecycle.notifier';

@Injectable()
export class CreateGiftRequestUseCase implements ICreateGiftRequestUseCase {
  public constructor(
    @Inject(IPostRepository)
    private readonly postRepository: IPostRepository,
    @Inject(IGiftRequestRepository)
    private readonly giftRequestRepository: IGiftRequestRepository,
    @Inject(IEntitlementRepository)
    private readonly entitlements: IEntitlementRepository,
    private readonly profileGate: ProfileGate,
    private readonly notifier: RequestLifecycleNotifier,
    @Optional()
    @Inject(IAdminConfigRepository)
    private readonly adminConfig?: IAdminConfigRepository,
  ) {}

  public async handle(
    command: ICreateGiftRequestCommand,
  ): Promise<ICreateGiftRequestResult> {
    // Cổng hồ sơ (F07) — chốt 2026-09-24 áp cho cả xin nhận, không chỉ đăng bài.
    // Người tặng phải liên hệ được với người xin; hồ sơ thiếu SĐT hoặc họ tên
    // biến mỗi lượt trao thành một cuộc hẹn với người vô danh.
    await this.profileGate.assertComplete(command.requesterId);

    // Giới hạn số yêu cầu ĐANG MỞ. Cần từ khi mỗi yêu cầu đầu tiên mở một đồng
    // hồ 7 ngày (F75): xin bừa 100 bài rồi bỏ hết nay là khoá 100 bài trong một
    // tuần, kể cả khi người xin không bao giờ quay lại.
    //
    // Kiểm TRƯỚC khi đọc bài: một người đã đầy quota thì không cần biết bài đó
    // còn mở hay không.
    const openQuota = await this.entitlements.getCapability(
      command.requesterId,
      'OPEN_REQUEST_QUOTA',
    );
    const openRequests = await this.giftRequestRepository.countOpenByRequester(
      command.requesterId,
    );
    const quota = resolveQuotaLimit(openQuota?.limit ?? null);
    if (!openQuota?.allowed || openRequests >= quota)
      throw new OpenRequestQuotaExceededException(openRequests, quota);

    const post = await this.postRepository.findOneBy({
      globalId: command.postId,
    });

    if (!post || post.deletedAt)
      throw new PostNotFoundException(command.postId);

    if (post.authorId === command.requesterId) {
      throw new CannotRequestOwnPostException();
    }

    // Rao vặt: liên hệ qua `POST /chat/direct-post/rooms`, không xin nhận (PR #46 §8).
    await assertClassifiedTransactionsAllowed(post, this.adminConfig);

    if (post.status !== GiftPostStatuses.PUBLISHED) {
      throw new PostNotAcceptingRequestsException();
    }

    // Vòng quét hết hạn chạy theo lịch, nên giữa lúc bài quá hạn và lúc nó
    // được đánh EXPIRED có một khoảng bài vẫn mang trạng thái PUBLISHED. Đọc
    // thẳng `expiresAt` ở đây để khoảng đó không thành cửa sổ xin nhận.
    if (post.expiresAt && post.expiresAt.getTime() <= Date.now()) {
      throw new PostNotAcceptingRequestsException();
    }

    // `isFirstRequest` vẫn cần cho đường `INSTANT` bên dưới — nó là điều kiện
    // "người đầu tiên", không phải điều kiện của đồng hồ.
    const activeRequestCount =
      await this.giftRequestRepository.countActiveByPostIds([command.postId]);
    const isFirstRequest = (activeRequestCount.get(command.postId) ?? 0) === 0;

    // Phản hồi đầu tiên KHÔNG còn khởi động đồng hồ nào (CHỐT-10).
    //
    // Tới 06/10 chỗ này ghi `selection_deadline = NOW() + 7d/30d` khi thấy phản
    // hồi đầu tiên. Hệ quả: bài không ai xin thì cột đó là `null` vĩnh viễn — nó
    // không bao giờ tới hạn, không bao giờ được auto-select xét, và chỉ chết ở
    // mốc ba tháng. Nay hạn được đặt ngay lúc đăng, nên đoạn này thành thừa.
    //
    // Và nó không chỉ thừa mà còn SAI nếu giữ lại: nó sẽ dời hạn ra xa mỗi khi có
    // phản hồi đầu tiên, tức một bài đăng hôm nay mà tới ngày thứ sáu mới có
    // người xin sẽ được xét tới ngày thứ mười ba.

    // Số món xin: không vượt số còn lại LÚC GỬI. Duyệt thì kiểm lại dưới khoá dòng — đây chỉ là
    // chặn sớm để người dùng biết ngay, không phải chốt chặn cuối.
    const requestedQuantity = command.requestedQuantity ?? 1;
    if (requestedQuantity > post.remainingQuantity)
      throw new GiftRequestQuantityExceedsStockException(
        post.remainingQuantity,
      );

    // Mỗi lần gửi là MỘT request mới — rút / bị từ chối / lượt trước đã xong rồi gửi lại không
    // ghi đè dòng cũ, nên lịch sử còn nguyên và process hiện tại không đọc nhầm trạng thái cũ.
    // Chỉ chặn hai trường hợp:
    // - đang có request CHỜ (PENDING / STANDBY) — STANDBY vẫn là đang mở: người đó còn trong hàng
    //   và được xét tiếp (F33); gửi lại sẽ làm họ mất chỗ. Database cũng chặn
    //   (`UQ_gift_requests_post_requester_open`) cho ca hai lần gửi đua nhau.
    // - đang có lượt trao CÒN CHẠY trên bài — xong hoặc huỷ lượt đó trước.
    const latest = await this.giftRequestRepository.findByPostAndRequester(
      command.postId,
      command.requesterId,
    );
    if (
      latest &&
      (latest.status === GiftRequestStatuses.PENDING ||
        latest.status === GiftRequestStatuses.STANDBY)
    )
      throw new GiftRequestDuplicatedException();
    if (
      await this.giftRequestRepository.hasLiveTransactionOnPost(
        command.postId,
        command.requesterId,
      )
    )
      throw new GiftRequestDuplicatedException();

    // Id ngẫu nhiên: id dựng từ (bài, người xin) như trước sẽ trùng ở lần gửi thứ hai.
    const globalId = randomUUID();

    // `insert()` chứ không phải `save()`: `save()` phải tự đoán tạo mới hay cập
    // nhật nên phát sinh thêm một câu SELECT, và đường này đã biết chắc là tạo
    // mới.
    try {
      await this.giftRequestRepository.insert({
        globalId,
        postId: command.postId,
        requesterId: command.requesterId,
        message: command.message,
        status: GiftRequestStatuses.PENDING,
        queueJoinedAt: new Date(),
        offeringPostId: command.offeringPostId ?? null,
        requestedQuantity,
        statusReason: null,
      } as never);
    } catch (error) {
      // Hai người xin cùng lúc thì cả hai đều không thấy bản ghi cũ và cùng
      // insert; ràng buộc duy nhất ở database là nơi quyết định, không phải
      // lần đọc phía trên.
      if (isUniqueViolation(error)) {
        throw new GiftRequestDuplicatedException();
      }
      throw error;
    }

    const created = await this.giftRequestRepository.findOneByOrFail({
      globalId,
    } as never);

    // INSTANT mode: chấp nhận ngay người đầu tiên — không cần chờ countdown.
    // Chạy sau khi insert thành công. Nếu acceptRequest fail (deadlock, network),
    // request vẫn tồn tại ở trạng thái PENDING — cron hoặc admin sẽ xử lý lại.
    // Không throw để tránh roll back việc tạo request.
    let instantAccepted = false;
    if (
      // `WANTED` vào đây từ 11/10. Với bài Muốn Nhận, "chốt ngay người đầu tiên"
      // nghĩa là nhận ngay lời tặng đầu tiên — và vai do `acceptRequest` phân
      // giải, nên không cần nhánh riêng cho loại bài ở đây.
      usesSelectionLifecycle(post.postType as PostTypes) &&
      post.selectionMode === PostSelectionModes.INSTANT &&
      isFirstRequest
    ) {
      const transactionId = makeGlobalId(
        `/transactions/${command.postId}/${command.requesterId}/${Date.now()}`,
      );
      try {
        const instant = await this.giftRequestRepository.acceptRequest({
          requestId: globalId,
          postId: command.postId,
          actorUserId: post.authorId,
          transactionId,
        });
        instantAccepted = true;
        await this.notifier.announceRebalanced(instant?.rebalanced ?? []);
      } catch (acceptError) {
        // Log để monitoring phát hiện; request vẫn tồn tại ở PENDING.
        // Cron timeout hoặc admin có thể trigger lại accept thủ công.
        console.error(
          `[INSTANT-ACCEPT] acceptRequest failed for request=${globalId} post=${command.postId}:`,
          acceptError,
        );
      }
    }

    // Báo SAU khi đã ghi xong, và sau cả nhánh INSTANT: ở chế độ đó người đầu
    // tiên được chốt luôn, nên chủ bài nhận thông báo "đã có người nhận" từ
    // `AcceptedRequestNotifier` chứ không cần thêm một thông báo "có người xin".
    if (!instantAccepted)
      await this.notifier.announceCreated({
        ownerId: post.authorId,
        requesterId: command.requesterId,
        postId: command.postId,
        postTitle: post.title,
        requestId: globalId,
      });

    return {
      request: toGiftRequestDto(created),
    };
  }
}
