import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Mọi route `@Public()` phải nằm trong danh sách chốt dưới đây.
 *
 * ## Vì sao cần một phép kiểm cơ học
 *
 * Gắn nhầm `@Public()` lên một route là mở dữ liệu cho người chưa đăng nhập, và nó
 * hỏng IM LẶNG ở mọi tầng: build qua, unit test của use case qua (chúng không đi qua
 * guard), smoke test cũng qua vì smoke có token. Chỉ người lạ gọi thử mới thấy.
 *
 * Danh sách chép tay ở đây là CHỦ Ý: thêm một route công khai mới thì phép kiểm đỏ,
 * buộc người thêm ghi nó vào đây — tức trả lời "route này cho người lạ đọc gì".
 * Route dưới `/admin` thì không bao giờ được công khai, kể cả khi có trong danh sách.
 */
const ExpectedPublicRoutes = [
  // Đăng nhập, đăng ký, khôi phục mật khẩu — theo định nghĩa chưa có token.
  'POST /auth/login',
  'POST /auth/password-reset/confirm',
  'POST /auth/password-reset/request',
  'POST /auth/password-reset/verify-otp',
  'POST /auth/refresh',
  'POST /auth/register',
  // Khách chưa đăng nhập vẫn duyệt được bảng tin, bản đồ và bài đăng (toạ độ đã làm nhiễu).
  'GET /discovery/config',
  'GET /posts/:postId',
  'GET /posts/map',
  'GET /posts/nearby',
  'GET /posts/sos-urgent',
  'GET /posts/:subjectId/comments',
  'GET /posts/:subjectId/reactions',
  'GET /comments/:commentId/replies',
  'GET /gift-posts/:giftPostId',
  'GET /gift-posts/nearby',
  'GET /categories',
  'GET /profile/:username',
  // Nội dung biên tập công khai.
  'GET /blogs',
  'GET /blogs/:idOrSlug',
  'GET /campaigns',
  'GET /campaigns/:idOrSlug',
  'GET /campaigns/:idOrSlug/needs',
  'GET /dharma/contents',
  'GET /dharma/contents/:idOrSlug',
  'GET /dharma/dedications',
  'GET /dharma/hub',
  'GET /dharma/threads',
  'GET /dharma/threads/:id',
  'GET /dharma/threads/:subjectId/comments',
  'GET /dharma/threads/:subjectId/reactions',
  'GET /merit-units',
  'GET /merit-units/:idOrSlug',
  'GET /banners',
  // Đếm lượt bấm banner tài trợ — có cả khách chưa đăng nhập.
  'POST /banners/:id/click',
  'GET /config/home-layout',
  'GET /config/lunar-today',
  // Trang mời /invite/:code — người cầm link chưa có tài khoản.
  'GET /groups/invites/:inviteCode',
] as const;

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, (line) => ' '.repeat(line.length));
}

function controllerFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return controllerFiles(path);
    return name.endsWith('.controller.ts') ? [path] : [];
  });
}

const HttpVerb = /@(Get|Post|Put|Patch|Delete)\(\s*(?:'([^']*)')?\s*\)/;

/** `VERB /prefix/path` của mọi handler mang `@Public()`. */
function publicRoutes(): string[] {
  const root = join(__dirname);
  const routes: string[] = [];

  for (const file of controllerFiles(root)) {
    const source = stripComments(readFileSync(file, 'utf8'));
    // Một file có thể khai nhiều controller; chia theo từng `export class`. Decorator
    // CẤP CLASS (`@Public()`, `@Controller()`) nằm NGAY TRÊN `export class`, tức ở
    // đuôi đoạn trước — lấy từ chỗ class trước đóng (`\n}\n`) trở đi.
    const chunks = source.split(/(?=export class)/);
    for (let index = 1; index < chunks.length; index += 1) {
      const previous = chunks[index - 1];
      const header = previous.slice(previous.lastIndexOf('\n}\n') + 1);
      const section = chunks[index];
      // `@Controller()` không prefix cũng là controller — bỏ sót nó là bỏ sót đúng
      // các route bình luận/cảm xúc công khai.
      const controller = /@Controller\(\s*(?:'([^']*)')?\s*\)/.exec(header);
      if (!controller) continue;
      const prefix = controller[1] ?? '';
      // `@Public()` ở CẤP CLASS mở mọi route trong đó — phải tính, không thì cả
      // controller công khai mà danh sách này không thấy dòng nào.
      const classPublic = /@Public\(\)/.test(header);
      // Khối decorator của một handler: từ chỗ thân hàm trước đóng (`\n  }\n`, hoặc
      // `) {}` của constructor) tới chữ ký `public async x(` của handler này. Không
      // cắt theo `}` bất kỳ: `@ApiOperation({ ... })` cũng chứa dấu đó.
      const blocks = section.split(/\bpublic\s+(?:async\s+)?\w+\s*\(/);
      for (const block of blocks.slice(0, -1)) {
        const cut = Math.max(
          block.lastIndexOf('\n  }\n'),
          block.lastIndexOf(') {}\n'),
        );
        const decorators = block.slice(cut + 1);
        const verb = HttpVerb.exec(decorators);
        if (!verb) continue;
        if (!classPublic && !/@Public\(\)/.test(decorators)) continue;
        const path = [prefix, verb[2] ?? ''].filter(Boolean).join('/');
        routes.push(`${verb[1].toUpperCase()} /${path}`);
      }
    }
  }

  return routes.sort();
}

describe('Route công khai', () => {
  const found = publicRoutes();

  it('quét được route (không phải regex trượt hết)', () => {
    expect(found.length).toBeGreaterThan(20);
  });

  it('khớp đúng danh sách đã chốt — thêm route công khai phải khai ở đây', () => {
    expect(found).toEqual([...ExpectedPublicRoutes].sort());
  });

  it('không route nào dưới /admin được công khai', () => {
    expect(found.filter((route) => / \/admin(\/|$)/.test(route))).toEqual([]);
  });
});
