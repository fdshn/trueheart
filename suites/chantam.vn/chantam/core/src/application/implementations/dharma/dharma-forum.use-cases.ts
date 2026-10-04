import {
  ICreateDedicationCommand,
  ICreateDedicationUseCase,
  ICreateThreadCommand,
  ICreateThreadUseCase,
  IDedicationResult,
  IGetThreadCommand,
  IGetThreadUseCase,
  IListAdminThreadsCommand,
  IListAdminThreadsUseCase,
  IListOwnDedicationsCommand,
  IListOwnDedicationsResult,
  IListOwnDedicationsUseCase,
  IListPublicDedicationsCommand,
  IListPublicDedicationsResult,
  IListPublicDedicationsUseCase,
  IListPublicThreadsCommand,
  IListPublicThreadsUseCase,
  IModerateThreadCommand,
  IModerateThreadUseCase,
  IThreadPageResult,
  IThreadResult,
} from '@/application/contracts/dharma';
import {
  ContentBlockedTermsException,
  DharmaRecitationNotFoundException,
  DharmaThreadNotFoundException,
} from '@/domain/exceptions';
import {
  IAdminConfigRepository,
  IDharmaRepository,
} from '@/domain/ports/repository';
import {
  DharmaThreadStatus,
  MaxDedicateeNameLength,
  MaxDedicationTextLength,
  ModerationTermsConfigKey,
  ModerationVerdicts,
  dharmaDedicationGaps,
  dharmaThreadGaps,
  isPubliclyVisibleThread,
  normalizeBlockedTerms,
  normalizeDharmaCategory,
  screenText,
} from '@chantam.vn/chantam.core-lib/models';
import {
  ForbiddenException,
  ValidationFailedException,
} from '@chantam/service.common-lib/exception';
import { Inject, Injectable } from '@nestjs/common';

/**
 * Quyền kiểm duyệt diễn đàn.
 *
 * Dùng lại `post.moderate` của vai `MODERATOR`, KHÔNG đặt `forum.moderate` mới. Khác hẳn
 * quyết định ở `banner.*` và `merit.*`: ở đó việc là thương mại và tài chính, nên cần ô tick
 * riêng. Ở đây việc là **kiểm duyệt nội dung người dùng** — đúng việc `post.moderate` đang
 * làm cho bài và bình luận, và UC-DHARMA-03 nói rõ *"tái sử dụng cơ chế
 * Post/Comment/Like/Report/Moderation hiện có"*.
 *
 * Đặt mã mới là buộc Bên A cấp lại cho vai `MODERATOR` một quyền họ vốn đã có về bản chất,
 * và để ngỏ khả năng quên — lúc đó chủ đề bị báo xấu nằm trong hàng đợi mà không ai mở được.
 */
const ModeratePermission = 'post.moderate';

/**
 * Chạy chủ đề qua ĐÚNG bộ lọc từ ngữ của bình luận.
 *
 * `BLOCK` thì từ chối thẳng; `REVIEW` thì vào `PENDING_REVIEW` để Admin xử. Đây chính là chữ
 * "duyệt" của UC-DHARMA-03 — không phải một luồng duyệt-trước-khi-hiện cho mọi chủ đề, vì
 * đặc tả cho *"User có thể xem/tạo chủ đề"* chứ không nói chờ duyệt.
 *
 * Lọc CẢ tiêu đề và nội dung: một tiêu đề bậy hiện trên danh sách là thứ người ta thấy đầu
 * tiên, và lọc riêng nội dung sẽ để nó đi qua.
 */
async function screenThread(
  adminConfig: IAdminConfigRepository,
  title: string,
  bodyText: string,
): Promise<{ status: DharmaThreadStatus; flaggedTerms: string | null }> {
  const terms = normalizeBlockedTerms(
    await adminConfig.getConfigValue(ModerationTermsConfigKey),
  );
  const result = screenText(`${title}\n${bodyText}`, terms);

  if (result.verdict === ModerationVerdicts.BLOCK)
    throw new ContentBlockedTermsException();

  return {
    status:
      result.verdict === ModerationVerdicts.REVIEW
        ? 'PENDING_REVIEW'
        : 'VISIBLE',
    flaggedTerms: result.matched.length ? result.matched.join(',') : null,
  };
}

