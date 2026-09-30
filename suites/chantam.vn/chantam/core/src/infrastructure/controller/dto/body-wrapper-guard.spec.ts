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
 *
 * ## Lỗ trong chính phép kiểm này, bịt 30/09
 *
 * Bản đầu chỉ soát những thuộc tính ĐÃ CÓ `@ValidateNested()` + `@Type()` và hỏi
 * chúng có `@IsDefined()` chưa. Nên một wrapper KHÔNG có decorator nào thì nó
 * không thấy — mà đó mới là ca nặng hơn: không chỉ body rỗng đi qua được, mà mọi
 * decorator BÊN TRONG cũng bị bỏ qua, nghĩa là cả một endpoint không hề được
 * validate.
 *
 * Ba wrapper của nhóm ở đúng tình trạng đó, và tôi chỉ phát hiện khi gọi thật
 * `POST /groups` — phép kiểm cũ vẫn xanh. Nên nay soát thêm chiều kia: mọi thuộc
 * tính trong một class `*BodyDto` mà kiểu là một DTO khác thì phải có đủ bộ ba.
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

/** Thuộc tính trong `*BodyDto` mà kiểu là một DTO khác — tức một wrapper. */
interface BodyWrapper {
  file: string;
  className: string;
  property: string;
  type: string;
  optional: boolean;
  validated: boolean;
  guarded: boolean;
  typed: boolean;
}

/**
 * Decorator TỪ CHỐI `undefined`.
 *
 * `@IsDefined()` là cách tường minh, nhưng không phải cách duy nhất:
 * `@IsArray()` trên một wrapper mảng cũng báo lỗi khi giá trị là `undefined`, nên
 * đòi thêm `@IsDefined()` ở đó là báo oan — và một phép kiểm báo oan thì sớm muộn
 * bị tắt.
 *
 * `@ValidateNested()` cố ý KHÔNG nằm đây: nó im lặng cho `undefined` đi qua, và
 * đó chính là cái bẫy mà cả file này sinh ra để canh.
 */
const RejectsUndefined = [
  '@IsDefined()',
  '@IsArray()',
  '@ArrayNotEmpty()',
  '@IsNotEmpty()',
  '@IsObject()',
];

const BodyDtoClass = /export class (\w*BodyDto)\s*\{([\s\S]*?)\n\}/g;
const ClassProperty =
  /((?:[ \t]*@[A-Za-z]+\([\s\S]*?\)[ \t]*\n)+)[ \t]*(\w+)(\??):\s*([\w[\]]+)/g;

function findBodyWrappers(
  sources: { file: string; source: string }[],
): BodyWrapper[] {
  const found: BodyWrapper[] = [];

  for (const { file, source } of sources) {
    BodyDtoClass.lastIndex = 0;

    let classMatch = BodyDtoClass.exec(source);
    while (classMatch !== null) {
      const [, className, body] = classMatch;
      ClassProperty.lastIndex = 0;

      let propMatch = ClassProperty.exec(body);
      while (propMatch !== null) {
        const [, decorators, property, optional, type] = propMatch;
        const bare = type.replace('[]', '');

        // Chỉ những thuộc tính trỏ vào một DTO khác. Trường vô hướng
        // (`changeReason: string`) không phải wrapper.
        if (bare.endsWith('Dto'))
          found.push({
            file,
            className,
            property,
            type,
            optional: optional === '?' || decorators.includes('@IsOptional()'),
            validated: decorators.includes('@ValidateNested'),
            guarded: RejectsUndefined.some((decorator) =>
              decorators.includes(decorator),
            ),
            typed: decorators.includes('@Type('),
          });

        propMatch = ClassProperty.exec(body);
      }

      classMatch = BodyDtoClass.exec(source);
    }
  }

  return found;
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

  it('bộ dò wrapper nhận ra một wrapper KHÔNG có decorator nào', () => {
    // Đây là ca mà phép kiểm cũ không thấy, và là ca nặng hơn: không chỉ body
    // rỗng đi qua được, mà mọi decorator BÊN TRONG cũng bị bỏ qua.
    const undecorated = [
      {
        file: 'gia-dinh.dto.ts',
        source: [
          'export class XBodyDto {',
          '  @ApiProperty({ type: () => XDto })',
          '  payload: XDto;',
          '}',
        ].join('\n'),
      },
    ];

    const [found] = findBodyWrappers(undecorated);
    expect(found.validated).toBe(false);
    expect(found.typed).toBe(false);
    expect(found.guarded).toBe(false);
  });

  it('bộ dò KHÔNG coi trường vô hướng là wrapper', () => {
    // `changeReason: string` trong một `*BodyDto` là trường thường, không phải
    // khoá bọc — đòi `@ValidateNested()` ở đó là vô nghĩa.
    const scalar = [
      {
        file: 'gia-dinh.dto.ts',
        source: [
          'export class XBodyDto {',
          '  @ApiProperty()',
          '  @IsString()',
          '  changeReason: string;',
          '}',
        ].join('\n'),
      },
    ];

    expect(findBodyWrappers(scalar)).toHaveLength(0);
  });

  it('bộ dò chấp nhận @ValidateNested({ each: true }) cho mảng', () => {
    // Wrapper kiểu mảng dùng dạng có tham số. Coi nó là vi phạm thì phép kiểm
    // báo oan và người ta sẽ tắt phép kiểm.
    const arrayCase = [
      {
        file: 'gia-dinh.dto.ts',
        source: [
          'export class XBodyDto {',
          '  @ApiProperty({ type: () => [YDto] })',
          '  @IsArray()',
          '  @ValidateNested({ each: true })',
          '  @Type(() => YDto)',
          '  items: YDto[];',
          '}',
        ].join('\n'),
      },
    ];

    const [found] = findBodyWrappers(arrayCase);
    expect(found.validated).toBe(true);
    expect(found.typed).toBe(true);
    // `@IsArray()` đã chặn undefined — không đòi thêm `@IsDefined()`.
    expect(found.guarded).toBe(true);
  });

  it('MỌI khoá bọc trong *BodyDto đều được validate thật sự', () => {
    // Ba điều kiện, ba lỗi khác nhau nếu thiếu: không `@ValidateNested` thì
    // validation không đi vào trong; không `@Type` thì bên trong là object trần
    // và decorator bên trong bị bỏ qua; không `@IsDefined` thì body thiếu khoá
    // bọc thành 500.
    const offenders = findBodyWrappers(sources)
      .filter(
        (entry) =>
          !entry.validated ||
          !entry.typed ||
          (!entry.optional && !entry.guarded),
      )
      .map(
        (entry) =>
          `${entry.file}: ${entry.className}.${entry.property} (thiếu ${[
            entry.validated ? '' : '@ValidateNested',
            entry.typed ? '' : '@Type',
            entry.optional || entry.guarded
              ? ''
              : 'một decorator từ chối undefined (@IsDefined/@IsArray)',
          ]
            .filter(Boolean)
            .join(' + ')})`,
      );

    expect(offenders).toEqual([]);
  });

  it('quét ra một số wrapper hợp lý — bộ dò không im lặng trả rỗng', () => {
    expect(findBodyWrappers(sources).length).toBeGreaterThan(10);
  });
});
