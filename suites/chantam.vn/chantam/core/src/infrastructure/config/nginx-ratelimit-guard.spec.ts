import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { ConfigSchema } from './config.schema';

/**
 * Cấu hình chặn tốc độ ở Nginx phải nhất quán với trần của app (F66).
 *
 * ## Bất biến quan trọng nhất: Nginx KHÔNG được là bên trả lời
 *
 * Trần chính nằm ở tầng app. Lý do không phải sở thích kiến trúc:
 *
 * **Nginx trả một trang HTML, app trả JSON có `errorCode`.** Client mobile code
 * theo cặp `(errorOrigin, errorCode)`; một trang HTML 429 thì nó không phân tích
 * được, và người dùng thấy một lỗi không rõ nghĩa thay vì "thử lại sau N giây".
 *
 * Nên ngưỡng Nginx phải CAO HƠN HẲN ngưỡng app, và phép kiểm dưới đây canh đúng
 * quan hệ đó. Hạ `rate` ở Nginx xuống dưới `GLOBAL_RATE_LIMIT_PER_MINUTE` là
 * chuyển quyền trả lỗi từ app sang Nginx mà không ai định — nó không làm gì đỏ
 * trên host, chỉ làm client nhận một lỗi nó không đọc được.
 *
 * ## Vì sao canh cả Socket.io
 *
 * Chat dùng Socket.io. Khi WebSocket không nâng cấp được, nó rơi về long-polling
 * và sinh rất nhiều lượt request hợp lệ — nên một `limit_req` đặt lên đường đó sẽ
 * chẹn đúng chat chứ không chẹn kẻ lụt. Trước bản F66, vhost KHÔNG có
 * `proxy_set_header Upgrade`, và ghi chú trong file còn nói "Chân Tâm hiện là
 * REST API", tức chat đã chạy ở chế độ long-polling trên staging mà không ai ghi
 * lại điều đó.
 *
 * ## Phép kiểm này là lớp RẺ; lớp đắt nằm ở `scripts/test-nginx-config.sh`
 *
 * Đây là phép kiểm VĂN BẢN: nó chạy ở mọi lượt `npm test`, trong một giây, không
 * cần Docker. Nó chứng minh các zone được dùng đều đã khai, quan hệ ngưỡng đúng,
 * và hai khối server không lệch nhau — những thứ `nginx -t` KHÔNG kiểm, vì với
 * Nginx thì một ngưỡng đặt sai vẫn là một cấu hình hợp lệ.
 *
 * Nó KHÔNG chứng minh cấu hình khởi động được. Việc đó do
 * `scripts/test-nginx-config.sh` làm: nó chạy `nginx -t` thật trong Docker trên
 * chính hai file này.
 *
 * Hai lớp bắt hai họ lỗi khác nhau, và không lớp nào thay được lớp kia. Bằng chứng
 * đo được 05/10: lượt chạy `nginx -t` đầu tiên lộ ra rằng Nginx NẠP và kiểm tham
 * số DH ngay lúc test cấu hình (`dh key too small` với file 1024 bit) — một điều
 * không phép kiểm văn bản nào phát hiện được. Ngược lại, hạ `rate` xuống dưới trần
 * của app vẫn cho một cấu hình `nginx -t` hoàn toàn xanh.
 */

function findRepoRoot(): string {
  let current = __dirname;
  for (let depth = 0; depth < 12; depth += 1) {
    try {
      readFileSync(join(current, 'deploy', 'docker-compose.yml'));
      return current;
    } catch {
      current = dirname(current);
    }
  }
  throw new Error('không tìm được gốc repo từ ' + __dirname);
}

const NginxDir = join(findRepoRoot(), 'deploy', 'nginx');
const zones = readFileSync(
  join(NginxDir, 'chantam-ratelimit.conf.example'),
  'utf8',
);
const vhost = readFileSync(join(NginxDir, 'chantam.conf.example'), 'utf8');

/** Trần của app, đổi về lượt mỗi giây để so cùng đơn vị với Nginx. */
function appLimitPerSecond(): number {
  const described = ConfigSchema.describe().keys?.GLOBAL_RATE_LIMIT_PER_MINUTE;
  const perMinute = (described as { flags?: { default?: unknown } })?.flags
    ?.default;
  if (typeof perMinute !== 'number')
    throw new Error('không đọc được mặc định GLOBAL_RATE_LIMIT_PER_MINUTE');
  return perMinute / 60;
}

/** `{ tên zone: lượt mỗi giây }` từ các dòng `limit_req_zone`. */
function declaredZones(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const match of zones.matchAll(
    /limit_req_zone\s+\S+\s+zone=(\w+):\d+[a-z]+\s+rate=(\d+)r\/(s|m)\s*;/g,
  )) {
    const perSecond =
      match[3] === 's' ? Number(match[2]) : Number(match[2]) / 60;
    out[match[1]] = perSecond;
  }
  return out;
}

