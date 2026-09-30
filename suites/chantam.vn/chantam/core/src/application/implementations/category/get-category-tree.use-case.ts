import {
  IGetCategoryTreeCommand,
  IGetCategoryTreeUseCase,
} from '@/application/contracts/category';
import {
  IAdminConfigRepository,
  ICategoryRepository,
} from '@/domain/ports/repository';
import { PostTypes } from '@chantam.vn/chantam.core-lib/consts';
import { ICategoryDto } from '@chantam.vn/chantam.core-lib/dto';
import { ForbiddenException } from '@chantam/service.common-lib/exception';
import { Inject, Injectable } from '@nestjs/common';
import { toCategoryDto } from './category.mapper';

/**
 * Tỉa cây theo loại bài, GIỮ LẠI nhánh cha không khớp nhưng có con khớp.
 *
 * Lọc phẳng ở SQL thì danh mục con khớp mà cha không khớp sẽ mất cha, và vì
 * cây dựng từ gốc `null` nên nó biến mất luôn khỏi kết quả — người dùng không
 * thấy danh mục đáng lẽ chọn được. Node cha giữ lại vẫn mang `postTypes` thật
 * của nó, client đọc đó để biết node nào chọn được.
 */
function pruneByPostType(
  categories: ICategoryDto[],
  postType: PostTypes,
): ICategoryDto[] {
  const kept: ICategoryDto[] = [];

  for (const category of categories) {
    const children = pruneByPostType(category.children, postType);

    if (!category.postTypes.includes(postType) && children.length === 0)
      continue;

    kept.push({ ...category, children });
  }

  return kept;
}

@Injectable()
export class GetCategoryTreeUseCase implements IGetCategoryTreeUseCase {
  public constructor(
    @Inject(ICategoryRepository)
    private readonly categories: ICategoryRepository,
    @Inject(IAdminConfigRepository)
    private readonly admin: IAdminConfigRepository,
  ) {}

  public async handle(
    command: IGetCategoryTreeCommand = {},
  ): Promise<{ categories: ICategoryDto[] }> {
    if (
      command.includeInactive &&
      (!command.actorUserId ||
        !(await this.admin.hasPermission(command.actorUserId, 'category.read')))
    )
      throw new ForbiddenException();
    const rows = command.includeInactive
      ? await this.categories.findAdminTree()
      : await this.categories.findActiveTree();
    const byParent = new Map<string | null, ICategoryDto[]>();
    const known = new Set(rows.map((row) => row.globalId));

    for (const row of rows) {
      // Cha KHÔNG có trong tập dòng đọc được thì coi như nút gốc ở đường Admin.
      //
      // Hai ca rơi vào đây, và cả hai trước 30/09 làm nút biến mất im lặng:
      //
      // 1. Con đang bật dưới một cha đã tắt — `findActiveTree` chỉ lấy dòng active
      //    nên cha không có mặt, con không gắn được vào đâu.
      // 2. Nhánh có VÒNG `parent_id` — không nút nào của nó còn là gốc, nên đi từ
      //    gốc xuống không bao giờ tới. Đo được: dựng A → B → C rồi đặt
      //    `A.parent = C` thì cả ba mất khỏi CẢ hai đường đọc, kể cả Admin, trong
      //    khi ba dòng vẫn active trong database — và khi đó không lấy lại được
      //    `categoryId` qua API để sửa.
      //
      // Đường công khai vẫn BỎ chúng: một danh mục có tổ tiên đã tắt thì đúng là
      // không nên chọn được. Nhưng đường Admin phải thấy, vì Admin là người sửa.
      const parentVisible = row.parentId !== null && known.has(row.parentId);
      const bucketKey = parentVisible ? row.parentId : null;
      const bucket = byParent.get(bucketKey) ?? [];
      bucket.push(
        toCategoryDto(row, [], {
          detached: row.parentId !== null && !parentVisible,
        }),
      );
      byParent.set(bucketKey, bucket);
    }

    // `visited` chặn đệ quy vô hạn khi cây có vòng. Không có nó thì một vòng biến
    // `attachChildren` thành đệ quy không đáy và request chết bằng stack overflow.
    //
    // `emitted` ghi lại mọi nút đã đi tới được từ một gốc. Nó là thứ phân biệt
    // "nút này nằm đâu đó trong cây" với "nút này không nối về gốc nào cả".
    //
    // `ancestorsActive` truyền hiệu lực XUỐNG. Ở đường Admin cha đã tắt VẪN có mặt
    // trong tập dòng, nên con của nó gắn được vào cây bình thường và cờ `detached`
    // không bắt được ca này — nhưng người dùng vẫn không thấy nó, vì `findActiveTree`
    // sẽ không trả cha nên con không còn đường về gốc. Không truyền xuống thì Admin
    // đọc `effectivelyActive: true` cho một danh mục không ai chọn được.
    const emitted = new Set<string>();
    const attachChildren = (
      category: ICategoryDto,
      visited: ReadonlySet<string>,
      ancestorsActive: boolean,
    ): ICategoryDto => {
      emitted.add(category.categoryId);
      if (visited.has(category.categoryId))
        return {
          ...category,
          children: [],
          orphaned: true,
          effectivelyActive: false,
        };

      // `category.effectivelyActive` từ mapper đã mang vế `isActive && !detached`.
      const effective = ancestorsActive && category.effectivelyActive !== false;
      const seen = new Set(visited).add(category.categoryId);

      return {
        ...category,
        effectivelyActive: effective,
        children: (byParent.get(category.categoryId) ?? []).map((child) =>
          attachChildren(child, seen, effective),
        ),
      };
    };

    const roots = (byParent.get(null) ?? []).map((category) =>
      attachChildren(category, new Set<string>(), true),
    );

    // Nút nằm trong một VÒNG KHÉP KÍN không rơi vào nhóm gốc ở trên: cha của nó có
    // mặt trong tập dòng đọc được, nên nó được xếp vào nhóm của cha — và cái nhóm
    // đó không bao giờ được thăm, vì đi từ gốc xuống không tới được nhánh nào của
    // vòng. Ba dòng A → B → C với `A.parent = C` là đúng ca đó: cả ba có cha hợp lệ,
    // cả ba `is_active = true`, và cả ba biến mất khỏi CẢ hai đường đọc.
    //
    // Đó là lý do cần vòng lặp này chứ không chỉ cờ `detached`: thiếu nó thì Admin
    // không lấy được `categoryId` nào để `PATCH` cha về, và trạng thái chỉ gỡ được
    // bằng SQL tay. Nút đầu tiên của vòng được nâng lên mức gốc; `attachChildren`
    // kéo phần còn lại của vòng theo, và cạnh khép vòng hiện ra một lần nữa ở dưới
    // với `orphaned: true` — đó chính là chỗ chỉ ra vòng đóng tại đâu.
    const stranded: ICategoryDto[] = [];
    for (const row of rows) {
      if (emitted.has(row.globalId)) continue;
      stranded.push(
        attachChildren(
          toCategoryDto(row, [], { detached: true }),
          new Set<string>(),
          false,
        ),
      );
    }

    // Đường công khai KHÔNG trả nút bị tách khỏi gốc; đường Admin thì có, kèm cờ.
    const tree = command.includeInactive
      ? [...roots, ...stranded]
      : roots.filter((category) => !category.orphaned);
    return {
      categories: command.postType
        ? pruneByPostType(tree, command.postType)
        : tree,
    };
  }
}
