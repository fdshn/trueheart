import { referralCodeCandidates } from '@chantam.vn/chantam.core-lib/models';
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
    status: 'PUBLISHED',
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
  {
    globalId: '20000000-0000-4000-8000-000000000011',
    title: 'Bàn phím cơ không dây Keychron K2',
    description:
      'Bàn phím cơ Keychron K2 switch Brown, kết nối Bluetooth/Type-C, gõ rất êm. Tặng kèm keycap puller và cáp.',
    categoryId: '30000000-0000-4000-8000-000000000004',
    postType: 'OFFER',
    details: { condition: 'LIKE_NEW', estimatedValue: 1_200_000 },
    lng: -122.4072,
    lat: 37.7865,
    areaLabel: 'Union Square, San Francisco',
    status: 'PUBLISHED',
    totalQuantity: 1,
    remainingQuantity: 1,
    giverId: DemoUsers[0].globalId,
  },
  {
    globalId: '20000000-0000-4000-8000-000000000012',
    title: 'Bộ sách ôn thi IELTS Cambridge 15-18',
    description:
      'Bộ sách ôn luyện IELTS còn mới 95%, chỉ có vài trang ghi chú bằng bút chì, tặng bạn nào sắp thi.',
    categoryId: '30000000-0000-4000-8000-000000000003',
    postType: 'OFFER',
    details: { condition: 'LIKE_NEW', estimatedValue: 250_000 },
    lng: -122.405,
    lat: 37.7842,
    areaLabel: 'Market St / 4th St, San Francisco',
    status: 'PUBLISHED',
    totalQuantity: 1,
    remainingQuantity: 1,
    giverId: DemoUsers[0].globalId,
  },
  {
    globalId: '20000000-0000-4000-8000-000000000013',
    title: 'Áo khoác gió thể thao Nike size L',
    description:
      'Áo khoác gió thể thao nam chống thấm nhẹ, giữ ấm tốt, mới mặc 2-3 lần còn rất mới.',
    categoryId: '30000000-0000-4000-8000-000000000002',
    postType: 'OFFER',
    details: { condition: 'LIKE_NEW', estimatedValue: 500_000 },
    lng: -122.4032,
    lat: 37.7882,
    areaLabel: 'Financial District, San Francisco',
    status: 'PUBLISHED',
    totalQuantity: 1,
    remainingQuantity: 1,
    giverId: DemoUsers[0].globalId,
  },
  {
    globalId: '20000000-0000-4000-8000-000000000014',
    title: 'Nồi chiên không dầu Philips 4.5L',
    description:
      'Nồi chiên không dầu dùng tốt, khay chống dính còn đẹp, thích hợp cho sinh viên hoặc gia đình nhỏ.',
    categoryId: '30000000-0000-4000-8000-000000000001',
    postType: 'OFFER',
    details: { condition: 'USED', estimatedValue: 800_000 },
    lng: -122.4105,
    lat: 37.7825,
    areaLabel: 'Mission St / SOMA, San Francisco',
    status: 'PUBLISHED',
    totalQuantity: 1,
    remainingQuantity: 1,
    giverId: DemoUsers[0].globalId,
  },
  {
    globalId: '20000000-0000-4000-8000-000000000015',
    title: 'Ghế xoay văn phòng lưới công thái học',
    description:
      'Ghế xoay văn phòng có tựa đầu và đệm lưới êm ái, nâng hạ bình thường. Cần tự vận chuyển.',
    categoryId: '30000000-0000-4000-8000-000000000005',
    postType: 'OFFER',
    details: { condition: 'USED', estimatedValue: 700_000 },
    lng: -122.4118,
    lat: 37.7898,
    areaLabel: 'Geary St / Nob Hill, San Francisco',
    status: 'PUBLISHED',
    totalQuantity: 1,
    remainingQuantity: 1,
    giverId: DemoUsers[0].globalId,
  },
  {
    globalId: '20000000-0000-4000-8000-000000000016',
    title: 'Xe trượt scooter cho trẻ em',
    description:
      'Xe scooter 3 bánh có đèn led bánh xe, điều chỉnh được chiều cao tay lái, phù hợp bé 3-7 tuổi.',
    categoryId: '30000000-0000-4000-8000-000000000006',
    postType: 'OFFER',
    details: { condition: 'USED', estimatedValue: 350_000 },
    lng: -122.3985,
    lat: 37.7802,
    areaLabel: 'Yerba Buena, San Francisco',
    status: 'PUBLISHED',
    totalQuantity: 1,
    remainingQuantity: 1,
    giverId: DemoUsers[0].globalId,
  },
  {
    globalId: '20000000-0000-4000-8000-000000000017',
    title: 'Thùng sữa hạt dinh dưỡng óc chó hạnh nhân',
    description:
      'Thùng nguyên hộp 24 hộp sữa hạt dinh dưỡng hạn dùng đến cuối năm 2026, tặng bạn nào cần bồi bổ.',
    categoryId: '30000000-0000-4000-8000-000000000008',
    postType: 'OFFER',
    details: { condition: 'NEW', estimatedValue: 320_000 },
    lng: -122.4085,
    lat: 37.7925,
    areaLabel: 'Chinatown, San Francisco',
    status: 'PUBLISHED',
    totalQuantity: 1,
    remainingQuantity: 1,
    giverId: DemoUsers[0].globalId,
  },
  {
    globalId: '20000000-0000-4000-8000-000000000018',
    title: 'Máy đo huyết áp bắp tay Omron',
    description:
      'Máy đo huyết áp điện tử bắp tay màn hình lớn rõ nét, tặng gia đình có người lớn tuổi theo dõi sức khoẻ.',
    categoryId: '30000000-0000-4000-8000-000000000007',
    postType: 'OFFER',
    details: { condition: 'LIKE_NEW', estimatedValue: 600_000 },
    lng: -122.4155,
    lat: 37.7785,
    areaLabel: 'Civic Center, San Francisco',
    status: 'PUBLISHED',
    totalQuantity: 1,
    remainingQuantity: 1,
    giverId: DemoUsers[0].globalId,
  },
  {
    globalId: '20000000-0000-4000-8000-000000000019',
    title: 'Đàn guitar acoustic dáng D kèm bao da',
    description:
      'Đàn guitar gỗ thịt âm vang sáng, đã căn chỉnh action thấp dễ bấm, tặng kèm bao da và phím gảy.',
    categoryId: '30000000-0000-4000-8000-000000000009',
    postType: 'OFFER',
    details: { condition: 'USED', estimatedValue: 1_000_000 },
    lng: -122.418,
    lat: 37.781,
    areaLabel: 'Tenderloin / Larkin St, San Francisco',
    status: 'PUBLISHED',
    totalQuantity: 1,
    remainingQuantity: 1,
    giverId: DemoUsers[0].globalId,
  },
  {
    globalId: '20000000-0000-4000-8000-000000000020',
    title: 'Màn hình máy tính Dell 24 inch IPS',
    description:
      'Màn hình viền mỏng IPS Full HD sắc nét, màu sắc chuẩn, đầy đủ cổng HDMI và cáp nguồn.',
    categoryId: '30000000-0000-4000-8000-000000000004',
    postType: 'OFFER',
    details: { condition: 'LIKE_NEW', estimatedValue: 1_800_000 },
    lng: -122.3995,
    lat: 37.794,
    areaLabel: 'Embarcadero, San Francisco',
    status: 'PUBLISHED',
    totalQuantity: 1,
    remainingQuantity: 1,
    giverId: DemoUsers[0].globalId,
  },
] as const;

