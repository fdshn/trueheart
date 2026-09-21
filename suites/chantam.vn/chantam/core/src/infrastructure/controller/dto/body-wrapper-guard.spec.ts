import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Thuộc tính bọc body BẮT BUỘC phải có `@IsDefined()`.
 *
 * INVARIANTS §6 quy định mọi body đi trong một khoá bọc: `{ registration: {...} }`.
 * Nhưng `@ValidateNested()` **không** chặn `undefined` — class-validator bỏ qua
 * giá trị undefined trừ khi có `@IsDefined()`. Thiếu khoá bọc thì validation cho
 * qua, use case đọc `command.registration.username` và nổ `TypeError`, và client
 * nhận **500** cho một request sai định dạng.
 *
 * Đã đo được: `POST /auth/register` với body `{}` trả 500, còn
 * `{"registration":{}}` trả 400 đúng. Mọi endpoint theo quy ước đó đều vướng.
 *
 * Thuộc tính TUỲ CHỌN thì không áp: thêm `@IsDefined()` vào `location?` là biến
 * trường tuỳ chọn thành bắt buộc, tức đổi hợp đồng API.
 */
function readDtoSources(): { file: string; source: string }[] {
  const root = join(__dirname);
  const out: { file: string; source: string }[] = [];

  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory)) {
      const path = join(directory, entry);
      if (statSync(path).isDirectory()) {
        walk(path);
        continue;
      }
      if (entry.endsWith('.dto.ts'))
        out.push({ file: entry, source: readFileSync(path, 'utf8') });
    }
  };

  walk(root);
  return out;
}

interface WrapperProperty {
  file: string;
  property: string;
  optional: boolean;
  guarded: boolean;
}

/** Khối decorator liền nhau, rồi tới tên thuộc tính. */
const DecoratedProperty =
  /((?:[ \t]*@[A-Za-z]+\([^\n]*\)[ \t]*\n)+)[ \t]*([A-Za-z_]\w*)(\??):/g;

function findWrapperProperties(
  sources: { file: string; source: string }[],
): WrapperProperty[] {
  const found: WrapperProperty[] = [];

  for (const { file, source } of sources) {
    // Regex có cờ `g` nên phải reset `lastIndex` giữa các file, nếu không file
    // thứ hai trở đi bị quét từ giữa và bỏ sót thuộc tính.
    DecoratedProperty.lastIndex = 0;

    let match = DecoratedProperty.exec(source);
    while (match !== null) {
      const [, decorators, property, optional] = match;

      const isWrapper =
        decorators.includes('@ValidateNested()') &&
        decorators.includes('@Type(');

      if (isWrapper)
        found.push({
          file,
          property,
          optional: optional === '?' || decorators.includes('@IsOptional()'),
          guarded: decorators.includes('@IsDefined()'),
        });

      match = DecoratedProperty.exec(source);
    }
  }

  return found;
}

describe('Thuộc tính bọc trong body DTO', () => {
  const sources = readDtoSources();

  it('tìm thấy file DTO để quét', () => {
    // Quét không ra file nào thì mọi khẳng định dưới đây đều vô nghĩa.
    expect(sources.length).toBeGreaterThan(10);
  });

  it('bộ dò nhận ra đúng mẫu vi phạm', () => {
    // Tự kiểm bộ dò: một phép kiểm luôn xanh vì không dò được gì thì vô dụng.
    const offending = [
      {
        file: 'gia-dinh.dto.ts',
        source: [
          'export class XBodyDto {',
          '  @ApiProperty({ type: () => XDto })',
          '  @ValidateNested()',
          '  @Type(() => XDto)',
          '  payload: XDto;',
          '}',
        ].join('\n'),
      },
    ];

    const found = findWrapperProperties(offending);
    expect(found).toHaveLength(1);
    expect(found[0].guarded).toBe(false);
    expect(found[0].optional).toBe(false);
  });

  it('bộ dò không nhầm thuộc tính tuỳ chọn thành vi phạm', () => {
    const optionalCase = [
      {
        file: 'gia-dinh.dto.ts',
        source: [
          'export class XDto {',
          '  @ApiPropertyOptional({ type: () => YDto })',
          '  @IsOptional()',
          '  @ValidateNested()',
          '  @Type(() => YDto)',
          '  location?: YDto;',
          '}',
        ].join('\n'),
      },
    ];

    expect(findWrapperProperties(optionalCase)[0].optional).toBe(true);
  });

  it('mọi thuộc tính bọc BẮT BUỘC đều có @IsDefined()', () => {
    const offenders = findWrapperProperties(sources)
      .filter((entry) => !entry.optional && !entry.guarded)
      .map((entry) => `${entry.file}: ${entry.property}`);

    expect(offenders).toEqual([]);
  });
});
