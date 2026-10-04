import {
  ICompleteRecitationCommand,
  ICompleteRecitationUseCase,
  ICreateDharmaContentCommand,
  ICreateDharmaContentUseCase,
  IDeleteDharmaContentCommand,
  IDeleteDharmaContentResult,
  IDeleteDharmaContentUseCase,
  IDharmaContentPageResult,
  IDharmaHubEntryDto,
  IGetDharmaContentCommand,
  IGetDharmaContentResult,
  IGetDharmaContentUseCase,
  IGetDharmaHubCommand,
  IGetDharmaHubResult,
  IGetDharmaHubUseCase,
  IListAdminDharmaContentsCommand,
  IListAdminDharmaContentsUseCase,
  IListOwnRecitationsCommand,
  IListOwnRecitationsResult,
  IListOwnRecitationsUseCase,
  IListPublicDharmaContentsCommand,
  IListPublicDharmaContentsUseCase,
  IStartRecitationCommand,
  IStartRecitationResult,
  IStartRecitationUseCase,
  IUpdateDharmaContentCommand,
  IUpdateDharmaContentUseCase,
  IWriteDharmaContentInput,
} from '@/application/contracts/dharma';
import {
  DharmaContentNotFoundException,
  DharmaContentNotRecitableException,
  DharmaRecitationAlreadyCompletedException,
  DharmaRecitationNotFoundException,
} from '@/domain/exceptions';
import {
  IAdminConfigRepository,
  IDharmaContent,
  IDharmaRepository,
  IWriteDharmaContentParams,
} from '@/domain/ports/repository';
import {
  DharmaContentType,
  DharmaContentTypeLabels,
  DharmaHubEntries,
  DharmaHubEntryPaths,
  MaxDharmaBodyLength,
  MaxDharmaSummaryLength,
  dharmaContentGaps,
  isRecitableDharmaContent,
  normalizeDharmaCategory,
  normalizeDharmaSlug,
  slugifyDharmaTitle,
} from '@chantam.vn/chantam.core-lib/models';
import {
  ForbiddenException,
  ValidationFailedException,
} from '@chantam/service.common-lib/exception';
import { Inject, Injectable } from '@nestjs/common';

/**
 * Cặp quyền riêng `dharma.*`, không dùng lại `blog.*`.
 *
 * Nội dung ở đây là **kinh sách** — một bản kinh sai chữ là chuyện khác hẳn một bài tin sai
 * chính tả, và Bên A có thể muốn chỉ một người được sửa nó. Xem migration `1799000000000`.
 */
const ReadPermission = 'dharma.read';
const WritePermission = 'dharma.manage';

/** Nhãn hiện trên Dharma Hub, theo đúng chữ UI-DHARMA-01 dùng. */
const HubEntryLabels: Readonly<Record<string, string>> = {
  SUTRA: DharmaContentTypeLabels.SUTRA,
  RECITATION: 'Tụng kinh',
  DEDICATION: 'Hồi hướng',
  MERIT: 'Cúng / Công đức',
  FORUM: 'Diễn đàn Phật Pháp',
  INFO: DharmaContentTypeLabels.INFO,
  TEMPLE_INTRO: DharmaContentTypeLabels.TEMPLE_INTRO,
};

/**
 * Đọc và kiểm phần thân chung của một lượt ghi nội dung.
 *
 * `partial` phân biệt tạo với sửa. Một bản chép thứ hai cho đường sửa là một chỗ để đường
 * đó lỏng hơn, và lúc đó một bộ kinh hợp lệ sửa một lần thành bộ kinh thiếu nội dung mà vẫn
 * đang xuất bản.
 */
