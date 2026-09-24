import {
  ICreateGiftRequestCommand,
  ICreateGiftRequestResult,
  ICreateGiftRequestUseCase,
} from '@/application/contracts/gift-request';
import {
  CannotRequestOwnPostException,
  GiftRequestDuplicatedException,
  PostNotAcceptingRequestsException,
  PostNotFoundException,
} from '@/domain/exceptions';
import {
  IGiftRequestRepository,
  IPostRepository,
} from '@/domain/ports/repository';
import {
  GiftPostStatuses,
  GiftRequestStatuses,
  PostSelectionModes,
} from '@chantam.vn/chantam.core-lib/consts';
import { makeGlobalId } from '@chantam/service.common-lib/utils';
import { Inject, Injectable } from '@nestjs/common';
import { ProfileGate } from '../profile/profile-gate';
import { toGiftRequestDto } from './gift-request.mapper';

function isUniqueViolation(error: unknown): boolean {
  const err = error as { code?: string; driverError?: { code?: string } };
  return err?.code === '23505' || err?.driverError?.code === '23505';
}

@Injectable()
export class CreateGiftRequestUseCase implements ICreateGiftRequestUseCase {
  public constructor(
    @Inject(IPostRepository)
    private readonly postRepository: IPostRepository,
    @Inject(IGiftRequestRepository)
    private readonly giftRequestRepository: IGiftRequestRepository,
    private readonly profileGate: ProfileGate,
  ) {}

  public async handle(
    command: ICreateGiftRequestCommand,
  ): Promise<ICreateGiftRequestResult> {
    // Cổng hồ sơ (F07) — chốt 2026-09-24 áp cho cả xin nhận, không chỉ đăng bài.
    // Người tặng phải liên hệ được với người xin; hồ sơ thiếu SĐT hoặc họ tên
    // biến mỗi lượt trao thành một cuộc hẹn với người vô danh.
    await this.profileGate.assertComplete(command.requesterId);

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
      } catch (acceptError) {
        // Log để monitoring phát hiện; request vẫn tồn tại ở PENDING.
        // Cron timeout hoặc admin có thể trigger lại accept thủ công.
        console.error(
          `[INSTANT-ACCEPT] acceptRequest failed for request=${globalId} post=${command.postId}:`,
          acceptError,
        );
      }
    }

    return {
      request: toGiftRequestDto(created),
    };
  }
}
