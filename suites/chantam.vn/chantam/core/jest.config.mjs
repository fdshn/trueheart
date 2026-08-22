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
  transform: { '^.+\.ts$': 'ts-jest' },
  collectCoverageFrom: ['**/*.ts'],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
  moduleNameMapper: pathsToModuleNameMapper(strippedPaths, {
    prefix: '<rootDir>/',
  }),
};
