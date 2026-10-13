import { notePointAward, PointAwardScope } from './point-award-context';

describe('PointAwardScope', () => {
  it('chỉ giữ khoản CỘNG của chính người gọi', async () => {
    const scope = new PointAwardScope('me');
    await scope.run(async () => {
      notePointAward({ userId: 'me', entryId: 1, delta: 5 });
      // Khoản trừ không phải "được cộng điểm".
      notePointAward({ userId: 'me', entryId: 2, delta: -50 });
      // Người tặng cũng được điểm khi người nhận xác nhận — nhưng header là của
      // người gọi.
      notePointAward({ userId: 'someone-else', entryId: 3, delta: 56 });
    });

    expect(scope.entryIds).toEqual([1]);
  });

  it('theo được qua await: lượt ghi nằm sâu trong chuỗi bất đồng bộ vẫn vào đúng request', async () => {
    const scope = new PointAwardScope('me');
    await scope.run(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1));
      await Promise.resolve().then(() =>
        notePointAward({ userId: 'me', entryId: 7, delta: 2 }),
      );
    });

    expect(scope.entryIds).toEqual([7]);
  });

  it('hai request song song không lẫn điểm của nhau', async () => {
    const a = new PointAwardScope('a');
    const b = new PointAwardScope('b');
    await Promise.all([
      a.run(async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        notePointAward({ userId: 'a', entryId: 10, delta: 1 });
      }),
      b.run(async () => {
        notePointAward({ userId: 'b', entryId: 20, delta: 1 });
      }),
    ]);

    expect([a.entryIds, b.entryIds]).toEqual([[10], [20]]);
  });

  it('ngoài request (cron, job nền) thì ghi nhận là no-op, không ném', () => {
    expect(() =>
      notePointAward({ userId: 'me', entryId: 1, delta: 5 }),
    ).not.toThrow();
  });

  it('request ẩn danh không gom gì', async () => {
    const scope = new PointAwardScope(null);
    await scope.run(async () => {
      notePointAward({ userId: 'me', entryId: 1, delta: 5 });
    });

    expect(scope.entryIds).toEqual([]);
  });
});
