import { ReconcileFeedCountsUseCase } from './reconcile-feed-counts.use-case';

const PostA = '11111111-1111-1111-1111-111111111111';
const CommentA = '22222222-2222-2222-2222-222222222222';

interface IRow {
  subject_id: string;
  column_name: string;
  stored: string;
  actual: string;
}

function makeUseCase(
  options: { posts?: IRow[]; comments?: IRow[]; scanned?: string } = {},
) {
  const txQuery = jest.fn(async () => []);
  const manager = {
    query: jest.fn(async (sql: string) => {
      if (sql.includes('AS scanned'))
        return [{ scanned: options.scanned ?? '10' }];
      if (sql.includes('FROM posts post')) return options.posts ?? [];
      if (sql.includes('FROM content_comments comment'))
        return options.comments ?? [];
      throw new Error(`SQL không mong đợi: ${sql}`);
    }),
    transaction: jest.fn(
      async (work: (tx: { query: typeof txQuery }) => Promise<unknown>) =>
        work({ query: txQuery }),
    ),
  };
  return {
    useCase: new ReconcileFeedCountsUseCase(manager as never),
    manager,
    txQuery,
  };
}

const postDrift: IRow = {
  subject_id: PostA,
  column_name: 'reaction_count',
  stored: '5',
  actual: '3',
};
const commentDrift: IRow = {
  subject_id: CommentA,
  column_name: 'reply_count',
  stored: '0',
  actual: '2',
};

describe('ReconcileFeedCountsUseCase', () => {
  it('không trôi số nào thì không mở transaction', async () => {
    const { useCase, manager } = makeUseCase({ scanned: '42' });

    const result = await useCase.handle({});

    expect(result).toEqual({ scanned: 42, drifts: [], repaired: 0 });
    expect(manager.transaction).not.toHaveBeenCalled();
  });

  it('báo từng chỗ trôi của bài và bình luận, đổi chuỗi sang số', async () => {
    const { useCase } = makeUseCase({
      posts: [postDrift],
      comments: [commentDrift],
      scanned: '7',
    });

    const result = await useCase.handle({ dryRun: true });

    expect(result).toEqual({
      scanned: 7,
      drifts: [
        {
          subject: 'POST',
          subjectId: PostA,
          column: 'reaction_count',
          stored: 5,
          actual: 3,
        },
        {
          subject: 'COMMENT',
          subjectId: CommentA,
          column: 'reply_count',
          stored: 0,
          actual: 2,
        },
      ],
      repaired: 0,
    });
  });

  it('dry-run thì chỉ báo, không sửa gì', async () => {
    const { useCase, manager, txQuery } = makeUseCase({ posts: [postDrift] });

    const result = await useCase.handle({ dryRun: true });

    expect(result.repaired).toBe(0);
    expect(result.drifts).toHaveLength(1);
    expect(manager.transaction).not.toHaveBeenCalled();
    expect(txQuery).not.toHaveBeenCalled();
  });

  it('chỉ dryRun === true mới là xem thử', async () => {
    const { useCase, manager } = makeUseCase({ posts: [postDrift] });

    await useCase.handle({ dryRun: 'true' as never });

    expect(manager.transaction).toHaveBeenCalledTimes(1);
  });

  it('có trôi thì sửa trong MỘT transaction, đúng id từng bảng', async () => {
    const otherColumn = { ...postDrift, column_name: 'share_count' };
    const { useCase, manager, txQuery } = makeUseCase({
      posts: [postDrift, otherColumn],
      comments: [commentDrift],
    });

    const result = await useCase.handle({});

    expect(manager.transaction).toHaveBeenCalledTimes(1);
    expect(txQuery).toHaveBeenCalledTimes(2);
    const [postUpdate, commentUpdate] = txQuery.mock.calls as unknown as [
      string,
      unknown[],
    ][];
    expect(postUpdate[0]).toContain('UPDATE posts');
    expect(postUpdate[1]).toEqual([[PostA, PostA]]);
    expect(commentUpdate[0]).toContain('UPDATE content_comments');
    expect(commentUpdate[1]).toEqual([[CommentA]]);
    expect(result.repaired).toBe(3);
    expect(result.drifts).toHaveLength(3);
  });

  it('không sửa ngoài transaction', async () => {
    const { useCase, manager } = makeUseCase({ comments: [commentDrift] });

    await useCase.handle({});

    const updatesOutside = (manager.query.mock.calls as unknown as [string][])
      .map(([sql]) => sql)
      .filter((sql) => sql.includes('UPDATE'));
    expect(updatesOutside).toEqual([]);
  });
});
