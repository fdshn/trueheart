import { MaxDharmaCategoryLength } from '@chantam.vn/chantam.core-lib/models';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import {
  ListDharmaContentsQueryDto,
  PatchDharmaContentDto,
  WriteDharmaContentDto,
} from './dharma.dto';

const categoryErrors = (cls: new () => object, category: string) =>
  validateSync(plainToInstance(cls, { category }), {
    skipMissingProperties: true,
  }).filter((error) => error.property === 'category').length;

describe('category Phật pháp: DTO khớp trần 50 của core-lib (CMS backlog C4)', () => {
  // Trước đây DTO cho 200 trong khi core-lib cắt về 50 — 120 ký tự được nhận rồi lặng lẽ
  // bị cắt. Giờ quá trần là 400 rõ ràng.
  const atLimit = 'a'.repeat(MaxDharmaCategoryLength);
  const overLimit = 'a'.repeat(MaxDharmaCategoryLength + 1);

  it.each([
    ['tạo', WriteDharmaContentDto],
    ['sửa', PatchDharmaContentDto],
    ['lọc', ListDharmaContentsQueryDto],
  ] as const)('%s: đúng trần thì nhận, quá trần thì 400', (_name, cls) => {
    expect(categoryErrors(cls, atLimit)).toBe(0);
    expect(categoryErrors(cls, overLimit)).toBe(1);
  });
});
