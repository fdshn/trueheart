import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { ConfigSchema } from './config.schema';

/**
 * `.env.example` và `docker-compose.yml` phải khớp với `ConfigSchema`.
 *
 * ## Ba kiểu lệch, cả ba đo được trong repo này ngày 05/10
 *
 * `ConfigSchema` là danh sách có thẩm quyền của biến môi trường. Không ai canh nó
 * với hai file mẫu, nên cả ba kiểu lệch dưới đây đã xảy ra cùng lúc:
 *
 * **1. Biến có trong lược đồ mà thiếu ở file mẫu.** Sáu biến, tất cả thuộc nhóm an
 * ninh: `TRUST_PROXY`, `GLOBAL_RATE_LIMIT_PER_MINUTE`, `MAX_LOGIN_ATTEMPTS_PER_IP`,
 * `MAX_REGISTRATIONS_PER_IP`, `REGISTRATION_WINDOW_SECONDS`, `PHONE_HASH_PEPPER`.
 * Người dựng môi trường mới đọc file mẫu và không biết chúng tồn tại.
 *
 * **2. File mẫu bảo đặt một biến mà compose KHÔNG truyền vào container.**
 * `OTP_TTL_SECONDS` và `API_SERVERS` nằm trong `deploy/.env.example` nhưng không có
 * trong khối `environment` của service `core`. `bootstrap.sh` ghi `API_SERVERS` vào
 * `.env` rồi Swagger vẫn chỉ thấy localhost. Một file mẫu bảo người ta đặt một biến
 * vô hiệu còn tệ hơn không khai nó: nó làm người ta tin việc đã xong.
 *
 * **3. Compose truyền một biến mà file mẫu không khai.** `CONFIG_ENCRYPTION_KEY`.
 * Không ai biết phải đặt, nên Admin bấm lưu cấu hình SMTP và nó fail closed.
 *
 * ## Vì sao là phép kiểm chứ không phải một lượt sửa
 *
 * Lượt sửa 05/10 làm ba file khớp nhau. Nhưng biến môi trường được thêm mỗi khi có
 * phân hệ mới, và không có gì đỏ khi người thêm quên hai file mẫu — đúng lý do nó
 * lệch tới sáu biến mà không ai thấy. Phép kiểm này biến "quên" thành một lượt build
 * đỏ, chứ không phải một phát hiện sau sáu tháng.
 *
 * ## Vì sao đọc compose bằng dòng chứ không bằng thư viện YAML
 *
 * `js-yaml` có trong `node_modules` của repo nhưng là phụ thuộc GIÁN TIẾP, không
 * khai trong `package.json` của gói này. Dựa vào nó là dựa vào một thứ có thể biến
 * mất ở lượt `npm install` sau mà không ai đổi gì. Khối `environment` là các dòng
 * `KEY: giá trị` phẳng, nên đọc theo dòng là đủ và không mượn gì.
 */

/** Khoá chỉ dùng cho script, không phải cấu hình service. */
const ScriptOnlyKeys = new Set([
  // `npm run test:chat-e2e` gọi tới đích này.
  'CORE_URL',
  // Chốt an toàn của `npm run seed:demo`, cố ý KHÔNG nằm trong lược đồ service.
  'SEED_DEMO_DATA',
]);

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

const RepoRoot = findRepoRoot();

/** Khoá khai trong một file `.env`, tính cả dòng bị ghi chú `# KEY=`. */
function readEnvExampleKeys(path: string): Set<string> {
  const keys = new Set<string>();
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const match = /^\s*#?\s*([A-Z_][A-Z0-9_]*)=/.exec(line);
    if (match) keys.add(match[1]);
  }
  return keys;
}

/**
 * Khối `environment` của service `core` trong compose.
 *
 * Trả về cả tên khoá được đặt VÀ tên biến `${...}` được tham chiếu — hai thứ khác
 * nhau: `DATABASE_URI` là khoá, còn `POSTGRES_USER` bên trong nó là tham chiếu.
 */