const DemoGiftRequests = [
  {
    globalId: '40000000-0000-4000-8000-000000000001',
    postId: '20000000-0000-4000-8000-000000000011',
    requesterId: DemoUsers[1].globalId,
    message:
      'Chào bạn, mình đang học lập trình rất cần một chiếc bàn phím cơ để luyện gõ, mong bạn tặng cho mình!',
    status: 'PENDING',
  },
  {
    globalId: '40000000-0000-4000-8000-000000000002',
    postId: '20000000-0000-4000-8000-000000000011',
    requesterId: DemoUsers[2].globalId,
    message:
      'Mình xin đăng ký nhận dự phòng nếu bạn phía trước không nhận nhé.',
    status: 'PENDING',
  },
  {
    globalId: '40000000-0000-4000-8000-000000000003',
    postId: '20000000-0000-4000-8000-000000000012',
    requesterId: DemoUsers[1].globalId,
    message:
      'Em chuẩn bị thi IELTS vào tháng tới, mong được anh chị tặng lại bộ sách này ạ.',
    status: 'PENDING',
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

  // Mã giới thiệu cho cả ba, chọn TRƯỚC và đảm bảo không trùng.
  //
  // Chọn theo chỉ số vòng lặp thì đúng với đúng ba user hiện tại và vỡ ngay khi ai thêm
  // user thứ tư có uuid trùng tiền tố. Lọc theo "ứng viên đầu tiên chưa ai lấy" thì
  // không phụ thuộc số lượng và không phụ thuộc thứ tự.
  const seededCodes = new Map<string, string>();
  const taken = new Set<string>();
  for (const user of DemoUsers) {
    const code =
      referralCodeCandidates(user.globalId).find((one) => !taken.has(one)) ??
      referralCodeCandidates(user.globalId)[0];
    taken.add(code);
    seededCodes.set(user.globalId, code);
  }

  for (const user of DemoUsers) {
    await executor.query(
      `
        INSERT INTO users (
          global_id, username, password_hash, email, full_name, rank, status,
          phone_verified_at, default_location, referral_code
        )
        VALUES (
          $1, $2, $3, $4, $5, $6::users_rank_enum, 'ACTIVE'::users_status_enum,
          now(), ST_SetSRID(ST_MakePoint(105.835, 21.028), 4326)::geography,
          $7
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
          -- Giữ mã cũ nếu đã có: mã giới thiệu là BẤT BIẾN, và một lượt seed lại đổi
          -- mã của người đã đi mời là làm chết mọi đường link họ đã gửi.
          referral_code = COALESCE(users.referral_code, EXCLUDED.referral_code),
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
        seededCodes.get(user.globalId),
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

  // Tài khoản kiểm duyệt demo phải có VAI TRÒ thật, không phải một dòng tên
  // trong biến môi trường: quyền duyệt bài nay đọc từ RBAC, nên seed mà quên
  // gán role thì smoke test đỏ mà không ai hiểu vì sao.
  await executor.query(
    `
      INSERT INTO admin_user_roles (user_id, role_id)
      SELECT $1, role.id FROM admin_roles role WHERE role.code = 'MODERATOR'
      ON CONFLICT DO NOTHING
    `,
    [DemoUsers[2].globalId],
  );

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

  for (const req of DemoGiftRequests) {
    await executor.query(
      `
        INSERT INTO gift_requests (
          global_id, post_id, requester_id, message, status, queue_joined_at, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5::gift_requests_status_enum, now(), now(), now())
        ON CONFLICT (post_id, requester_id) WHERE deleted_at IS NULL DO UPDATE SET
          message = EXCLUDED.message,
          status = EXCLUDED.status,
          updated_at = now()
      `,
      [req.globalId, req.postId, req.requesterId, req.message, req.status],
    );
  }
}

/** Dữ liệu dùng cho lệnh dọn, giữ tách để không rủi ro xoá dữ liệu người thật. */
export const DemoSeedIds = {
  users: DemoUsers.map((user) => user.globalId),
  posts: DemoPosts.map((post) => post.globalId),
  giftRequests: DemoGiftRequests.map((req) => req.globalId),
};