describe('Chặn tốc độ ở Nginx (F66)', () => {
  const declared = declaredZones();

  it('khai được cả hai zone, và đọc được chúng', () => {
    // Thiếu phép kiểm này thì một regex sai làm mọi phép dưới xanh vì so hai tập
    // rỗng — một phép kiểm luôn xanh.
    expect(Object.keys(declared).sort()).toEqual([
      'chantam_auth',
      'chantam_general',
    ]);
  });

  it('mọi zone vhost dùng đều đã được khai', () => {
    const used = [...vhost.matchAll(/limit_req\s+zone=(\w+)/g)].map(
      (m) => m[1],
    );
    expect(used.length).toBeGreaterThan(0);

    const undeclared = [...new Set(used)].filter((zone) => !(zone in declared));
    expect(undeclared).toEqual([]);
  });

  it('zone kết nối và mã trả về đã khai', () => {
    expect(zones).toMatch(/limit_conn_zone\s+\S+\s+zone=chantam_conn:/);
    // 503 mặc định nghĩa "server đang hỏng" và client sẽ thử lại NGAY; 429 là mã
    // app cũng dùng, nên client xử một đường cho cả hai tầng.
    expect(zones).toMatch(/limit_req_status\s+429\s*;/);
    expect(zones).toMatch(/limit_conn_status\s+429\s*;/);

    const usedConnZones = [
      ...new Set([...vhost.matchAll(/limit_conn\s+(\w+)/g)].map((m) => m[1])),
    ];
    expect(usedConnZones).toEqual(['chantam_conn']);
  });

  it('ngưỡng Nginx CAO HƠN trần của app — app phải là bên trả lỗi', () => {
    const appPerSecond = appLimitPerSecond();
    expect(appPerSecond).toBeGreaterThan(0);

    for (const [zone, perSecond] of Object.entries(declared))
      expect({ zone, perSecond, appPerSecond }).toEqual({
        zone,
        perSecond: expect.any(Number),
        appPerSecond,
      });

    // Zone chung phải cao hơn hẳn: nó phủ đúng những đường mà trần app áp lên.
    expect(declared.chantam_general).toBeGreaterThan(appPerSecond);
  });

  describe('Socket.io cho chat', () => {
    it('`map $connection_upgrade` được khai trước khi dùng', () => {
      expect(zones).toMatch(/map\s+\$http_upgrade\s+\$connection_upgrade\s*\{/);
      // Dùng biến chưa khai là Nginx TỪ CHỐI khởi động, nên quan hệ này phải chắc.
      expect(vhost).toMatch(/\$connection_upgrade/);
    });

    it('có khối riêng ở CẢ HAI môi trường, không chỉ một', () => {
      const blocks = [
        ...vhost.matchAll(/^ *location\s+\^~\s+\/socket\.io\/\s*\{/gm),
      ];
      // Hai khối server: staging 8080 và production 8085. Chỉ sửa một bên là chat
      // chạy ở môi trường này và hỏng ở môi trường kia — kiểu lệch khó thấy nhất.
      expect(blocks).toHaveLength(2);
    });

    it('nâng cấp WebSocket và KHÔNG bị chặn tốc độ', () => {
      for (const block of extractLocationBlocks(vhost, '/socket.io/')) {
        expect(block).toMatch(
          /proxy_set_header\s+Upgrade\s+\$http_upgrade\s*;/,
        );
        expect(block).toMatch(
          /proxy_set_header\s+Connection\s+\$connection_upgrade\s*;/,
        );
        // Long-polling sinh rất nhiều lượt hợp lệ; chặn ở đây là chẹn chính chat.
        expect(block).not.toMatch(/limit_req\s+zone=/);
        // Một kết nối đang CHỜ tin nhắn không có byte nào chạy qua, nên 60s như
        // REST sẽ cắt nó mỗi phút và client phải nối lại liên tục.
        expect(block).toMatch(/proxy_read_timeout\s+(\d{3,})s\s*;/);
      }
    });
  });

  describe('hai khối server không lệch nhau', () => {
    it('cả hai đều chặn đường xác thực bằng zone chặt hơn', () => {
      const authBlocks = extractLocationBlocks(vhost, '/api/v1/auth/');
      expect(authBlocks).toHaveLength(2);
      for (const block of authBlocks)
        expect(block).toMatch(/limit_req\s+zone=chantam_auth\b/);
    });

    it('cả hai đều chặn đường còn lại bằng zone chung', () => {
      const rootBlocks = [
        ...vhost.matchAll(/^ *location\s+\/\s*\{([\s\S]*?)\n {4}\}/gm),
      ]
        .map((m) => m[1])
        // Hai khối `location /` còn lại là redirect HTTP→HTTPS: chúng không
        // proxy gì nên không cần chặn tốc độ. Lọc theo `proxy_pass` thay vì
        // đếm mù — đếm mù là cách phép kiểm này vừa đỏ oan một lượt.
        .filter((block) => block.includes('proxy_pass'));
      expect(rootBlocks).toHaveLength(2);
      for (const block of rootBlocks)
        expect(block).toMatch(/limit_req\s+zone=chantam_general\b/);
    });
  });
});

/** Thân của mọi khối `location ^~ <prefix> { ... }`. */
function extractLocationBlocks(source: string, prefix: string): string[] {
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return [
    ...source.matchAll(
      new RegExp(
        `^ *location\\s+\\^~\\s+${escaped}\\s*\\{([\\s\\S]*?)\\n {4}\\}`,
        'gm',
      ),
    ),
  ].map((match) => match[1]);
}
