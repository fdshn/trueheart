import {
  IMergeCategoryCommand,
  IMergeCategoryResult,
  IMergeCategoryUseCase,
} from '@/application/contracts/category';
import {
  CategoryMergeInvalidException,
  CategoryNotFoundException,
} from '@/domain/exceptions';
import {
  IAdminConfigRepository,
  ICategoryRepository,
} from '@/domain/ports/repository';
import { ForbiddenException } from '@chantam/service.common-lib/exception';
import { Inject, Injectable } from '@nestjs/common';
import {
  assertDepthWithinLimit,
  assertPostTypeAllowed,
} from './category-guards';
import { toCategoryDto } from './category.mapper';

/**
 * Gộp một danh mục vào danh mục khác.
 *
 * ## Vì sao cần
 *
 * [22 §Chỗ cần soát](../../../../../../docs/diagram/22-category.md) mục 3: tạo nhầm
 * hai danh mục trùng nghĩa thì trước đây phải sửa tay từng bài. Với một danh mục có
 * vài nghìn bài thì "sửa tay" nghĩa là không ai sửa.
 *
 * ## Gộp là CHUYỂN rồi TẮT, không phải xoá
 *
 * Cùng lý do §22.2 chọn tắt thay vì xoá: bài cũ trỏ vào danh mục đó vẫn cần đọc được
 * tên để hiển thị lịch sử, và audit log phải tra lại được. Nên nguồn chỉ bị tắt, và
 * `merged_into_id` ghi lại nó đã đi đâu — thiếu cột đó thì sau này không ai trả lời
 * được "danh mục này tắt vì gộp hay vì Admin tắt tay".
 *
 * ## Một transaction
 *
 * Chuyển bài, chuyển con, rồi tắt nguồn. Tách ra thì một lần chết giữa chừng để lại
 * nguồn đã tắt mà bài vẫn ở đó — tức đúng cái §22.2 gọi là "3.000 bài biến mất khỏi
 * bộ lọc mà không ai báo trước", lần này do chính đường gộp gây ra.
 */
@Injectable()
export class MergeCategoryUseCase implements IMergeCategoryUseCase {
  public constructor(
    @Inject(ICategoryRepository)
    private readonly categories: ICategoryRepository,
    @Inject(IAdminConfigRepository)
    private readonly admin: IAdminConfigRepository,
  ) {}

  public async handle(
    command: IMergeCategoryCommand,
  ): Promise<IMergeCategoryResult> {
    if (!(await this.admin.hasPermission(command.userId, 'category.manage')))
      throw new ForbiddenException();

    const { targetCategoryId, reason } = command.merge;
    if (targetCategoryId === command.categoryId)
      throw new CategoryMergeInvalidException(
        'không gộp một danh mục vào chính nó',
      );

    const source = await this.categories.findOneBy({
      globalId: command.categoryId,
    });
    const target = await this.categories.findOneBy({
      globalId: targetCategoryId,
    });
    if (!source || source.deletedAt) throw new CategoryNotFoundException();
    if (!target || target.deletedAt || !target.isActive)
      throw new CategoryNotFoundException();

    // Đích KHÔNG được nằm trong nhánh con của nguồn. Gộp cha vào con của nó sẽ đẩy
    // con lên làm cha của chính nó — đúng cái VÒNG mà `assertNoParentCycle` chặn ở
    // đường đổi cha, chỉ là tới bằng cửa khác.
    const subtree = await this.categories.findSubtreeIds(command.categoryId);
    if (subtree.includes(targetCategoryId))
      throw new CategoryMergeInvalidException(
        `"${target.name}" nằm trong nhánh con của "${source.name}", gộp vào đó sẽ tạo vòng`,
      );

    // Đích phải nhận được mọi loại bài mà nguồn đang nhận, nếu không những bài vừa
    // chuyển sang sẽ nằm trong một danh mục không khai loại của chúng — và từ đó
    // không sửa được nữa vì `update-post` nay kiểm `postTypes`.
    for (const postType of source.postTypes ?? [])
      assertPostTypeAllowed(target, postType);

    // Con của nguồn chuyển sang đích, nên độ sâu tính theo nhánh nguồn treo dưới đích.
    await assertDepthWithinLimit(this.categories, {
      categoryId: command.categoryId,
      parentId: targetCategoryId,
    });

    const result = await this.categories.mergeInto({
      sourceId: command.categoryId,
      targetId: targetCategoryId,
      reason: reason.trim(),
    });

    await this.admin.appendAudit({
      actorUserId: command.userId,
      action: 'MERGE_CATEGORY',
      resourceType: 'CATEGORY',
      resourceId: command.categoryId,
      before: toCategoryDto(source),
      after: {
        mergedInto: targetCategoryId,
        movedPosts: result.movedPosts,
        movedChildren: result.movedChildren,
      },
      reason: reason.trim(),
    });

    return {
      category: toCategoryDto(
        await this.categories.findOneByOrFail({ globalId: targetCategoryId }),
      ),
      movedPosts: result.movedPosts,
      movedChildren: result.movedChildren,
    };
  }
}
