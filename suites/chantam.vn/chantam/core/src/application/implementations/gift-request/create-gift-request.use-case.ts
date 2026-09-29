import {
  ICreateGiftRequestCommand,
  ICreateGiftRequestResult,
  ICreateGiftRequestUseCase,
} from '@/application/contracts/gift-request';
import {
  CannotRequestOwnPostException,
  GiftRequestDuplicatedException,
  OpenRequestQuotaExceededException,
  PostNotAcceptingRequestsException,
  PostNotFoundException,
} from '@/domain/exceptions';
import {
  IEntitlementRepository,
  IGiftRequestRepository,
  IPostRepository,
} from '@/domain/ports/repository';
import { isUniqueViolation } from '@/infrastructure/repository/unique-violation';
import {
  GiftPostStatuses,
  GiftRequestStatuses,
  PostSelectionModes,
} from '@chantam.vn/chantam.core-lib/consts';
import { makeGlobalId } from '@chantam/service.common-lib/utils';
import { Inject, Injectable } from '@nestjs/common';
import { ProfileGate } from '../profile/profile-gate';
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
    const quota = openQuota?.limit ?? 0;
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

    if (post.status !== GiftPostStatuses.PUBLISHED) {
      throw new PostNotAcceptingRequestsException();
    }

    // Vòng quét hết hạn chạy theo lịch, nên giữa lúc bài quá hạn và lúc nó
    // được đánh EXPIRED có một khoảng bài vẫn mang trạng thái PUBLISHED. Đọc
    // thẳng `expiresAt` ở đây để khoảng đó không thành cửa sổ xin nhận.
    if (post.expiresAt && post.expiresAt.getTime() <= Date.now()) {
      throw new PostNotAcceptingRequestsException();
    }

    // Kiểm tra đây có phải request ĐẦU TIÊN không.
    // Nếu có, hành động tuỳ selectionMode:
    // - INSTANT: chấp nhận ngay người này, đóng bài (chuyển RESERVED).
    // - OPTIMAL/EXTENDED: ghi selection_deadline = NOW() + 7d / 30d.
    const activeRequestCount =
      await this.giftRequestRepository.countActiveByPostIds([command.postId]);
    const isFirstRequest = (activeRequestCount.get(command.postId) ?? 0) === 0;

    if (post.postType === 'OFFER' && isFirstRequest) {
      if (post.selectionMode !== PostSelectionModes.INSTANT) {
        const days =
          post.selectionMode === PostSelectionModes.EXTENDED ? 30 : 7;
        post.selectionDeadline = new Date(
          Date.now() + days * 24 * 60 * 60 * 1000,
        );
        await this.postRepository.save(post);
      }
    }

    const existing = await this.giftRequestRepository.findByPostAndRequester(
      command.postId,
      command.requesterId,
    );

    if (existing) {
      // STANDBY cũng là yêu cầu ĐANG MỞ: người đó vẫn trong hàng đợi và được
      // xét tiếp nếu lượt trao hiện tại bị huỷ (F33). Cho gửi lại sẽ đi vào
      // nhánh dưới và reset `queueJoinedAt`, tức đẩy họ xuống cuối hàng — mất
      // chỗ vì gửi thêm một lần là một hình phạt không ai nói trước.
      if (
        existing.status === GiftRequestStatuses.PENDING ||
        existing.status === GiftRequestStatuses.STANDBY ||
        existing.status === GiftRequestStatuses.ACCEPTED
      ) {
        throw new GiftRequestDuplicatedException();
      }

      existing.message = command.message;
      existing.status = GiftRequestStatuses.PENDING;
      existing.queueJoinedAt = new Date();
      existing.withdrawnAt = null;

      try {
        await this.giftRequestRepository.save(existing);
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new GiftRequestDuplicatedException();
        }
        throw error;
      }
      // Gửi lại sau khi đã rút vẫn là một yêu cầu MỚI với chủ bài: bản ghi
      // được dùng lại chỉ là chi tiết lưu trữ, còn phía họ thì vừa có người
      // quay lại xin. Khoá chống trùng theo id yêu cầu nên không báo hai lần
      // cho cùng một lần gửi.
      await this.notifier.announceCreated({
        ownerId: post.authorId,
        requesterId: command.requesterId,
        postId: command.postId,
        postTitle: post.title,
        requestId: existing.globalId,
      });

      return { request: toGiftRequestDto(existing) };
    }

    const globalId = makeGlobalId(
      `/gift-requests/${command.postId}/${command.requesterId}`,
    );

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
      post.postType === 'OFFER' &&
      post.selectionMode === PostSelectionModes.INSTANT &&
      isFirstRequest
    ) {
      const transactionId = makeGlobalId(
        `/transactions/${command.postId}/${command.requesterId}/${Date.now()}`,
      );
      try {
        await this.giftRequestRepository.acceptRequest({
          requestId: globalId,
          postId: command.postId,
          giverId: post.authorId,
          transactionId,
        });
        instantAccepted = true;
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
