import { hash } from 'bcryptjs';
import { createHash } from 'node:crypto';

/** Mật khẩu công khai của TÀI KHOẢN DEMO, không phải bí mật người dùng thật. */
export const DemoPassword = 'Demo@12345';

const DemoUsers = [
  {
    globalId: '10000000-0000-4000-8000-000000000001',
    username: 'demo-nguoi-tang',
    email: 'demo.giver@chantam.local',
    fullName: 'Nguyễn An — Người tặng demo',
    rank: 'GOLD',
  },
  {
    globalId: '10000000-0000-4000-8000-000000000002',
    username: 'demo-nguoi-nhan',
    email: 'demo.receiver@chantam.local',
    fullName: 'Trần Bình — Người nhận demo',
    rank: 'MEMBER',
  },
  {
    globalId: '10000000-0000-4000-8000-000000000003',
    username: 'demo-kiem-duyet',
    email: 'demo.reviewer@chantam.local',
    fullName: 'Lê Chi — Kiểm duyệt demo',
    rank: 'DIAMOND',
  },
] as const;

const DemoPosts = [
  {
    globalId: '20000000-0000-4000-8000-000000000001',
    title: 'Xe đạp cũ còn dùng tốt',
    description:
      'Xe đạp địa hình đã dùng ba năm, phanh và líp còn tốt. Tặng người cần đi học hoặc đi làm gần.',
    categoryId: '30000000-0000-4000-8000-000000000006',
    postType: 'OFFER',
    details: { condition: 'USED', estimatedValue: 1_500_000 },
    lng: 105.8342,
    lat: 21.0285,
    areaLabel: 'Hoàn Kiếm, Hà Nội',
    status: 'PUBLISHED',
    totalQuantity: 1,
    remainingQuantity: 1,
    giverId: DemoUsers[0].globalId,
  },
  {
    globalId: '20000000-0000-4000-8000-000000000002',
    title: 'Sách giáo khoa lớp 10',
    description:
      'Bộ sách giáo khoa lớp 10 còn sạch, đủ các môn cơ bản. Ưu tiên học sinh cần dùng trong năm học mới.',
    categoryId: '30000000-0000-4000-8000-000000000003',
    postType: 'OFFER',
    details: { condition: 'LIKE_NEW', estimatedValue: 300_000 },
    lng: 105.8374,
    lat: 21.0259,
    areaLabel: 'Hai Bà Trưng, Hà Nội',
    status: 'PUBLISHED',
    totalQuantity: 1,
    remainingQuantity: 1,
    giverId: DemoUsers[0].globalId,
  },
  {
    globalId: '20000000-0000-4000-8000-000000000003',
    title: 'Bàn học gỗ nhỏ',
    description:
      'Bàn học gỗ kích thước 100 x 50 cm, có vài vết xước nhẹ nhưng chắc chắn. Cần người tự vận chuyển.',
    categoryId: '30000000-0000-4000-8000-000000000005',
    postType: 'WANTED',
    details: {},
    lng: 105.8301,
    lat: 21.0304,
    areaLabel: 'Ba Đình, Hà Nội',
    status: 'PENDING_REVIEW',
    totalQuantity: 1,
    remainingQuantity: 1,
    giverId: DemoUsers[0].globalId,
  },
  {
    globalId: '20000000-0000-4000-8000-000000000004',
    title: 'Áo khoác mùa đông',
    description:
      'Áo khoác nam cỡ M đã giặt sạch, giữ ấm tốt. Bài đã hoàn thành để minh hoạ các trạng thái đóng.',
    categoryId: '30000000-0000-4000-8000-000000000002',
    postType: 'CHARITY',
    details: {},
    lng: 105.8412,
    lat: 21.0237,
    areaLabel: 'Đống Đa, Hà Nội',
    status: 'COMPLETED',
    totalQuantity: 1,
    remainingQuantity: 0,
    giverId: DemoUsers[0].globalId,
  },
  {
    globalId: '20000000-0000-4000-8000-000000000005',
    title: 'Máy tính cũ giá hỗ trợ',
    description:
      'Máy tính còn hoạt động, đăng bán giá hỗ trợ để có kinh phí đổi thiết bị mới.',
    categoryId: '30000000-0000-4000-8000-000000000004',
    postType: 'CLASSIFIED',
    details: {},
    lng: 105.842,
    lat: 21.026,
    areaLabel: 'Đống Đa, Hà Nội',
    status: 'PUBLISHED',
    totalQuantity: 1,
    remainingQuantity: 1,
    giverId: DemoUsers[0].globalId,
  },
  {
    globalId: '20000000-0000-4000-8000-000000000006',
    title: 'Ghi nhận đơn vị thiện nguyện',
    description:
      'Bài ghi nhận đóng góp cộng đồng trong Generic MVP, chưa có thông tin xác minh chuyên biệt.',
    categoryId: '30000000-0000-4000-8000-000000000010',
    postType: 'MERIT',
    details: {},
    lng: 105.836,
    lat: 21.029,
    areaLabel: 'Hoàn Kiếm, Hà Nội',
    status: 'PUBLISHED',
    totalQuantity: 1,
    remainingQuantity: 1,
    giverId: DemoUsers[0].globalId,
  },
] as const;