async function prepareWrite(
  repository: IDharmaRepository,
  input: Partial<IWriteDharmaContentInput>,
  options: { partial: boolean; exceptGlobalId?: string },
): Promise<Partial<IWriteDharmaContentParams>> {
  const title = input.title?.trim();
  const requestedSlug = normalizeDharmaSlug(input.slug);
  const slug =
    requestedSlug.length > 0
      ? requestedSlug
      : title === undefined
        ? undefined
        : slugifyDharmaTitle(title);
  const bodyText = input.bodyText ?? (options.partial ? undefined : '');

  // Lượt TẠO kiểm đủ bộ. Lượt SỬA chỉ kiểm khi người gọi gửi đúng những trường mà
  // `dharmaContentGaps` cần — gọi nó với một bản ghi giả sẽ báo lỗi cho trường không gửi.
  if (!options.partial) {
    const gaps = dharmaContentGaps({
      isPublished: input.isPublished ?? false,
      contentType: input.contentType,
      title: title ?? '',
      slug: slug ?? '',
      bodyText: bodyText ?? '',
      audioUrl: input.audioUrl,
      coverUrl: input.coverUrl,
    });
    if (gaps.length > 0) throw new ValidationFailedException(gaps);
  } else {
    const gaps: string[] = [];
    if (title !== undefined && title.length < 3)
      gaps.push('title phải có ít nhất 3 ký tự');
    if (slug !== undefined && slug.length === 0)
      gaps.push('slug rỗng sau khi chuẩn hoá');
    if (
      input.contentType !== undefined &&
      !['SUTRA', 'INFO', 'TEMPLE_INTRO'].includes(input.contentType)
    )
      gaps.push('contentType phải là một trong: SUTRA, INFO, TEMPLE_INTRO');
    if (bodyText !== undefined && bodyText.length > MaxDharmaBodyLength)
      gaps.push(`bodyText không vượt ${MaxDharmaBodyLength} ký tự`);
    // Xuất bản qua đường SỬA vẫn phải có nội dung. Thiếu phép kiểm này thì
    // `CHK_dharma_contents_published_has_body` ném một lỗi ràng buộc thay vì một thông báo
    // đọc được — và nó là lớp cuối, không phải lớp duy nhất.
    if (
      input.isPublished === true &&
      bodyText !== undefined &&
      bodyText.trim().length === 0
    )
      gaps.push('bodyText không được rỗng khi xuất bản');
    if (gaps.length > 0) throw new ValidationFailedException(gaps);
  }

  if (slug !== undefined && slug.length > 0) {
    // Hỏi trước khi ghi để trả thông báo đọc được thay vì để `UNIQUE` ném 500. Vẫn còn khe
    // hẹp giữa lượt hỏi và lượt ghi — ràng buộc database là lớp cuối.
    if (await repository.slugTaken(slug, options.exceptGlobalId))
      throw new ValidationFailedException([
        `slug "${slug}" đã có nội dung khác dùng — đổi tiêu đề hoặc gửi slug riêng`,
      ]);
  }

  const changes: Record<string, unknown> = {};
  if (input.contentType !== undefined)
    changes.contentType = input.contentType as DharmaContentType;
  if (input.category !== undefined)
    changes.category = normalizeDharmaCategory(input.category);
  if (title !== undefined) changes.title = title;
  if (slug !== undefined && slug.length > 0) changes.slug = slug;
  if (input.summary !== undefined)
    changes.summary =
      input.summary.trim().slice(0, MaxDharmaSummaryLength) || null;
  if (bodyText !== undefined) changes.bodyText = bodyText;
  if (input.audioUrl !== undefined) changes.audioUrl = input.audioUrl || null;
  if (input.coverUrl !== undefined) changes.coverUrl = input.coverUrl || null;
  if (input.displayOrder !== undefined)
    changes.displayOrder = input.displayOrder;
  if (input.isFeatured !== undefined) changes.isFeatured = input.isFeatured;
  if (input.isPublished !== undefined) changes.isPublished = input.isPublished;

  return changes as Partial<IWriteDharmaContentParams>;
}

@Injectable()
export class GetDharmaHubUseCase implements IGetDharmaHubUseCase {
  public constructor(
    @Inject(IDharmaRepository) private readonly repository: IDharmaRepository,
  ) {}

  // Nhận `command` dù không dùng: `IUseCase<C, R>` khai `handle(command: C)`, và bỏ tham số
  // ở bản hiện thực làm lượt gọi THẲNG class (script kiểm dựng bằng `new`) không khớp kiểu
  // với lượt gọi qua interface (controller). Một chữ ký cho cả hai đường.
  public async handle(
    _command: IGetDharmaHubCommand,
  ): Promise<IGetDharmaHubResult> {
    // Đếm cho ba entry dựng từ `dharma_contents`. Ba entry còn lại (`RECITATION`,
    // `DEDICATION`, `MERIT`, `FORUM`) trả `null` thay vì `0`: `0` đọc ra "không có gì",
    // trong khi sự thật là con số đó phụ thuộc người đang xem hoặc thuộc phân hệ khác.
    const counts = await Promise.all(
      (['SUTRA', 'INFO', 'TEMPLE_INTRO'] as const).map(async (contentType) => {
        const page = await this.repository.listPublishedContents({
          limit: 1,
          offset: 0,
          contentType,
        });
        return [contentType, page.total] as const;
      }),
    );
    const countByType = new Map<string, number>(counts);

    const entries: IDharmaHubEntryDto[] = DharmaHubEntries.map((entry) => ({
      entry,
      label: HubEntryLabels[entry],
      path: DharmaHubEntryPaths[entry],
      itemCount: countByType.get(entry) ?? null,
    }));

    return { entries };
  }
}

