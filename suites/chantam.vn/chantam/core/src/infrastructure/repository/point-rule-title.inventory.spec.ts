import { PointRuleTitles } from '@chantam.vn/chantam.core-lib/models';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Mọi mã rule mà mã nguồn GHI vào sổ điểm đều phải có tiêu đề trong `PointRuleTitles`.
 *
 * Thiếu tên thì `pointRuleTitle` trả nguyên mã, nên không có gì đổ — người dùng chỉ
 * lặng lẽ thấy `GIFT_SOMETHING_NEW` trong lịch sử điểm của mình. Quét mã nguồn thay vì
 * chép tay danh sách: một danh sách chép tay mục đúng lúc có người thêm rule mới.
 *
 * Bắt hai dạng ghi mã đang có trong code: `ruleCode: 'XYZ'` và một hằng
 * `…RuleCode = 'XYZ'` được truyền vào `ruleCode`.
 */

// Hai gốc: một nửa hằng `…RuleCode` khai ở `core-lib` (điểm danh, quà, phạt), nửa
// còn lại và mọi literal `ruleCode: '…'` ở `core`. Quét mỗi `core` thì sót mười mã.
const SourceRoots = [
  join(__dirname, '..', '..'),
  join(__dirname, '..', '..', '..', '..', 'core-lib', 'src'),
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory())
      return name === 'migrations' ? [] : sourceFiles(path);
    return name.endsWith('.ts') && !name.endsWith('.spec.ts') ? [path] : [];
  });
}

function writtenRuleCodes(): Set<string> {
  const codes = new Set<string>();
  for (const file of SourceRoots.flatMap(sourceFiles)) {
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(/ruleCode:\s*'([A-Z_]+)'/g))
      codes.add(match[1]);
    for (const match of text.matchAll(/RuleCode\s*=\s*'([A-Z_]+)'/g))
      codes.add(match[1]);
  }
  return codes;
}

describe('PointRuleTitles phủ mọi mã rule được ghi vào sổ điểm', () => {
  const codes = writtenRuleCodes();

  it('quét ra được mã — một regex hỏng cho ra tập rỗng và phép kiểm xanh giả', () => {
    expect(codes.size).toBeGreaterThanOrEqual(20);
    expect(codes.has('GIFT_COMPLETED_GIVER')).toBe(true);
    expect(codes.has('CHECK_IN_DAILY')).toBe(true);
    expect(codes.has('REVERSAL')).toBe(true);
  });

  it('không mã nào thiếu tiêu đề', () => {
    expect([...codes].filter((code) => !(code in PointRuleTitles))).toEqual([]);
  });
});
