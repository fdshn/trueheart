import { ForbiddenException } from '@chantam/service.common-lib/exception';
import { EvaluateDueRankMaintenanceResponseDto } from '../../dto/rank';
import { RankController } from './rank.controller';

const ActorId = '99999999-9999-4999-8999-999999999002';

function makeAdmin(allowed: boolean) {
  return { hasPermission: jest.fn().mockResolvedValue(allowed) };
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

  it('thiếu quyền rank.operate thì chặn TRƯỚC khi chạy đánh giá', async () => {
    const summaryUseCase = { handle: jest.fn() };
    const evaluationUseCase = { handle: jest.fn() };
    const controller = new RankController(
      summaryUseCase as never,
      evaluationUseCase as never,
      makeAdmin(false) as never,
    );

    await expect(
      controller.evaluateDueRankMaintenance({ userId: ActorId } as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(evaluationUseCase.handle).not.toHaveBeenCalled();
  });

  it('có quyền thì uỷ thác, và quyền đọc từ RBAC chứ không phải biến môi trường', async () => {
    const summaryUseCase = { handle: jest.fn() };
    const evaluationUseCase = {
      handle: jest.fn().mockResolvedValue({ processedCycles: 2 }),
    };
    const admin = makeAdmin(true);
    const controller = new RankController(
      summaryUseCase as never,
      evaluationUseCase as never,
      admin as never,
    );

    const response = await controller.evaluateDueRankMaintenance({
      userId: ActorId,
    } as never);

    expect(admin.hasPermission).toHaveBeenCalledWith(ActorId, 'rank.operate');
    expect(evaluationUseCase.handle).toHaveBeenCalledWith({});
    expect(response.body).toEqual({ processedCycles: 2 });
  });
});
