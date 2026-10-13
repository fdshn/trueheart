import { IConfig } from '@/domain/ports/config';
import { EntityManager } from 'typeorm';
import { AdminConfigRepository } from '../../../repository/admin-config.repository';
import { PointLedgerRepository } from '../../../repository/point-ledger.repository';
import { TransactionReviewRepository } from '../../../repository/transaction-review.repository';
import { VerifiedPhoneRepository } from '../../../repository/verified-phone.repository';

/**
 * UUID cố định cho một dòng seed.
 *
 * Tiền tố `5eed` để nhìn là biết dòng do seed tạo — và để KHÔNG đụng dải `1000…`/`2000…`
 * /`4000…` của seed demo cũ, cũng không đụng `40000000-…` mà migration dùng cho
 * `onboarding_tasks`. Hai byte sau tiền tố là mã bảng (`SeedDomains`), nên hai bảng khác
 * nhau không bao giờ ra cùng một id dù cùng số thứ tự.
 */
export function seedId(domain: number, n: number): string {
  return `5eed${domain.toString(16).padStart(2, '0')}00-0000-4000-8000-${String(n).padStart(12, '0')}`;
}

export const SeedDomains = {
  users: 0x01,
  posts: 0x02,
  giftRequests: 0x03,
  transactions: 0x04,
  chatRooms: 0x05,
  chatMessages: 0x06,
  comments: 0x07,
  campaigns: 0x08,
  needItems: 0x09,
  contributions: 0x0a,
  contributionItems: 0x0b,
  deliveries: 0x0c,
  externalContributions: 0x0d,
  dharmaContents: 0x0e,
  dharmaRecitations: 0x0f,
  dharmaDedications: 0x10,
  dharmaThreads: 0x11,
  groups: 0x12,
  subTeams: 0x13,
  memberships: 0x14,
  meritUnits: 0x15,
  meritDeclarations: 0x16,
  blogs: 0x17,
  banners: 0x18,
  homeCampaigns: 0x19,
  broadcasts: 0x1a,
  reports: 0x1b,
  notifications: 0x1c,
  evidence: 0x1d,
  reviews: 0x1e,
  chatFlags: 0x1f,
  participations: 0x20,
  campaignReviews: 0x21,
  checkInRuns: 0x22,
  affiliateEvents: 0x23,
} as const;

/** Người dùng của seed demo cũ — giữ nguyên id để link/tài liệu cũ vẫn đúng. */
export const LegacyDemoUsers = {
  giver: '10000000-0000-4000-8000-000000000001',
  receiver: '10000000-0000-4000-8000-000000000002',
  moderator: '10000000-0000-4000-8000-000000000003',
} as const;

/** Vai trò người dùng trong bộ seed đầy đủ — mỗi vai một kịch bản API. */
export const Personas = {
  ...LegacyDemoUsers,
  admin: seedId(SeedDomains.users, 1),
  organizer: seedId(SeedDomains.users, 2),
  groupOwner: seedId(SeedDomains.users, 3),
  coordinator: seedId(SeedDomains.users, 4),
  newcomer: seedId(SeedDomains.users, 5),
  suspended: seedId(SeedDomains.users, 6),
  auditor: seedId(SeedDomains.users, 7),
  giver2: seedId(SeedDomains.users, 8),
} as const;

export const Categories = {
  household: '30000000-0000-4000-8000-000000000001',
  clothes: '30000000-0000-4000-8000-000000000002',
  books: '30000000-0000-4000-8000-000000000003',
  electronics: '30000000-0000-4000-8000-000000000004',
  furniture: '30000000-0000-4000-8000-000000000005',
  vehicles: '30000000-0000-4000-8000-000000000006',
  medical: '30000000-0000-4000-8000-000000000007',
  food: '30000000-0000-4000-8000-000000000008',
  other: '30000000-0000-4000-8000-000000000009',
  intangible: '30000000-0000-4000-8000-000000000010',
} as const;

/**
 * Những gì một phần seed cần.
 *
 * `q` cho dữ liệu GỐC (một sự kiện đã xảy ra). Dữ liệu SUY RA — số dư điểm, điểm sao,
 * độ chính xác người tặng, băm SĐT — thì đi qua đúng repository của app, để seed không
 * chép lại một công thức rồi lệch khỏi nó ở lần sửa sau.
 */
export interface ISeedContext {
  q<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  ledger: PointLedgerRepository;
  reviews: TransactionReviewRepository;
  phones: VerifiedPhoneRepository;
}

export function createSeedContext(manager: EntityManager): ISeedContext {
  const config = {
    security: { phoneHashPepper: process.env.PHONE_HASH_PEPPER ?? '' },
  } as unknown as IConfig;

  return {
    q: (sql, params = []) => manager.query(sql, params),
    ledger: new PointLedgerRepository(manager),
    reviews: new TransactionReviewRepository(
      manager,
      new AdminConfigRepository(manager),
    ),
    phones: new VerifiedPhoneRepository(manager, config),
  };
}
