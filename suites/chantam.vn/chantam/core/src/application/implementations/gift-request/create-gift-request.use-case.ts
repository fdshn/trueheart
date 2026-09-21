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
} from '@chantam.vn/chantam.core-lib/consts';
import { makeGlobalId } from '@chantam/service.common-lib/utils';
import { Inject, Injectable } from '@nestjs/common';
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
  ) {}

  public async handle(
    command: ICreateGiftRequestCommand,
  ): Promise<ICreateGiftRequestResult> {
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

    const existing = await this.giftRequestRepository.findByPostAndRequester(
      command.postId,
      command.requesterId,
    );

    if (existing) {
      if (
        existing.status === GiftRequestStatuses.PENDING ||
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

    return {
      request: toGiftRequestDto(
        await this.giftRequestRepository.findOneByOrFail({
          globalId,
        } as never),
      ),
    };
  }
}
