import {
  IGetChatFlagPendingCountCommand,
  IGetChatFlagPendingCountResult,
  IGetChatFlagPendingCountUseCase,
  IGetChatFlagQueueCommand,
  IGetChatFlagQueueResult,
  IGetChatFlagQueueUseCase,
  IReviewChatFlagCommand,
  IReviewChatFlagResult,
  IReviewChatFlagUseCase,
} from '@/application/contracts/admin-config';
import { ChatMessageNotFoundException } from '@/domain/exceptions';
import {
  IAdminConfigRepository,
  IChatRepository,
} from '@/domain/ports/repository';
import { PaginationMetaDto, toSkipTake } from '@chantam/service.common-lib/dto';
import { ForbiddenException } from '@chantam/service.common-lib/exception';
import { Inject, Injectable } from '@nestjs/common';

/**
 * Hàng đợi cờ kiểm duyệt chat — 30/09.
 *
 * Dùng `report.read` / `report.resolve` như `admin-chat.controller` đã dùng: đây
 * cùng một việc với xử lý báo xấu, và hai mã đó đã thuộc `MODERATOR`. Thêm mã
 * riêng nghĩa là seed một dòng `admin_permissions` chưa chắc vai nào được gán —
 * đúng loại "quyền seed mà không ai có" mà lượt soát này vừa đi dọn.
 *
 * ## Quyền riêng tư
 *
 * Hàng đợi này cho Admin đọc nội dung tin nhắn riêng. Đó là bước có thật, nhưng
 * `admin-chat.controller` đã mở đúng cửa đó từ trước (`GET /admin/chat/rooms/:id/
 * messages`) cho việc xử báo xấu. Khác biệt duy nhất ở đây là danh sách KHÔNG do
 * người dùng báo mà do bộ lọc chọn — nên nó chỉ hiện những tin ĐÃ KHỚP một mục
 * trong danh sách từ, không phải cả phòng.
 */
async function assertCanRead(
  permissions: IAdminConfigRepository,
  actorUserId: string,
): Promise<void> {
  if (!(await permissions.hasPermission(actorUserId, 'report.read')))
    throw new ForbiddenException();
}

@Injectable()
export class GetChatFlagQueueUseCase implements IGetChatFlagQueueUseCase {
  public constructor(
    @Inject(IAdminConfigRepository)
    private readonly permissions: IAdminConfigRepository,
    @Inject(IChatRepository) private readonly chat: IChatRepository,
  ) {}

  public async handle(
    command: IGetChatFlagQueueCommand,
  ): Promise<IGetChatFlagQueueResult> {
    await assertCanRead(this.permissions, command.actorUserId);

    const { skip, take } = toSkipTake(command);
    const { items, total } = await this.chat.listPendingFlags({ skip, take });

    return {
      flags: items,
      meta: new PaginationMetaDto(Math.floor(skip / take) + 1, take, total),
    };
  }
}

@Injectable()
export class GetChatFlagPendingCountUseCase implements IGetChatFlagPendingCountUseCase {
  public constructor(
    @Inject(IAdminConfigRepository)
    private readonly permissions: IAdminConfigRepository,
    @Inject(IChatRepository) private readonly chat: IChatRepository,
  ) {}

  public async handle(
    command: IGetChatFlagPendingCountCommand,
  ): Promise<IGetChatFlagPendingCountResult> {
    await assertCanRead(this.permissions, command.actorUserId);

    return { pending: await this.chat.countPendingFlags() };
  }
}

@Injectable()
export class ReviewChatFlagUseCase implements IReviewChatFlagUseCase {
  public constructor(
    @Inject(IAdminConfigRepository)
    private readonly permissions: IAdminConfigRepository,
    @Inject(IChatRepository) private readonly chat: IChatRepository,
  ) {}

  public async handle(
    command: IReviewChatFlagCommand,
  ): Promise<IReviewChatFlagResult> {
    if (
      !(await this.permissions.hasPermission(
        command.actorUserId,
        'report.resolve',
      ))
    )
      throw new ForbiddenException();

    const reviewed = await this.chat.reviewFlag({
      flagId: command.flagId,
      reviewerId: command.actorUserId,
      action: command.review.action,
      note: command.review.note?.trim() || null,
    });
    // Không tồn tại và đã được xử cùng một câu trả lời: hai Admin bấm cùng lúc thì
    // người thứ hai cần biết "không còn việc ở đây", không cần biết ai xử trước.
    // Dùng luôn ngoại lệ "không tìm thấy tin nhắn": với Admin thì một cờ đã xử và
    // một cờ không tồn tại là cùng một kết luận — không còn việc ở đây.
    if (!reviewed) throw new ChatMessageNotFoundException();

    await this.permissions.appendAudit({
      actorUserId: command.actorUserId,
      action: 'REVIEW_CHAT_FLAG',
      resourceType: 'CHAT_MESSAGE_FLAG',
      resourceId: command.flagId,
      before: null,
      after: { action: command.review.action },
      reason: command.review.note?.trim() ?? undefined,
    });

    const { skip, take } = toSkipTake({});
    const { items, total } = await this.chat.listPendingFlags({ skip, take });

    return {
      flags: items,
      meta: new PaginationMetaDto(1, take, total),
    };
  }
}
