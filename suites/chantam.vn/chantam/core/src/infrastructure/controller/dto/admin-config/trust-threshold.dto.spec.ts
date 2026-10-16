import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import {
  SetGiverAccuracyThresholdBodyDto,
  SetReportAbuseThresholdBodyDto,
} from './trust-threshold.dto';

function errorsOf(cls: new () => object, body: unknown): string[] {
  const flatten = (
    errors: ReturnType<typeof validateSync>,
    prefix = '',
  ): string[] =>
    errors.flatMap((error) => [
      ...Object.keys(error.constraints ?? {}).map(
        (rule) => `${prefix}${error.property}:${rule}`,
      ),
      ...flatten(error.children ?? [], `${prefix}${error.property}.`),
    ]);
  return flatten(validateSync(plainToInstance(cls, body)));
}

describe('trust-threshold DTO (CMS A13)', () => {
  it('nhận bộ số hợp lệ', () => {
    expect(
      errorsOf(SetGiverAccuracyThresholdBodyDto, {
        giverAccuracy: {
          minSamples: 5,
          reviewThresholdPercent: 75,
          reason: 'Giữ mặc định',
        },
      }),
    ).toEqual([]);
  });

  it('ngoài khoảng thì từ chối, KHÔNG lặng lẽ kẹp', () => {
    expect(
      errorsOf(SetGiverAccuracyThresholdBodyDto, {
        giverAccuracy: {
          minSamples: 101,
          reviewThresholdPercent: -1,
          reason: 'Thử',
        },
      }),
    ).toEqual(
      expect.arrayContaining([
        'giverAccuracy.minSamples:max',
        'giverAccuracy.reviewThresholdPercent:min',
      ]),
    );
  });

  it('số lẻ và thiếu lý do đều bị từ chối', () => {
    expect(
      errorsOf(SetReportAbuseThresholdBodyDto, {
        reportAbuse: { minReports: 2.5, dismissedRatioPercent: 80 },
      }),
    ).toEqual(
      expect.arrayContaining([
        'reportAbuse.minReports:isInt',
        'reportAbuse.reason:isLength',
      ]),
    );
  });
});
