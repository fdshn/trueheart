import { plainToInstance } from 'class-transformer';
import { IsBoolean, IsOptional, validateSync } from 'class-validator';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { QueryBoolean } from './query-boolean';

class Probe {
  @IsOptional()
  @QueryBoolean()
  @IsBoolean()
  flag?: boolean;
}

function parse(flag: unknown) {
  const probe = plainToInstance(Probe, { flag });
  return { value: probe.flag, errors: validateSync(probe).length };
}

describe('QueryBoolean', () => {
  it("'false' là false — `@Type(() => Boolean)` biến nó thành true", () => {
    expect(parse('false')).toEqual({ value: false, errors: 0 });
    expect(parse('true')).toEqual({ value: true, errors: 0 });
  });

  it('boolean thật (body JSON) giữ nguyên', () => {
    expect(parse(false)).toEqual({ value: false, errors: 0 });
    expect(parse(true)).toEqual({ value: true, errors: 0 });
  });

  it('giá trị rác trả 400 chứ không bị nuốt thành false', () => {
    expect(parse('abc').errors).toBe(1);
    expect(parse('1').errors).toBe(1);
  });

  it('không gửi thì vẫn là không gửi', () => {
    expect(parse(undefined)).toEqual({ value: undefined, errors: 0 });
  });
});

describe('Không DTO nào còn dùng @Type(() => Boolean)', () => {
  // Query string luôn là chuỗi và `Boolean('false') === true`. Một lần thêm field mới
  // chép nhầm mẫu cũ là bộ lọc bật đúng lúc người dùng tắt nó.
  const dtoRoot = __dirname;
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return files(path);
      return name.endsWith('.ts') && !name.endsWith('.spec.ts') ? [path] : [];
    });

  it('dùng @QueryBoolean() thay thế', () => {
    const offenders = files(dtoRoot)
      // Chính file decorator nhắc mẫu cũ trong comment để giải thích vì sao bỏ nó.
      .filter((file) => !file.endsWith('query-boolean.ts'))
      .filter((file) =>
        /@Type\(\s*\(\)\s*=>\s*Boolean\s*\)/.test(readFileSync(file, 'utf8')),
      );
    expect(offenders).toEqual([]);
  });
});