@Injectable()
export class CreateDharmaContentUseCase implements ICreateDharmaContentUseCase {
  public constructor(
    @Inject(IDharmaRepository) private readonly repository: IDharmaRepository,
    @Inject(IAdminConfigRepository)
    private readonly admin: IAdminConfigRepository,
  ) {}

  public async handle(
    command: ICreateDharmaContentCommand,
  ): Promise<IDharmaContent> {
    if (!(await this.admin.hasPermission(command.actorUserId, WritePermission)))
      throw new ForbiddenException();

    const prepared = await prepareWrite(this.repository, command, {
      partial: false,
    });

    return this.repository.createContent({
      ...(prepared as IWriteDharmaContentParams),
      category: prepared.category ?? null,
      summary: prepared.summary ?? null,
      bodyText: prepared.bodyText ?? '',
      audioUrl: prepared.audioUrl ?? null,
      coverUrl: prepared.coverUrl ?? null,
      displayOrder: prepared.displayOrder ?? 1,
      isFeatured: prepared.isFeatured ?? false,
      isPublished: prepared.isPublished ?? false,
      createdBy: command.actorUserId,
    });
  }
}

@Injectable()
export class UpdateDharmaContentUseCase implements IUpdateDharmaContentUseCase {
  public constructor(
    @Inject(IDharmaRepository) private readonly repository: IDharmaRepository,
    @Inject(IAdminConfigRepository)
    private readonly admin: IAdminConfigRepository,
  ) {}

  public async handle(
    command: IUpdateDharmaContentCommand,
  ): Promise<IDharmaContent> {
    if (!(await this.admin.hasPermission(command.actorUserId, WritePermission)))
      throw new ForbiddenException();

    // Xuất bản qua đường sửa cần biết nội dung HIỆN CÓ, không chỉ nội dung trong request:
    // bật `isPublished` mà không gửi `bodyText` thì phép kiểm phải soi bản đã lưu.
    const existing = await this.repository.findContentByGlobalId(
      command.contentId,
    );
    if (!existing) throw new DharmaContentNotFoundException();
    if (
      command.isPublished === true &&
      command.bodyText === undefined &&
      existing.bodyText.trim().length === 0
    )
      throw new ValidationFailedException([
        'bodyText không được rỗng khi xuất bản',
      ]);

    const updated = await this.repository.updateContent({
      contentId: command.contentId,
      changes: await prepareWrite(this.repository, command, {
        partial: true,
        exceptGlobalId: command.contentId,
      }),
    });
    if (!updated) throw new DharmaContentNotFoundException();

    return updated;
  }
}

@Injectable()
export class ListPublicDharmaContentsUseCase implements IListPublicDharmaContentsUseCase {
  public constructor(
    @Inject(IDharmaRepository) private readonly repository: IDharmaRepository,
  ) {}

  public async handle(
    command: IListPublicDharmaContentsCommand,
  ): Promise<IDharmaContentPageResult> {
    return this.repository.listPublishedContents({
      limit: command.limit,
      offset: command.offset,
      contentType: command.contentType,
      // Chuẩn hoá danh mục Ở ĐÂY nữa, không chỉ lúc ghi: người dùng lọc bằng chuỗi gõ tay
      // hoặc chuỗi lấy từ một bản cũ, và không chuẩn hoá thì bộ lọc im lặng trả rỗng.
      category: normalizeDharmaCategory(command.category) ?? undefined,
      featuredOnly: command.featuredOnly,
    });
  }
}

@Injectable()
export class ListAdminDharmaContentsUseCase implements IListAdminDharmaContentsUseCase {
  public constructor(
    @Inject(IDharmaRepository) private readonly repository: IDharmaRepository,
    @Inject(IAdminConfigRepository)
    private readonly admin: IAdminConfigRepository,
  ) {}

  public async handle(
    command: IListAdminDharmaContentsCommand,
  ): Promise<IDharmaContentPageResult> {
    if (!(await this.admin.hasPermission(command.actorUserId, ReadPermission)))
      throw new ForbiddenException();

    return this.repository.listContentsForAdmin({
      limit: command.limit,
      offset: command.offset,
      contentType: command.contentType,
      includeDrafts: command.includeDrafts,
    });
  }
}

@Injectable()
export class GetDharmaContentUseCase implements IGetDharmaContentUseCase {
  public constructor(
    @Inject(IDharmaRepository) private readonly repository: IDharmaRepository,
  ) {}

