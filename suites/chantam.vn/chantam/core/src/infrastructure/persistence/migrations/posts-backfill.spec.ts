import { GiftPostCategories } from '@chantam.vn/chantam.core-lib/consts';
import { QueryRunner } from 'typeorm';
import { SeedBaseCategories1789800000001 } from './1789800000001-SeedBaseCategories';
import { CreateCanonicalPosts1789900000000 } from './1789900000000-CreateCanonicalPosts';

/**
 * Backfill M2.1 chép `gift_posts` sang `posts`.
 *
 * Câu này chỉ chèn 0 dòng trên database trắng, nên CI hiện tại chạy migration
 * xong vẫn KHÔNG chứng minh được gì về nó — lần chạy thật đầu tiên sẽ là lúc
 * nâng cấp production, nơi `gift_posts` có dữ liệu.
 *
 * Spec này khoá những bất biến mà nếu vỡ thì migration sẽ **gãy giữa chừng trên
 * production**, chứ không phải chỉ trả kết quả sai.
 */
function collectQueries(): Promise<string[]> {
  const queries: string[] = [];
  const queryRunner = {
    query: jest.fn(async (query: string) => {
      queries.push(query);
    }),
  } as unknown as QueryRunner;

  return new CreateCanonicalPosts1789900000000()
    .up(queryRunner)
    .then(() => queries);
}

async function backfillSql(): Promise<string> {
  const queries = await collectQueries();
  const sql = queries.find(
    (query) =>
      query.includes('INSERT INTO posts') && query.includes('FROM gift_posts'),
  );

  if (!sql) throw new Error('Không tìm thấy câu backfill trong migration');
  return sql;
}

/** UUID danh mục mà backfill gán cho bài, lấy thẳng từ các nhánh CASE. */
function mappedCategoryIds(sql: string): string[] {
  return [...sql.matchAll(/WHEN '([A-Z_]+)' THEN '([0-9a-f-]+)'::uuid/g)].map(
    (match) => match[2],
  );
}

describe('Backfill gift_posts sang posts (M2.1)', () => {
  it('phủ ĐỦ mọi giá trị của enum danh mục cũ', async () => {
    // `posts.category_id` là NOT NULL. Thiếu một nhánh CASE thì giá trị đó cho
    // ra NULL và câu INSERT ném lỗi — migration gãy giữa chừng trên production,
    // đúng lúc không ai muốn nó gãy. Thêm danh mục mới vào enum mà quên sửa
    // backfill là cách dễ nhất để gây ra chuyện đó.
    const sql = await backfillSql();
    const covered = [...sql.matchAll(/WHEN '([A-Z_]+)' THEN/g)].map(
      (match) => match[1],
    );

    expect(covered.sort()).toEqual(Object.values(GiftPostCategories).sort());
  });

  it('chỉ trỏ tới danh mục đã được seed trước đó', async () => {
    // `posts.category_id` có FK về `categories`. Trỏ vào UUID chưa seed là vi
    // phạm khoá ngoại, và cũng làm migration gãy.
    const sql = await backfillSql();
    const seedQueries = await (async () => {
      const queries: string[] = [];
      const queryRunner = {
        query: jest.fn(async (query: string) => {
          queries.push(query);
        }),
      } as unknown as QueryRunner;
      await new SeedBaseCategories1789800000001().up(queryRunner);
      return queries;
    })();

    // Danh mục "Phi vật chất" do chính migration backfill seed ngay trước đó.
    const seeded = new Set(
      [...seedQueries.join('\n').matchAll(/'([0-9a-f]{8}-[0-9a-f-]+)'/g)].map(
        (match) => match[1],
      ),
    );
    const ownSeed = await collectQueries();
    for (const match of ownSeed
      .join('\n')
      .matchAll(/INSERT INTO categories[\s\S]*?VALUES \('([0-9a-f-]+)'/g))
      seeded.add(match[1]);

    for (const categoryId of mappedCategoryIds(sql))
      expect([...seeded]).toContain(categoryId);
  });

  it('chạy lại được nhiều lần mà không nhân đôi dữ liệu', async () => {
    // Migration có thể bị chạy lại sau một lần rollback dở dang. Không có
    // ON CONFLICT thì lần hai đụng khoá chính và gãy.
    const sql = await backfillSql();

    expect(sql).toMatch(/ON CONFLICT \(global_id\) DO NOTHING/);
  });

  it('giữ nguyên global_id để liên kết cũ không đứt', async () => {
    // Bài cũ và bài canonical phải CÙNG global_id: mọi thứ đang trỏ tới bài cũ
    // (link chia sẻ, giao dịch, ảnh) vẫn phải tìm thấy nó sau khi chuyển.
    const sql = await backfillSql();

    expect(sql).toMatch(/SELECT\s+g\.global_id/);
  });

  it('chỉ đặt hạn cho bài còn sống, không đặt cho bài đã đóng', async () => {
    // Đặt hạn cho bài COMPLETED/CANCELLED là hồi sinh chúng trên bảng tin.
    const sql = await backfillSql();
    const expiry = sql.match(/CASE WHEN g\.status IN \(([^)]+)\)/);

    expect(expiry).not.toBeNull();
    expect(expiry?.[1]).toContain('PUBLISHED');
    expect(expiry?.[1]).toContain('RESERVED');
    expect(expiry?.[1]).toContain('DELIVERING');
    expect(expiry?.[1]).not.toContain('COMPLETED');
    expect(expiry?.[1]).not.toContain('CANCELLED');
  });

  it('mọi bài cũ thành OFFER, vì bảng cũ chỉ có bài đem tặng', async () => {
    const sql = await backfillSql();

    expect(sql).toContain("'OFFER'");
  });
});
