import { UserRanks } from '@chantam.vn/chantam.core-lib/consts';
import {
  GetOwnRankSummaryResponseDto,
  RankMaintenanceCycleDto,
  RankNextProgressDto,
  RankSummaryDto,
} from './rank.dto';

const ApiModelProperties = 'swagger/apiModelProperties';

describe('GetOwnRankSummaryResponseDto', () => {
  it('describes the nested owner rank summary response', () => {
    expect(
      Reflect.getMetadata(
        ApiModelProperties,
        GetOwnRankSummaryResponseDto.prototype,
        'rank',
      ),
    ).toMatchObject({ type: expect.any(Function) });

    expect(
      Reflect.getMetadata(
        ApiModelProperties,
        RankSummaryDto.prototype,
        'nextRank',
      ),
    ).toMatchObject({
      nullable: true,
      required: false,
      type: expect.any(Function),
    });
    expect(
      Reflect.getMetadata(
        ApiModelProperties,
        RankSummaryDto.prototype,
        'maintenanceCycle',
      ),
    ).toMatchObject({
      nullable: true,
      required: false,
      type: expect.any(Function),
    });
  });

  it('describes persisted rank, tier progress, and maintenance values', () => {
    expect(
      Reflect.getMetadata(ApiModelProperties, RankSummaryDto.prototype, 'rank'),
    ).toMatchObject({ enum: Object.values(UserRanks) });
    expect(
      Reflect.getMetadata(
        ApiModelProperties,
        RankNextProgressDto.prototype,
        'rank',
      ),
    ).toMatchObject({ enum: Object.values(UserRanks) });
    expect(
      Reflect.getMetadata(
        ApiModelProperties,
        RankMaintenanceCycleDto.prototype,
        'rank',
      ),
    ).toMatchObject({ enum: Object.values(UserRanks) });
    expect(
      Reflect.getMetadata(
        ApiModelProperties,
        RankMaintenanceCycleDto.prototype,
        'status',
      ),
    ).toMatchObject({ enum: ['OPEN', 'UNEVALUATED', 'SATISFIED', 'FAILED'] });
  });
});