  public async handle(
    command: IGetDharmaContentCommand,
  ): Promise<IGetDharmaContentResult> {
    const content = await this.repository.findPublishedContentByIdOrSlug(
      command.idOrSlug,
    );
    if (!content) throw new DharmaContentNotFoundException();

    const completedRecitationCount =
      await this.repository.countCompletedRecitations(content.globalId);

    // Tăng lượt xem SAU khi đã có nội dung. Vẫn `await` để lỗi không thành unhandled
    // rejection, nhưng một lượt đếm trượt không đáng làm hỏng lượt đọc.
    await this.repository.incrementViewCount(content.globalId);

    return {
      content,
      completedRecitationCount,
      isRecitable: isRecitableDharmaContent(content),
    };
  }
}

@Injectable()
export class DeleteDharmaContentUseCase implements IDeleteDharmaContentUseCase {
  public constructor(
    @Inject(IDharmaRepository) private readonly repository: IDharmaRepository,
    @Inject(IAdminConfigRepository)
    private readonly admin: IAdminConfigRepository,
  ) {}

  public async handle(
    command: IDeleteDharmaContentCommand,
  ): Promise<IDeleteDharmaContentResult> {
    if (!(await this.admin.hasPermission(command.actorUserId, WritePermission)))
      throw new ForbiddenException();

    // Xoá MỀM. `dharma_recitations` có `ON DELETE CASCADE`, nên xoá cứng một bộ kinh là xoá
    // sạch lịch sử tụng của mọi người đã tụng nó.
    if (!(await this.repository.softDeleteContent(command.contentId)))
      throw new DharmaContentNotFoundException();

    return { deleted: true };
  }
}

@Injectable()
export class StartRecitationUseCase implements IStartRecitationUseCase {
  public constructor(
    @Inject(IDharmaRepository) private readonly repository: IDharmaRepository,
  ) {}

  public async handle(
    command: IStartRecitationCommand,
  ): Promise<IStartRecitationResult> {
    const content = await this.repository.findContentByGlobalId(
      command.contentId,
    );
    // Chưa xuất bản thì trả 404 chứ không 403: bản nháp chưa công khai, nên sự TỒN TẠI của
    // nó cũng chưa công khai.
    if (!content || !content.isPublished)
      throw new DharmaContentNotFoundException();

    // UC-DHARMA-02 chỉ nói về Kinh sách. Mở cho `INFO`/`TEMPLE_INTRO` là cho người dùng
    // "đánh dấu đã tụng xong" một trang giới thiệu chùa, và lịch sử tụng mất nghĩa.
    if (!isRecitableDharmaContent(content))
      throw new DharmaContentNotRecitableException();

    return {
      recitation: await this.repository.startRecitation({
        contentId: content.globalId,
        userId: command.actorUserId,
      }),
    };
  }
}

@Injectable()
export class CompleteRecitationUseCase implements ICompleteRecitationUseCase {
  public constructor(
    @Inject(IDharmaRepository) private readonly repository: IDharmaRepository,
  ) {}

  public async handle(
    command: ICompleteRecitationCommand,
  ): Promise<IStartRecitationResult> {
    const completed = await this.repository.completeRecitation({
      recitationId: command.recitationId,
      userId: command.actorUserId,
    });
    if (completed) return { recitation: completed };

    // Không đổi được thì phân biệt hai ca, vì chúng nói hai điều khác nhau.
    //
    // Phép kiểm chủ sở hữu nằm trong `WHERE` của câu `UPDATE`, nên lượt đọc dưới đây CHỈ để
    // chọn thông báo. Đặt nó trước câu ghi mới là mở một khe TOCTOU.
    const existing = await this.repository.findRecitationByGlobalId(
      command.recitationId,
    );
    // Lượt tụng của NGƯỜI KHÁC cũng trả "không tìm thấy" — ai đó dò id không nên biết
    // người khác đang tụng gì.
    if (!existing || existing.userId !== command.actorUserId)
      throw new DharmaRecitationNotFoundException();

    throw new DharmaRecitationAlreadyCompletedException();
  }
}

@Injectable()
export class ListOwnRecitationsUseCase implements IListOwnRecitationsUseCase {
  public constructor(
    @Inject(IDharmaRepository) private readonly repository: IDharmaRepository,
  ) {}

  public async handle(
    command: IListOwnRecitationsCommand,
  ): Promise<IListOwnRecitationsResult> {
    return this.repository.listOwnRecitations({
      userId: command.actorUserId,
      limit: command.limit,
      offset: command.offset,
    });
  }
}
