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
    const responseMetadata = Reflect.getMetadata(
      ApiModelProperties,
      GetOwnRankSummaryResponseDto.prototype,
      'rank',
    );
    const nextRankMetadata = Reflect.getMetadata(
      ApiModelProperties,
      RankSummaryDto.prototype,
      'nextRank',
    );
    const maintenanceCycleMetadata = Reflect.getMetadata(
      ApiModelProperties,
      RankSummaryDto.prototype,
      'maintenanceCycle',
    );

    expect(responseMetadata).toMatchObject({ type: expect.any(Function) });
    expect(responseMetadata.type()).toBe(RankSummaryDto);
    expect(nextRankMetadata).toMatchObject({
      nullable: true,
      required: false,
      type: expect.any(Function),
    });
    expect(nextRankMetadata.type()).toBe(RankNextProgressDto);
    expect(maintenanceCycleMetadata).toMatchObject({
      nullable: true,
      required: false,
      type: expect.any(Function),
    });
    expect(maintenanceCycleMetadata.type()).toBe(RankMaintenanceCycleDto);
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
