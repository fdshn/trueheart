import {
  IUpdateCategoryCommand,
  IUpdateCategoryUseCase,
} from '@/application/contracts/category';
import {
  CategoryMergedCannotReopenException,
  CategoryNotFoundException,
  CategorySlugTakenException,
} from '@/domain/exceptions';
import {
  IAdminConfigRepository,
  ICategoryRepository,
} from '@/domain/ports/repository';
import { ForbiddenException } from '@chantam/service.common-lib/exception';
import { definedProps, slugify } from '@chantam/service.common-lib/utils';
import { Inject, Injectable } from '@nestjs/common';
import {
  assertDepthWithinLimit,
  assertNoParentCycle,
  assertNotInUseBeforeDeactivating,
} from './category-guards';
import { toCategoryDto } from './category.mapper';

@Injectable()
export class UpdateCategoryUseCase implements IUpdateCategoryUseCase {
  public constructor(
    @Inject(ICategoryRepository)
    private readonly categories: ICategoryRepository,
    @Inject(IAdminConfigRepository)
    private readonly admin: IAdminConfigRepository,
  ) {}

  public async handle(command: IUpdateCategoryCommand) {
    if (!(await this.admin.hasPermission(command.userId, 'category.manage')))
      throw new ForbiddenException();

    const existing = await this.categories.findOneBy({
      globalId: command.categoryId,
    });
    if (!existing || existing.deletedAt) throw new CategoryNotFoundException();

    const input = command.category;
    const update: Record<string, unknown> = definedProps(input);
    if (input.slug !== undefined || input.name !== undefined) {
      const slug = slugify((input.slug ?? input.name ?? existing.name).trim());
      if (await this.categories.isSlugTaken(slug, existing.globalId))
        throw new CategorySlugTakenException(slug);
      update.slug = slug;
    }
    if (input.parentId) {
      const parent = await this.categories.findOneBy({
        globalId: input.parentId,
      });
      if (!parent || !parent.isActive) throw new CategoryNotFoundException();

      // Hai phép kiểm này là thứ thiếu suốt: đổi cha trước 30/09 chỉ hỏi "cha có
      // tồn tại và đang bật không". Đặt cha là chính nó, hoặc là một con cháu của
      // nó, tạo VÒNG — và cây dựng từ gốc đi xuống nên cả nhánh biến mất khỏi cả
      // hai đường đọc, kể cả đường Admin. Lúc đó không còn cách nào sửa qua API.
      await assertNoParentCycle(this.categories, {
        categoryId: existing.globalId,
        parentId: input.parentId,
        parentName: parent.name,
      });
      await assertDepthWithinLimit(this.categories, {
        categoryId: existing.globalId,
        parentId: input.parentId,
      });
    }

    // Tắt danh mục còn bài dùng: §22.2 vẽ nhánh 409 này từ đầu mà code chưa từng
    // có. Chỉ kiểm khi ĐANG bật và yêu cầu tắt — bật lại hay sửa tên thì không.
    if (input.isActive === false && existing.isActive)
      await assertNotInUseBeforeDeactivating(
        this.categories,
        existing.globalId,
      );

    // Bật lại một danh mục ĐÃ GỘP là tạo lại đúng hai danh mục trùng nghĩa mà
    // lượt gộp vừa dọn. `CHK_categories_merged_is_inactive` chặn việc đó ở tầng
    // database, nhưng một ràng buộc nổ ra thành 500 thì Admin đọc được đúng một
    // câu: "Đã xảy ra lỗi không xác định" — đo được trong lượt thăm dò 30/09.
    // Chặn ở đây để họ biết VÌ SAO, và biết bài đã chuyển về danh mục nào.
    if (input.isActive === true && existing.mergedIntoId) {
      const target = await this.categories.findOneBy({
        globalId: existing.mergedIntoId,
      });
      throw new CategoryMergedCannotReopenException(
        existing.name,
        target?.name ?? existing.mergedIntoId,
      );
    }
    await this.categories.update({ globalId: existing.globalId }, update);
    const category = toCategoryDto(
      await this.categories.findOneByOrFail({ globalId: existing.globalId }),
    );
    await this.admin.appendAudit({
      actorUserId: command.userId,
      action: 'UPDATE_CATEGORY',
      resourceType: 'CATEGORY',
      resourceId: existing.globalId,
      before: toCategoryDto(existing),
      after: category,
    });
    return { category };
  }
}