/** Bề mặt tối thiểu của `QueryRunner`/`DataSource` dùng trong seed. */
export interface ISqlExecutor {
  query(statement: string, parameters?: unknown[]): Promise<unknown>;
}

/**
 * Không cho seed chạy chỉ vì ai đó gõ nhầm lệnh trên server thật.
 *
 * Migrations schema tự chạy khi `NODE_ENV=production`; demo data thì không nằm
 * trong migrations chính vì staging cũng chạy production mode để migrations tự
 * áp dụng. Seed chỉ chạy khi operator truyền đúng cờ này bằng tay.
 */
export function ensureDemoSeedAllowed(value: string | undefined): void {
  if (value !== 'true')
    throw new Error(
      'Từ chối seed dữ liệu demo. Chỉ chạy khi truyền SEED_DEMO_DATA=true.',
    );
}

/**
 * Upsert dữ liệu minh hoạ vào toàn bộ bảng nghiệp vụ hiện có.
 *
 * Đúng ba bảng `public` hiện tại: users, posts, user_sessions. Không đụng
 * tiger/topology/spatial_ref_sys — đó là bảng PostGIS tự quản lý, không phải
 * dữ liệu ứng dụng. Chạy lại chỉ cập nhật cùng globalId, không nhân đôi row.
 */
export async function seedDemoData(executor: ISqlExecutor): Promise<void> {
  const passwordHash = await hash(DemoPassword, 12);

  for (const user of DemoUsers) {
    await executor.query(
      `
        INSERT INTO users (
          global_id, username, password_hash, email, full_name, rank, status,
          phone_verified_at, default_location
        )
        VALUES (
          $1, $2, $3, $4, $5, $6::users_rank_enum, 'ACTIVE'::users_status_enum,
          now(), ST_SetSRID(ST_MakePoint(105.835, 21.028), 4326)::geography
        )
        ON CONFLICT (global_id) DO UPDATE SET
          username = EXCLUDED.username,
          password_hash = EXCLUDED.password_hash,
          email = EXCLUDED.email,
          full_name = EXCLUDED.full_name,
          rank = EXCLUDED.rank,
          status = EXCLUDED.status,
          phone_verified_at = EXCLUDED.phone_verified_at,
          default_location = EXCLUDED.default_location,
          deleted_at = NULL,
          updated_at = now()
      `,
      [
        user.globalId,
        user.username,
        passwordHash,
        user.email,
        user.fullName,
        user.rank,
      ],
    );
  }

  for (const post of DemoPosts) {
    await executor.query(
      `
        INSERT INTO posts (
          global_id, post_type, author_id, category_id, title, description,
          location, area_label, status, total_quantity, remaining_quantity, details,
          expires_at, renewed_count
        )
        VALUES (
          $1, $2::posts_type_enum, $3, $4, $5, $6,
          ST_SetSRID(ST_MakePoint($7, $8), 4326)::geography,
          $9, $10::gift_posts_status_enum, $11, $12, $13::jsonb,
          NULL, 0
        )
        ON CONFLICT (global_id) DO UPDATE SET
          post_type = EXCLUDED.post_type,
          author_id = EXCLUDED.author_id,
          category_id = EXCLUDED.category_id,
          title = EXCLUDED.title,
          description = EXCLUDED.description,
          location = EXCLUDED.location,
          area_label = EXCLUDED.area_label,
          status = EXCLUDED.status,
          total_quantity = EXCLUDED.total_quantity,
          remaining_quantity = EXCLUDED.remaining_quantity,
          details = EXCLUDED.details,
          expires_at = EXCLUDED.expires_at,
          renewed_count = EXCLUDED.renewed_count,
          deleted_at = NULL,
          updated_at = now()
      `,
      [
        post.globalId,
        post.postType,
        post.giverId,
        post.categoryId,
        post.title,
        post.description,
        post.lng,
        post.lat,
        post.areaLabel,
        post.status,
        post.totalQuantity,
        post.remainingQuantity,
        JSON.stringify(post.details),
      ],
    );
  }

  for (const user of DemoUsers) {
    const refreshTokenHash = createHash('sha256')
      .update(`seed-session:${user.globalId}`)
      .digest('hex');

    await executor.query(
      `
        INSERT INTO user_sessions (
          user_id, refresh_token_hash, device_id, expires_at, revoked_at
        )
        VALUES ($1, $2, 'seed-demo-device', now() - interval '1 day', now())
        ON CONFLICT (refresh_token_hash) DO UPDATE SET
          user_id = EXCLUDED.user_id,
          device_id = EXCLUDED.device_id,
          expires_at = EXCLUDED.expires_at,
          revoked_at = EXCLUDED.revoked_at,
          updated_at = now()
      `,
      [user.globalId, refreshTokenHash],
    );
  }
}

/** Dữ liệu dùng cho lệnh dọn, giữ tách để không rủi ro xoá dữ liệu người thật. */
export const DemoSeedIds = {
  users: DemoUsers.map((user) => user.globalId),
  posts: DemoPosts.map((post) => post.globalId),
};
