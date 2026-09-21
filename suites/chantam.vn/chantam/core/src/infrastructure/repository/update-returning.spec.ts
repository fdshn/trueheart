import { EntityManager } from 'typeorm';
import { updateReturning } from './update-returning';

function managerReturning(value: unknown): EntityManager {
  return {
    query: jest.fn(async (_sql: string, _params?: unknown[]) => value),
  } as unknown as EntityManager;
}

describe('updateReturning', () => {
  it('gỡ lớp bọc [rows, affected] của UPDATE ... RETURNING', async () => {
    const manager = managerReturning([[{ id: 1 }, { id: 2 }], 2]);

    await expect(
      updateReturning(manager, 'UPDATE t SET a=1 RETURNING id'),
    ).resolves.toEqual([{ id: 1 }, { id: 2 }]);
  });

  it('không khớp dòng nào thì trả mảng RỖNG, không phải [[], 0]', async () => {
    // Đây là nhánh từng hỏng: `[[], 0]` có độ dài 2 nên mọi phép kiểm
    // `length === 0` đều trượt, và hàm gọi tưởng là có khớp.
    const manager = managerReturning([[], 0]);

    const rows = await updateReturning(
      manager,
      'UPDATE t SET a=1 RETURNING id',
    );

    expect(rows).toEqual([]);
    expect(rows.length === 0).toBe(true);
  });

  it('driver trả thẳng mảng bản ghi thì giữ nguyên', async () => {
    const manager = managerReturning([{ id: 7 }]);

    await expect(
      updateReturning(manager, 'UPDATE t SET a=1 RETURNING id'),
    ).resolves.toEqual([{ id: 7 }]);
  });

  it('không nhầm hai bản ghi thành lớp bọc', async () => {
    // `[rows, affected]` chỉ khi phần tử đầu là MẢNG và phần tử sau là SỐ.
    // Hai bản ghi là hai object, nên không được gỡ lớp.
    const manager = managerReturning([{ id: 1 }, { id: 2 }]);

    await expect(
      updateReturning(manager, 'UPDATE t SET a=1 RETURNING id'),
    ).resolves.toEqual([{ id: 1 }, { id: 2 }]);
  });

  it('kết quả không phải mảng thì trả mảng rỗng', async () => {
    await expect(
      updateReturning(managerReturning(undefined), 'UPDATE t SET a=1'),
    ).resolves.toEqual([]);
  });

  it('chuyển nguyên tham số xuống driver', async () => {
    const manager = managerReturning([[], 0]);

    await updateReturning(manager, 'UPDATE t SET a=$1 RETURNING id', [42]);

    expect(manager.query).toHaveBeenCalledWith(
      'UPDATE t SET a=$1 RETURNING id',
      [42],
    );
  });
});