@Injectable()
export class CreateThreadUseCase implements ICreateThreadUseCase {
  public constructor(
    @Inject(IDharmaRepository) private readonly repository: IDharmaRepository,
    @Inject(IAdminConfigRepository)
    private readonly adminConfig: IAdminConfigRepository,
  ) {}

  public async handle(command: ICreateThreadCommand): Promise<IThreadResult> {
    const title = (command.title ?? '').trim();
    const bodyText = (command.bodyText ?? '').trim();

    const gaps = dharmaThreadGaps({ title, bodyText });
    if (gaps.length > 0) throw new ValidationFailedException(gaps);

    const screened = await screenThread(this.adminConfig, title, bodyText);

    return {
      thread: await this.repository.createThread({
        authorId: command.actorUserId,
        title,
        bodyText,
        category: normalizeDharmaCategory(command.category),
        status: screened.status,
        flaggedTerms: screened.flaggedTerms,
      }),
    };
  }
}

@Injectable()
export class ListPublicThreadsUseCase implements IListPublicThreadsUseCase {
  public constructor(
    @Inject(IDharmaRepository) private readonly repository: IDharmaRepository,
  ) {}

  public async handle(
    command: IListPublicThreadsCommand,
  ): Promise<IThreadPageResult> {
    return this.repository.listPublicThreads({
      limit: command.limit,
      offset: command.offset,
      // Chuẩn hoá ở lượt lọc nữa, không chỉ lượt ghi: người dùng lọc bằng chuỗi gõ tay, và
      // thiếu bước đó thì bộ lọc im lặng trả rỗng.
      category: normalizeDharmaCategory(command.category) ?? undefined,
    });
  }
}

@Injectable()
export class GetThreadUseCase implements IGetThreadUseCase {
  public constructor(
    @Inject(IDharmaRepository) private readonly repository: IDharmaRepository,
  ) {}

  public async handle(command: IGetThreadCommand): Promise<IThreadResult> {
    const thread = await this.repository.findThreadByGlobalId(command.threadId);
    // Chủ đề chờ duyệt hoặc đã ẩn trả 404 trên đường công khai: nó chưa (hoặc không còn)
    // hiện ra ngoài, nên sự TỒN TẠI của nó cũng vậy.
    if (!thread || !isPubliclyVisibleThread(thread.status))
      throw new DharmaThreadNotFoundException();

    return { thread };
  }
}

@Injectable()
export class ListAdminThreadsUseCase implements IListAdminThreadsUseCase {
  public constructor(
    @Inject(IDharmaRepository) private readonly repository: IDharmaRepository,
    @Inject(IAdminConfigRepository)
    private readonly admin: IAdminConfigRepository,
  ) {}

  public async handle(
    command: IListAdminThreadsCommand,
  ): Promise<IThreadPageResult> {
    if (
      !(await this.admin.hasPermission(command.actorUserId, ModeratePermission))
    )
      throw new ForbiddenException();

    return this.repository.listThreadsForAdmin({
      limit: command.limit,
      offset: command.offset,
      status: command.status,
    });
  }
}

@Injectable()
export class ModerateThreadUseCase implements IModerateThreadUseCase {
  public constructor(
    @Inject(IDharmaRepository) private readonly repository: IDharmaRepository,
    @Inject(IAdminConfigRepository)
    private readonly admin: IAdminConfigRepository,
  ) {}

