import { CandidateSelectionCriteria } from '@chantam.vn/chantam.core-lib/consts';
import { ForbiddenException } from '@chantam/service.common-lib/exception';
import {
  GetCandidateSelectionUseCase,
  SetCandidateSelectionUseCase,
} from './candidate-selection.use-cases';

const ActorId = '10000000-0000-4000-8000-000000000001';

const DefaultOrder = [
  { code: CandidateSelectionCriteria.QUEUE_JOINED_EARLIEST, priority: 1 },
  { code: CandidateSelectionCriteria.FEWEST_CANCELLATIONS, priority: 2 },
  { code: CandidateSelectionCriteria.FEWEST_RECEIVED, priority: 3 },
  { code: CandidateSelectionCriteria.NEAREST, priority: 4 },
  { code: CandidateSelectionCriteria.HIGHEST_RANK, priority: 5 },
];

function makeRepository(
  stored: unknown = null,
  granted: string[] = ['config.read', 'config.write'],
) {
  return {
    hasPermission: jest.fn(async (_id: string, code: string) =>
      granted.includes(code),
    ),
    getConfigValue: jest.fn().mockResolvedValue(stored),
    publishSystemConfig: jest.fn().mockResolvedValue({}),
  };
}

describe(GetCandidateSelectionUseCase.name, () => {
  it('đòi config.read', async () => {
    const repository = makeRepository(null, []);

    await expect(
      new GetCandidateSelectionUseCase(repository as never).handle({
        actorUserId: ActorId,
      }),
    ).rejects.toThrow(ForbiddenException);
    expect(repository.getConfigValue).not.toHaveBeenCalled();
  });

  it('chưa cấu hình, mảng rỗng hay giá trị không phải mảng đều trả thứ tự mặc định, isConfigured false', async () => {
    for (const stored of [null, [], 'QUEUE_JOINED_EARLIEST', { a: 1 }]) {
      const repository = makeRepository(stored);

      const result = await new GetCandidateSelectionUseCase(
        repository as never,
      ).handle({ actorUserId: ActorId });

      expect(repository.getConfigValue).toHaveBeenCalledWith(
        'selection.candidate_priority',
      );
      expect(result).toEqual({ order: DefaultOrder, isConfigured: false });
    }
  });

  it('trả thứ tự ĐÃ chuẩn hoá: bỏ mã lạ, bỏ trùng, bù tiêu chí thiếu theo mặc định', async () => {
    const result = await new GetCandidateSelectionUseCase(
      makeRepository([
        CandidateSelectionCriteria.HIGHEST_RANK,
        'KHÔNG_CÓ',
        CandidateSelectionCriteria.HIGHEST_RANK,
        CandidateSelectionCriteria.NEAREST,
      ]) as never,
    ).handle({ actorUserId: ActorId });

    expect(result).toEqual({
      order: [
        { code: CandidateSelectionCriteria.HIGHEST_RANK, priority: 1 },
        { code: CandidateSelectionCriteria.NEAREST, priority: 2 },
        { code: CandidateSelectionCriteria.QUEUE_JOINED_EARLIEST, priority: 3 },
        { code: CandidateSelectionCriteria.FEWEST_CANCELLATIONS, priority: 4 },
        { code: CandidateSelectionCriteria.FEWEST_RECEIVED, priority: 5 },
      ],
      isConfigured: true,
    });
  });
});

describe(SetCandidateSelectionUseCase.name, () => {
  it('đòi config.write và không ghi gì khi thiếu quyền', async () => {
    const repository = makeRepository(null, ['config.read']);

    await expect(
      new SetCandidateSelectionUseCase(repository as never).handle({
        actorUserId: ActorId,
        order: [CandidateSelectionCriteria.NEAREST],
        reason: 'Ưu tiên người gần',
      }),
    ).rejects.toThrow(ForbiddenException);
    expect(repository.publishSystemConfig).not.toHaveBeenCalled();
  });

  it('ghi thứ tự ĐÃ chuẩn hoá vào đúng khoá kèm lý do, rồi trả khung nhìn', async () => {
    const repository = makeRepository();

    const result = await new SetCandidateSelectionUseCase(
      repository as never,
    ).handle({
      actorUserId: ActorId,
      order: [
        CandidateSelectionCriteria.NEAREST,
        CandidateSelectionCriteria.NEAREST,
        CandidateSelectionCriteria.FEWEST_RECEIVED,
      ],
      reason: 'Ưu tiên người gần',
    });

    const normalized = [
      CandidateSelectionCriteria.NEAREST,
      CandidateSelectionCriteria.FEWEST_RECEIVED,
      CandidateSelectionCriteria.QUEUE_JOINED_EARLIEST,
      CandidateSelectionCriteria.FEWEST_CANCELLATIONS,
      CandidateSelectionCriteria.HIGHEST_RANK,
    ];
    expect(repository.publishSystemConfig).toHaveBeenCalledWith({
      actorUserId: ActorId,
      key: 'selection.candidate_priority',
      value: normalized,
      valueType: 'JSON',
      reason: 'Ưu tiên người gần',
    });
    expect(result).toEqual({
      order: normalized.map((code, index) => ({ code, priority: index + 1 })),
      isConfigured: true,
    });
  });

  it('gửi danh sách rỗng thì ghi đủ thứ tự mặc định chứ không ghi mảng rỗng', async () => {
    const repository = makeRepository();

    const result = await new SetCandidateSelectionUseCase(
      repository as never,
    ).handle({ actorUserId: ActorId, order: [], reason: 'Về mặc định' });

    expect(repository.publishSystemConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        value: DefaultOrder.map((entry) => entry.code),
      }),
    );
    expect(result).toEqual({ order: DefaultOrder, isConfigured: true });
  });
});
