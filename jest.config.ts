import type { Config } from 'jest';
import { pathsToModuleNameMapper } from 'ts-jest';
import ts from 'typescript';

// Path aliases (e.g. the ones added by `nest g library`) live in tsconfig.json,
// so they are read from there instead of being duplicated here.
const { config: tsconfig } = ts.readConfigFile(
  './tsconfig.json',
  ts.sys.readFile,
);
const paths = tsconfig?.compilerOptions?.paths ?? {};

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    // TypeScript 6 wants an explicit rootDir next to outDir (TS5011); only for the tests, so
    // the build's output layout stays as it is.
    '^.+\\.(t|j)s$': [
      'ts-jest',
      { tsconfig: { ...tsconfig?.compilerOptions, rootDir: '.' } },
    ],
  },
  moduleNameMapper: {
    // The generated Prisma client imports its own files as './x.js'; Jest has to find './x.ts'.
    '^([.]{1,2}/.*)[.]js$': '$1',
    ...pathsToModuleNameMapper(paths, { prefix: '<rootDir>/' }),
  },
  collectCoverageFrom: [
    'src/**/*.(t|j)s',
    'libs/**/*.(t|j)s',
    'apps/**/*.(t|j)s',
  ],
  coverageDirectory: './coverage',
  testEnvironment: 'node',
};

export default config;
