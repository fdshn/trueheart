import { PATH_METADATA } from '@nestjs/common/constants';
import 'reflect-metadata';
import { CharityOperationsController } from './charity-operations.controller';

describe('CharityOperationsController', () => {
  it('không còn route đợt trao (CR 22/11/2026: bỏ cơ chế trao theo đợt)', () => {
    const prototype =
      CharityOperationsController.prototype as unknown as Record<
        string,
        unknown
      >;
    const paths = Object.getOwnPropertyNames(prototype)
      .map((name) => prototype[name])
      .filter((handler) => typeof handler === 'function')
      .map(
        (handler) =>
          Reflect.getMetadata(PATH_METADATA, handler as object) as
            string | undefined,
      )
      .filter((path): path is string => typeof path === 'string');

    expect(paths.length).toBeGreaterThan(0);
    expect(paths.filter((path) => /round/i.test(path))).toEqual([]);
  });
});
