import { usernamesByGlobalId } from './usernames';

describe('usernamesByGlobalId', () => {
  it('một câu lệnh cho cả trang, bỏ null và id trùng', async () => {
    const query = jest.fn().mockResolvedValue([
      { global_id: 'a', username: 'an' },
      { global_id: 'b', username: 'binh' },
    ]);

    const names = await usernamesByGlobalId({ query } as never, [
      'a',
      null,
      'b',
      'a',
    ]);

    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][1]).toEqual([['a', 'b']]);
    expect([...names]).toEqual([
      ['a', 'an'],
      ['b', 'binh'],
    ]);
  });

  it('không có id nào thì không hỏi database', async () => {
    const query = jest.fn();

    expect((await usernamesByGlobalId({ query } as never, [null])).size).toBe(
      0,
    );
    expect(query).not.toHaveBeenCalled();
  });
});
