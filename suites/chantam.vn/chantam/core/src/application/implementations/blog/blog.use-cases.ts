import {
  IBlogDetailView,
  IBlogListResult,
  IBlogSummaryView,
  IBlogWriteInput,
  ICreateBlogCommand,
  ICreateBlogUseCase,
  IDeleteBlogCommand,
  IDeleteBlogResult,
  IDeleteBlogUseCase,
  IGetPublicBlogCommand,
  IGetPublicBlogUseCase,
  IListAdminBlogsCommand,
  IListAdminBlogsUseCase,
  IListPublicBlogsCommand,
  IListPublicBlogsUseCase,
  IUpdateBlogCommand,
  IUpdateBlogUseCase,
} from '@/application/contracts/blog';
import { BlogNotFoundException } from '@/domain/exceptions';
import {
  IAdminConfigRepository,
  IBlogRecord,
  IBlogRepository,
  IBlogSummary,
  IBlogWriteParams,
} from '@/domain/ports/repository';
import { IHtmlSanitizer } from '@/domain/ports/security';
import {
  BlogCategoryLabels,
  blogGaps,
  normalizeBlogSlug,
  normalizeBlogSummary,
  slugifyBlogTitle,
} from '@chantam.vn/chantam.core-lib/models';
import {
  ForbiddenException,
  ValidationFailedException,
} from '@chantam/service.common-lib/exception';
import { Inject, Injectable } from '@nestjs/common';

const UuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toSummaryView(row: IBlogSummary): IBlogSummaryView {
  return {
    id: row.globalId,
    title: row.title,
    slug: row.slug,
    category: row.category,
    // Nhãn tiếng Việt đi kèm mã: CMS và trang công khai cùng hiện một chữ, không ai phải
    // tự dịch `PHAT_PHAP` thành "Phật Pháp" ở hai nơi rồi lệch nhau.
    categoryLabel: BlogCategoryLabels[row.category],
    summary: row.summary,
    thumbnailUrl: row.thumbnailUrl,
    viewCount: row.viewCount,
    isPublished: row.isPublished,
    publishedAt: row.publishedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toDetailView(record: IBlogRecord): IBlogDetailView {
  return { ...toSummaryView(record), contentHtml: record.contentHtml };
}

@Injectable()
export class ListAdminBlogsUseCase implements IListAdminBlogsUseCase {
  public constructor(
    @Inject(IBlogRepository) private readonly repository: IBlogRepository,
    @Inject(IAdminConfigRepository)
    private readonly admin: IAdminConfigRepository,
  ) {}

  public async handle(
    command: IListAdminBlogsCommand,
  ): Promise<IBlogListResult> {
    if (!(await this.admin.hasPermission(command.actorUserId, 'blog.read')))
      throw new ForbiddenException();

    const page = await this.repository.listBlogs({
      limit: command.limit,
      offset: command.offset,
      category: command.category,
      // CMS thấy cả bản nháp — đó là nửa công việc của trang này.
      publishedOnly: false,
    });

    return { items: page.items.map(toSummaryView), total: page.total };
  }
}

/**
 * Chuẩn bị dữ liệu ghi: lọc HTML, sinh slug, rồi kiểm.
 *
 * Thứ tự quan trọng: **lọc trước, kiểm sau**. `blogGaps` hỏi "còn chữ nào không" dựa trên
 * `contentTextLength`, mà một bài dán toàn `<script>` chỉ còn rỗng SAU khi lọc. Kiểm trên
 * HTML thô sẽ thấy "có nội dung" rồi xuất bản một trang trắng.
 */
@Injectable()
class BlogWritePreparer {
  public constructor(
    private readonly repository: IBlogRepository,
    private readonly sanitizer: IHtmlSanitizer,
  ) {}

  public async prepare(
    input: IBlogWriteInput,
    actorUserId: string,
    exceptGlobalId?: string,
  ): Promise<IBlogWriteParams> {
    const title = input.title.trim();
    const contentHtml = this.sanitizer.sanitizeArticle(input.contentHtml);

    // Slug người dùng gõ được chuẩn hoá y hệt slug sinh tự động: không có hai cách viết
    // cho một đường.
    const requested = normalizeBlogSlug(input.slug);
    const slug = requested.length > 0 ? requested : slugifyBlogTitle(title);

    const gaps = blogGaps({
      isPublished: input.isPublished,
      title,
      slug,
      contentTextLength: this.sanitizer.textLength(contentHtml),
      thumbnailUrl: input.thumbnailUrl ?? null,
    });
    if (gaps.length > 0) throw new ValidationFailedException(gaps);

    // Hỏi trước khi ghi để trả một thông báo đọc được, thay vì để `UNIQUE` ném 500.
    // Vẫn còn một khe hẹp giữa lượt hỏi và lượt ghi — ràng buộc database là lớp cuối, và
    // nó phải là lớp cuối chứ không phải lớp duy nhất.
    if (await this.repository.slugTaken(slug, exceptGlobalId))
      throw new ValidationFailedException([
        `slug "${slug}" đã có bài khác dùng — đổi tiêu đề hoặc gửi slug riêng`,
      ]);

    return {
      actorUserId,
      title,
      slug,
      category: input.category,
      summary: normalizeBlogSummary(input.summary),
      contentHtml,
      thumbnailUrl: input.thumbnailUrl ?? null,
      isPublished: input.isPublished,
    };
  }
}

@Injectable()
export class CreateBlogUseCase implements ICreateBlogUseCase {
  public constructor(
    @Inject(IBlogRepository) private readonly repository: IBlogRepository,
    @Inject(IHtmlSanitizer) private readonly sanitizer: IHtmlSanitizer,
    @Inject(IAdminConfigRepository)
    private readonly admin: IAdminConfigRepository,
  ) {}

  public async handle(command: ICreateBlogCommand): Promise<IBlogDetailView> {
    if (!(await this.admin.hasPermission(command.actorUserId, 'blog.manage')))
      throw new ForbiddenException();

    const prepared = await new BlogWritePreparer(
      this.repository,
      this.sanitizer,
    ).prepare(command, command.actorUserId);

    return toDetailView(await this.repository.createBlog(prepared));
  }
}

@Injectable()
export class UpdateBlogUseCase implements IUpdateBlogUseCase {
  public constructor(
    @Inject(IBlogRepository) private readonly repository: IBlogRepository,
    @Inject(IHtmlSanitizer) private readonly sanitizer: IHtmlSanitizer,
    @Inject(IAdminConfigRepository)
    private readonly admin: IAdminConfigRepository,
  ) {}

  public async handle(command: IUpdateBlogCommand): Promise<IBlogDetailView> {
    if (!(await this.admin.hasPermission(command.actorUserId, 'blog.manage')))
      throw new ForbiddenException();

    // Hỏi trước để trả 404, thay vì để `updateBlog` trả 0 dòng rồi nổ ở `toRecord(rows[0])`
    // với một TypeError không nói lên gì.
    if (!(await this.repository.findByGlobalId(command.blogId)))
      throw new BlogNotFoundException();

    const prepared = await new BlogWritePreparer(
      this.repository,
      this.sanitizer,
    ).prepare(command, command.actorUserId, command.blogId);

    return toDetailView(
      await this.repository.updateBlog({
        ...prepared,
        globalId: command.blogId,
      }),
    );
  }
}

@Injectable()
export class DeleteBlogUseCase implements IDeleteBlogUseCase {
  public constructor(
    @Inject(IBlogRepository) private readonly repository: IBlogRepository,
    @Inject(IAdminConfigRepository)
    private readonly admin: IAdminConfigRepository,
  ) {}

  public async handle(command: IDeleteBlogCommand): Promise<IDeleteBlogResult> {
    if (!(await this.admin.hasPermission(command.actorUserId, 'blog.manage')))
      throw new ForbiddenException();

    // Xoá MỀM: một bài đã xuất bản có link ngoài trỏ vào, và `slug` vẫn phải giữ chỗ để
    // bài sau không chiếm lại cùng đường dẫn rồi hiện ra một nội dung khác hẳn.
    const deleted = await this.repository.softDeleteBlog(
      command.blogId,
      command.actorUserId,
    );
    if (!deleted) throw new BlogNotFoundException();

    return { deleted };
  }
}

@Injectable()
export class ListPublicBlogsUseCase implements IListPublicBlogsUseCase {
  public constructor(
    @Inject(IBlogRepository) private readonly repository: IBlogRepository,
  ) {}

  public async handle(
    command: IListPublicBlogsCommand,
  ): Promise<IBlogListResult> {
    const page = await this.repository.listBlogs({
      limit: command.limit,
      offset: command.offset,
      category: command.category,
      publishedOnly: true,
    });

    return { items: page.items.map(toSummaryView), total: page.total };
  }
}

@Injectable()
export class GetPublicBlogUseCase implements IGetPublicBlogUseCase {
  public constructor(
    @Inject(IBlogRepository) private readonly repository: IBlogRepository,
  ) {}

  public async handle(
    command: IGetPublicBlogCommand,
  ): Promise<IBlogDetailView> {
    // SRS gọi đường này là `GET /blogs/:id`, nhưng link chia sẻ của một bài viết dùng
    // slug. Nhận cả hai: trông như UUID thì tra theo id, còn lại tra theo slug. Nhờ vậy
    // không phải thêm một endpoint thứ hai cho cùng một việc.
    const record = UuidPattern.test(command.idOrSlug)
      ? await this.repository.findByGlobalId(command.idOrSlug)
      : await this.repository.findPublishedBySlug(command.idOrSlug);

    // Tra theo id cũng chỉ trả bài ĐÃ xuất bản: đường này công khai, nên một bản nháp
    // đọc được bằng id là bài chưa duyệt lọt ra ngoài.
    if (!record || !record.isPublished) throw new BlogNotFoundException();

    // Tăng lượt xem SAU khi đã có bài, và không chờ kết quả ảnh hưởng tới response —
    // nhưng vẫn `await` để lỗi không thành unhandled rejection. Một lượt đếm trượt không
    // đáng làm hỏng lượt đọc, nên lỗi chỉ được ghi log ở tầng dưới.
    await this.repository.incrementViewCount(record.globalId);

    return toDetailView(record);
  }
}
