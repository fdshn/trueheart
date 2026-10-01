import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';

/**
 * Route TĨNH phải khai TRƯỚC route tham số cùng độ sâu.
 *
 * ## Vì sao cần một phép kiểm cơ học
 *
 * Nest khớp route theo **thứ tự khai**. Để `@Get(':postId')` trước `@Get('nearby')` thì
 * `nearby` bị nuốt thành một `postId`, và client gọi một đường dẫn CÓ THẬT lại nhận lỗi
 * validate "postId must be a UUID".
 *
 * Nó hỏng **im lặng ở tầng biên dịch và ở tầng unit test**: cả hai route đều tồn tại, cả
 * hai handler đều có test riêng xanh. Chỉ một lượt gọi HTTP đúng đường dẫn đó mới phát
 * hiện — tức chỉ smoke test, và chỉ nếu smoke có chạm đúng route ấy.
 *
 * Hai cái bẫy cùng loại đã có phép kiểm cơ học: `body-wrapper-guard.spec.ts` và
 * `update-returning-guard.spec.ts`. Đây là cái thứ ba. Lúc thêm (01/10), toàn bộ 42
 * controller đều đúng — nên nó chốt lại một trạng thái sạch, không mở ra một đợt dọn.
 *
 * ## Vì sao phải BỎ COMMENT trước khi quét
 *
 * `admin-report.controller.ts` có một comment *"Đặt TRƯỚC `@Get(':reportId')`…"* nằm NGAY
 * TRÊN `@Get('reporters')`. Bản đầu của phép kiểm này đọc cả comment, nên nó thấy
 * `:reportId` ở vị trí sớm hơn và báo oan đúng cái file đã làm đúng.
 *
 * Một phép kiểm hay báo oan còn tệ hơn không có: lần thứ hai nó đỏ, người ta sẽ tắt nó.
 */
function stripComments(source: string): string {
  let result = '';
  let index = 0;

  while (index < source.length) {
    if (source.startsWith('//', index)) {
      const end = source.indexOf('\n', index);
      const stop = end === -1 ? source.length : end;
      // Thay bằng khoảng trắng cùng độ dài để VỊ TRÍ các decorator không xê dịch.
      result += ' '.repeat(stop - index);
      index = stop;
    } else if (source.startsWith('/*', index)) {
      const end = source.indexOf('*/', index + 2);
      const stop = end === -1 ? source.length : end + 2;
      result += source.slice(index, stop).replace(/[^\n]/g, ' ');
      index = stop;
    } else {
      result += source[index];
      index += 1;
    }
  }

  return result;
}

function listControllers(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const full = join(directory, name);
    if (statSync(full).isDirectory()) return listControllers(full);

    return name.endsWith('.controller.ts') ? [full] : [];
  });
}

interface IRoute {
  readonly verb: string;
  readonly path: string;
}

/** Route theo đúng thứ tự khai, nhóm theo HTTP verb. */
function readRoutes(source: string): Map<string, IRoute[]> {
  const byVerb = new Map<string, IRoute[]>();
  const pattern = /@(Get|Post|Patch|Put|Delete)\(\s*(?:'([^']*)')?\s*\)/g;

  for (const match of stripComments(source).matchAll(pattern)) {
    const verb = match[1];
    const list = byVerb.get(verb) ?? [];
    list.push({ verb, path: match[2] ?? '' });
    byVerb.set(verb, list);
  }

  return byVerb;
}

/**
 * `earlier` có nuốt `later` không?
 *
 * Chỉ so hai route CÙNG SỐ ĐOẠN: `:a/b` không bao giờ nuốt `x` vì khác độ sâu. Và chỉ
 * tính khi `earlier` có ít nhất một đoạn tham số ở chỗ `later` có đoạn tĩnh.
 */
function swallows(earlier: string, later: string): boolean {
  const left = earlier.split('/');
  const right = later.split('/');
  if (left.length !== right.length) return false;

  let shadowsOne = false;
  for (const [index, segment] of left.entries()) {
    const other = right[index];
    if (segment === other) continue;
    if (!segment.startsWith(':')) return false;
    if (other.startsWith(':')) return false;
    shadowsOne = true;
  }

  return shadowsOne;
}

describe('Thứ tự khai route', () => {
  const controllers = listControllers(__dirname);

  it('tìm được controller để quét', () => {
    // Thiếu phép kiểm này thì một lần đổi cấu trúc thư mục làm danh sách rỗng, và một
    // vòng lặp trên mảng rỗng thì luôn xanh.
    expect(controllers.length).toBeGreaterThan(30);
  });

  it('không route tham số nào đứng trước route tĩnh cùng độ sâu', () => {
    const offences: string[] = [];

    for (const file of controllers)
      for (const routes of readRoutes(readFileSync(file, 'utf8')).values())
        for (const [index, earlier] of routes.entries())
          for (const later of routes.slice(index + 1))
            if (swallows(earlier.path, later.path))
              offences.push(
                `${basename(file)}: @${earlier.verb}('${earlier.path}') ` +
                  `khai trước @${later.verb}('${later.path}') nên sẽ nuốt route sau`,
              );

    expect(offences).toEqual([]);
  });
});

describe('stripComments', () => {
  it('giữ nguyên độ dài để vị trí decorator không xê dịch', () => {
    const source = "// @Get(':id')\n@Get('nearby')";
    expect(stripComments(source)).toHaveLength(source.length);
    expect(stripComments(source)).not.toContain(':id');
    expect(stripComments(source)).toContain("@Get('nearby')");
  });

  it('bỏ cả comment khối nhiều dòng', () => {
    const source = "/* @Get(':id')\n   vẫn trong comment */\n@Get('map')";
    expect(stripComments(source)).not.toContain(':id');
    expect(stripComments(source)).toContain("@Get('map')");
  });
});

describe('swallows', () => {
  it('route tham số nuốt route tĩnh cùng độ sâu', () => {
    expect(swallows(':postId', 'nearby')).toBe(true);
    // Đoạn sau phải KHỚP, không chỉ cùng số đoạn.
    expect(swallows(':postId/requests', 'me/requests')).toBe(true);
  });

  it('khác nhau ở một đoạn TĨNH thì không nuốt', () => {
    // `:id/review` không nuốt `me/summary`: Nest không khớp `summary` vào `review`.
    // Kỳ vọng đầu của chính phép kiểm này đã sai ở đúng chỗ này, nên giữ lại làm mốc:
    // báo oan vì so quá rộng cũng là một cách làm phép kiểm bị tắt.
    expect(swallows(':id/review', 'me/summary')).toBe(false);
  });

  it('khác độ sâu thì không nuốt', () => {
    expect(swallows(':postId', 'a/b')).toBe(false);
  });

  it('route tĩnh không nuốt gì', () => {
    expect(swallows('nearby', ':postId')).toBe(false);
  });

  it('hai route tham số không coi là nuốt nhau', () => {
    expect(swallows(':a', ':b')).toBe(false);
  });
});