  public async handle(command: IModerateThreadCommand): Promise<IThreadResult> {
    if (
      !(await this.admin.hasPermission(command.actorUserId, ModeratePermission))
    )
      throw new ForbiddenException();

    // Không gửi thay đổi nào thì từ chối, chứ không ghi một dấu vết kiểm duyệt rỗng.
    // `moderated_at` là bằng chứng Admin đã QUYẾT điều gì — ghi nó cho một lượt gọi không
    // đổi gì làm hàng đợi trông như đã xử lý xong.
    if (
      command.status === undefined &&
      command.isLocked === undefined &&
      command.isPinned === undefined
    )
      throw new ValidationFailedException([
        'phải gửi ít nhất một trong: status, isLocked, isPinned',
      ]);

    const moderated = await this.repository.moderateThread({
      threadId: command.threadId,
      moderatorId: command.actorUserId,
      status: command.status,
      isLocked: command.isLocked,
      isPinned: command.isPinned,
      note: command.note?.trim() || null,
    });
    if (!moderated) throw new DharmaThreadNotFoundException();

    return { thread: moderated };
  }
}

@Injectable()
export class CreateDedicationUseCase implements ICreateDedicationUseCase {
  public constructor(
    @Inject(IDharmaRepository) private readonly repository: IDharmaRepository,
  ) {}

  public async handle(
    command: ICreateDedicationCommand,
  ): Promise<IDedicationResult> {
    const text = (command.text ?? '').trim().slice(0, MaxDedicationTextLength);
    const dedicateeName =
      command.dedicateeName === undefined
        ? null
        : command.dedicateeName.trim().slice(0, MaxDedicateeNameLength) || null;

    const gaps = dharmaDedicationGaps({
      text,
      dedicateeName: command.dedicateeName,
    });
    if (gaps.length > 0) throw new ValidationFailedException(gaps);

    // Gắn với một lượt tụng thì lượt đó phải CỦA CHÍNH NGƯỜI NÀY.
    //
    // Thiếu phép kiểm chủ sở hữu, một người gắn lời hồi hướng của mình vào lượt tụng của
    // người khác — và trang "lượt tụng này đã được hồi hướng" sẽ hiện lời của người lạ.
    // Lượt tụng của người khác trả "không tìm thấy" chứ không "không được phép": ai dò id
    // không nên biết người khác đang tụng gì.
    if (command.recitationId !== undefined) {
      const recitation = await this.repository.findRecitationByGlobalId(
        command.recitationId,
      );
      if (!recitation || recitation.userId !== command.actorUserId)
        throw new DharmaRecitationNotFoundException();
    }

    return {
      dedication: await this.repository.createDedication({
        userId: command.actorUserId,
        recitationId: command.recitationId ?? null,
        dedicateeName,
        text,
        // Mặc định CÔNG KHAI theo UI-MERIT-01 (*"Sổ vàng/Hồi hướng mặc định công khai"*),
        // nhưng ẩn danh mặc định TẮT — ẩn danh phải là lựa chọn người dùng bấm.
        isPublic: command.isPublic ?? true,
        isAnonymous: command.isAnonymous ?? false,
      }),
    };
  }
}

@Injectable()
export class ListPublicDedicationsUseCase implements IListPublicDedicationsUseCase {
  public constructor(
    @Inject(IDharmaRepository) private readonly repository: IDharmaRepository,
  ) {}

  public async handle(
    command: IListPublicDedicationsCommand,
  ): Promise<IListPublicDedicationsResult> {
    return this.repository.listPublicDedications(command);
  }
}

@Injectable()
export class ListOwnDedicationsUseCase implements IListOwnDedicationsUseCase {
  public constructor(
    @Inject(IDharmaRepository) private readonly repository: IDharmaRepository,
  ) {}

  public async handle(
    command: IListOwnDedicationsCommand,
  ): Promise<IListOwnDedicationsResult> {
    // KHÔNG ẩn danh ở đây, và GỒM cả hàng không công khai — họ xem lại lời của chính mình.
    return this.repository.listOwnDedications({
      userId: command.actorUserId,
      limit: command.limit,
      offset: command.offset,
    });
  }
}