function readComposeCoreEnvironment(): {
  keys: Set<string>;
  references: Set<string>;
} {
  const lines = readFileSync(
    join(RepoRoot, 'deploy', 'docker-compose.yml'),
    'utf8',
  ).split('\n');

  const serviceAt = lines.findIndex((line) => /^ {2}core:\s*$/.test(line));
  if (serviceAt < 0) throw new Error('không thấy service `core` trong compose');

  const environmentAt = lines.findIndex(
    (line, index) => index > serviceAt && /^ {4}environment:\s*$/.test(line),
  );
  if (environmentAt < 0)
    throw new Error('không thấy khối `environment` của service `core`');

  const keys = new Set<string>();
  const references = new Set<string>();

  for (let index = environmentAt + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.trim() === '') continue;
    // Thoát khối khi thụt lề trở về mức của `environment:` hoặc nông hơn.
    if (!/^ {6}/.test(line)) break;
    if (/^\s*#/.test(line)) continue;

    const entry = /^ {6}([A-Z_][A-Z0-9_]*):\s*(.*)$/.exec(line);
    if (!entry) continue;
    keys.add(entry[1]);
    for (const reference of entry[2].matchAll(/\$\{([A-Z_][A-Z0-9_]*)/g))
      references.add(reference[1]);
  }

  return { keys, references };
}

describe('Biến môi trường: lược đồ, file mẫu và compose phải khớp', () => {
  const schemaKeys = Object.keys(ConfigSchema.describe().keys ?? {});
  const coreExample = readEnvExampleKeys(
    join(__dirname, '..', '..', '..', '.env.example'),
  );
  const deployExample = readEnvExampleKeys(
    join(RepoRoot, 'deploy', '.env.example'),
  );
  const compose = readComposeCoreEnvironment();

  it('đọc được cả ba nguồn', () => {
    // Thiếu phép kiểm này, một đường dẫn sai làm mọi phép dưới xanh vì so hai tập
    // rỗng — một phép kiểm luôn xanh, đúng kiểu lỗi file này được viết ra để chặn.
    expect(schemaKeys.length).toBeGreaterThan(25);
    expect(coreExample.size).toBeGreaterThan(25);
    expect(deployExample.size).toBeGreaterThan(15);
    expect(compose.keys.size).toBeGreaterThan(15);
  });

  it('mọi khoá của ConfigSchema đều có trong core/.env.example', () => {
    const missing = schemaKeys.filter((key) => !coreExample.has(key));
    expect(missing).toEqual([]);
  });

  it('core/.env.example không khai khoá nào lược đồ không biết', () => {
    const unknown = [...coreExample].filter(
      (key) => !schemaKeys.includes(key) && !ScriptOnlyKeys.has(key),
    );
    expect(unknown).toEqual([]);
  });

  it('mọi biến app mà deploy/.env.example khai đều được compose truyền vào', () => {
    // Đây là phép kiểm chặn kiểu lệch thứ 2: file mẫu bảo đặt một biến vô hiệu.
    const declaredButNotPassed = [...deployExample].filter(
      (key) => schemaKeys.includes(key) && !compose.references.has(key),
    );
    expect(declaredButNotPassed).toEqual([]);
  });

  it('mọi biến app compose đọc đều được deploy/.env.example khai', () => {
    // Và đây là kiểu lệch thứ 3: compose đọc một biến không ai biết phải đặt.
    const passedButNotDocumented = [...compose.references].filter(
      (key) => schemaKeys.includes(key) && !deployExample.has(key),
    );
    expect(passedButNotDocumented).toEqual([]);
  });

  describe('`.env` do bootstrap.sh sinh ra', () => {
    // File mẫu là tài liệu; file NÀY là thứ chạy thật trên host. Ba biến dưới đây
    // hỏng hoàn toàn im lặng khi thiếu, nên chúng phải có mặt trong file được sinh
    // tự động, không phải chờ ai đọc tài liệu rồi nhớ ra.
    //
    // Chỉ canh ba biến này chứ không canh toàn bộ lược đồ: những biến còn lại có
    // mặc định an toàn trong compose, và đòi bootstrap liệt kê đủ ba mươi dòng chỉ
    // làm file sinh ra khó đọc mà không chặn thêm lỗi nào.
    const bootstrap = readFileSync(
      join(RepoRoot, 'deploy', 'bootstrap.sh'),
      'utf8',
    );

    it.each([
      ['TRUST_PROXY', 'bốn cái trần theo IP dồn vào một xô khi thiếu'],
      ['CONFIG_ENCRYPTION_KEY', 'Admin không lưu được secret nào khi thiếu'],
      ['PHONE_HASH_PEPPER', 'số điện thoại dò ngược được khi thiếu'],
    ])('đặt `%s` — %s', (key) => {
      expect(new RegExp('^' + key + '=', 'm').test(bootstrap)).toBe(true);
    });

    it.each(['CONFIG_ENCRYPTION_KEY', 'PHONE_HASH_PEPPER'])(
      'sinh `%s` ngẫu nhiên chứ không để trống',
      (key) => {
        // Đặt khoá bằng một dòng rỗng cũng khớp phép kiểm trên, nên phải đòi thêm
        // rằng nó được gán từ một lượt sinh ngẫu nhiên.
        expect(bootstrap).toMatch(
          new RegExp('^\\s*' + key + '=\\$\\(openssl rand', 'm'),
        );
      },
    );
  });
});
