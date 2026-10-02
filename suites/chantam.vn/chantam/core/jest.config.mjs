import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathsToModuleNameMapper } from 'ts-jest';

const tsconfig = JSON.parse(
  readFileSync(join(process.cwd(), 'tsconfig.json'), 'utf-8'),
);

// rootDir của Jest là `src`, còn path alias trong tsconfig tính từ gốc package —
// bỏ tiền tố `./src/` để hai bên khớp nhau.
const strippedPaths = Object.fromEntries(
  Object.entries(tsconfig.compilerOptions.paths ?? {}).map(([key, values]) => [
    key,
    values.map((value) => value.replace(/^\.\/src\/?/, '')),
  ]),
);

export default {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\.spec\.ts$',
  /**
   * Sáu gói trong cây `sanitize-html` chỉ xuất ESM (`"type": "module"`).
   *
   * Node 22 `require()` được ESM nên **runtime không sao** — `node dist/main` chạy bình
   * thường. Nhưng Jest nạp module bằng đường CommonJS riêng của nó, nên gặp `import` là
   * ném `Cannot use import statement outside a module`.
   *
   * Hai dòng dưới đây cho ts-jest hạ cấp đúng sáu gói đó về CommonJS. Cách này không thêm
   * `babel-jest` — nhánh đó cần thêm hai dev dependency và một file cấu hình nữa.
   *
   * Danh sách liệt kê TƯỜNG MINH, không dùng `(?!)` rộng: một `transformIgnorePatterns`
   * bao cả `node_modules` sẽ biên dịch lại hàng nghìn file mỗi lượt chạy test.
   */
  transformIgnorePatterns: [
    'node_modules/(?!(htmlparser2|domhandler|domutils|domelementtype|entities|dom-serializer)/)',
  ],
  transform: {
    '^.+\.ts$': 'ts-jest',
    '^.+\.js$': [
      'ts-jest',
      { tsconfig: { allowJs: true, module: 'commonjs', target: 'es2022' } },
    ],
  },
  collectCoverageFrom: ['**/*.ts'],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
  moduleNameMapper: pathsToModuleNameMapper(strippedPaths, {
    prefix: '<rootDir>/',
  }),
};
