import { DataSource } from 'typeorm';
import { seedDemoData } from '../seed-demo-data';
import { seedCharity } from './charity';
import { seedCheckIns } from './check-ins';
import { seedCommunity } from './community';
import { seedContentAndInbox } from './content-inbox';
import { seedDharmaAndMerit } from './dharma-merit';
import { seedFeed } from './feed';
import { seedGifting } from './gifting';
import { seedLeaderboard } from './leaderboard';
import { seedPeople } from './people';
import { createSeedContext, ISeedContext } from './seed-context';

/**
 * Thứ tự theo khoá ngoại: người → bài/giao dịch → mọi thứ treo vào hai thứ đó.
 *
 * Mỗi phần tự idempotent (khoá cố định + `ON CONFLICT DO NOTHING`/`WHERE NOT EXISTS`),
 * nên KHÔNG bọc cả seed trong một transaction: các repository dùng lại (sổ điểm, đánh
 * giá) tự mở transaction riêng, và một lượt hỏng giữa chừng chỉ cần chạy lại là đủ.
 */
export const SeedSections: ReadonlyArray<
  [string, (ctx: ISeedContext) => Promise<void>]
> = [
  ['người dùng, vai trò, SĐT, giới thiệu, hạng', seedPeople],
  ['bài đăng, xin nhận, giao dịch, chat, đánh giá', seedGifting],
  ['Dharma Hub và công đức', seedDharmaAndMerit],
  // Sau Dharma: bình luận và cảm xúc treo vào cả chủ đề diễn đàn.
  ['bình luận, cảm xúc, chia sẻ', seedFeed],
  ['nhóm, đội con, affiliate', seedCommunity],
  ['điểm danh và tín dụng bù', seedCheckIns],
  ['hoạt động từ thiện F65b', seedCharity],
  ['bảng thành tích tháng: bản chốt, huy hiệu, lượt loại', seedLeaderboard],
  // Cuối cùng: báo xấu và thông báo trỏ vào mọi thứ phía trên.
  ['nội dung Admin, báo xấu, thông báo', seedContentAndInbox],
];

export async function seedFullData(
  dataSource: DataSource,
  log: (line: string) => void = () => undefined,
): Promise<void> {
  await seedDemoData(dataSource.manager);
  log('✓ seed demo cũ (3 user, 16 bài, 3 lượt xin nhận)');

  const ctx = createSeedContext(dataSource.manager);
  for (const [label, section] of SeedSections) {
    await section(ctx);
    log(`✓ ${label}`);
  }
}
