import { ForbiddenException } from '@chantam/service.common-lib/exception';
import { EvaluateDueRankMaintenanceResponseDto } from '../../dto/rank';
import { RankController } from './rank.controller';

function makeConfig(usernames = ['rank-operator']) {
  return { rankOperator: { usernames } };
}

describe('RankController maintenance trigger', () => {
  it('documents the maintenance result with the concrete processed-cycle response DTO', () => {
    const responses = Reflect.getMetadata(
      'swagger/apiResponse',
      RankController.prototype.evaluateDueRankMaintenance,
    );

    const bodyMetadata = Reflect.getMetadata(
      'swagger/apiModelProperties',
      responses[200].type.prototype,
      'body',
    );

    expect(bodyMetadata.type).toBe(EvaluateDueRankMaintenanceResponseDto);
  });

  it('rejects a non-operator before invoking evaluation', async () => {
    const summaryUseCase = { handle: jest.fn() };
    const evaluationUseCase = { handle: jest.fn() };
    const controller = new RankController(
      summaryUseCase as never,
      evaluationUseCase as never,
      makeConfig() as never,
    );

    await expect(
      controller.evaluateDueRankMaintenance({ username: 'member' } as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(evaluationUseCase.handle).not.toHaveBeenCalled();
  });

  it('delegates for a configured operator', async () => {
    const summaryUseCase = { handle: jest.fn() };
    const evaluationUseCase = {
      handle: jest.fn().mockResolvedValue({ processedCycles: 2 }),
    };
    const controller = new RankController(
      summaryUseCase as never,
      evaluationUseCase as never,
      makeConfig() as never,
    );

    const response = await controller.evaluateDueRankMaintenance({
      username: 'RANK-OPERATOR',
    } as never);

    expect(evaluationUseCase.handle).toHaveBeenCalledWith({});
    expect(response.body).toEqual({ processedCycles: 2 });
  });
});
