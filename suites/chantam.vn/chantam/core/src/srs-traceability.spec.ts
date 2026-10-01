import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Sổ truy vết Quy tắc nghiệp vụ (BR) của SRS sang mã nguồn.
 *
 * ## Vấn đề nó giải
 *
 * SRS đặt tên cho từng quy tắc nghiệp vụ, nhưng trước 01/10 **chỉ 7 trong 61 id
 * được nhắc tới ở bất kỳ đâu** trong mã nguồn hoặc tài liệu nội bộ (6 của nhóm
 * GRP, cộng `BR-AFF-02`). Nghĩa là với 54 quy tắc còn lại, không ai trả lời được
 * câu đơn giản nhất: *đã làm chưa?* — ngoài cách đọc lại từng cái.
 *
 * Và đó không phải lo xa. Sáu phân hệ vừa soát, mỗi phân hệ đều tìm ra ít nhất
 * một quy tắc **trông như đã làm mà thực tế chưa chạy**: `postTypes` của nhóm chỉ
 * để hiển thị, 7 trong 10 quyền nhóm không ai đọc, `used` của mọi quota trả 0,
 * `canViewExactLocation` hardcode `false` ngay dưới một docblock khẳng định quy
 * tắc đã hiện thực.
 *
 * ## Vì sao là một phép kiểm, không phải một file Markdown
 *
 * Một bảng Markdown rữa trong im lặng: SRS lên bản mới, thêm ba quy tắc, bảng vẫn
 * xanh vì không ai so. Ba phép kiểm dưới đây buộc bảng và SRS phải khớp, và quan
 * trọng nhất là **cái chốt một chiều** ở `UnverifiedBaseline`: số quy tắc chưa
 * đối chiếu chỉ được phép GIẢM. Thêm một `UNVERIFIED` mới là đỏ.
 *
 * ## `status` nghĩa là gì
 *
 * - `IMPLEMENTED` — đã đối chiếu tận mã nguồn trong lượt soát này, `where` trỏ
 *   đúng chỗ quyết định.
 * - `PARTIAL` — có hiện thực nhưng LỆCH đặc tả ở một điểm nêu rõ trong `note`.
 * - `NOT_IMPLEMENTED` — chưa làm, `note` nói vì sao (thường là phân hệ chưa dựng).
 * - `UNVERIFIED` — **chưa ai đối chiếu**. Không phải "chưa làm", và cũng không
 *   phải "đã làm": đúng nghĩa là chưa biết. Đây là con số cần kéo về 0.
 *
 * ## Một lỗi của chính SRS, ghi lại ở đây
 *
 * `BR_AUTH_04` xuất hiện HAI LẦN với nội dung khác nhau: dòng ~535 nói không cần
 * xác thực email để kích hoạt tài khoản, dòng ~616 nói việc xoá tài khoản phải ẩn
 * danh hoá theo Nghị định 13/2023. Sổ này giữ hai dòng riêng với hậu tố `(a)`/`(b)`
 * ở `title`, còn `id` thì vẫn là một — vì đó là thứ SRS đang viết.
 */

type TraceStatus = 'IMPLEMENTED' | 'PARTIAL' | 'NOT_IMPLEMENTED' | 'UNVERIFIED';

interface BrTraceEntry {
  readonly id: string;
  /** Tóm tắt quy tắc, đủ để đọc sổ mà không mở SRS. */
  readonly title: string;
  readonly status: TraceStatus;
  /** Chỗ quyết định trong mã nguồn. Bắt buộc với IMPLEMENTED và PARTIAL. */
  readonly where?: string;
  /** Vì sao chưa làm, hoặc lệch ở đâu. Bắt buộc với PARTIAL và NOT_IMPLEMENTED. */
  readonly note?: string;
}

const SrsDir = join(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  '..',
  'docs',
  'software-requirement-specification',
);

const BrIdPattern = /BR[_-][A-Za-z0-9]+[_-][0-9]+/g;

/**
 * Đọc đúng MỘT file SRS.
 *
 * Nhiều file `SRS_*.md` cùng lúc là một câu hỏi không có câu trả lời — bản nào
 * đang là bản chốt? Ném ở đây thay vì tự chọn một bản: tự chọn là tự quyết hộ
 * Bên A, và sổ sẽ so với một bản không ai đồng ý.
 */
function readSrs(): string {
  const candidates = readdirSync(SrsDir).filter(
    (name) => name.startsWith('SRS_') && name.endsWith('.md'),
  );

  if (candidates.length !== 1)
    throw new Error(
      `Cần đúng một file SRS_*.md trong ${SrsDir}, đang thấy ${candidates.length}: ${candidates.join(', ')}`,
    );

  return readFileSync(join(SrsDir, candidates[0]), 'utf-8');
}

/**
 * Các id BR có trong SRS.
 *
 * Bỏ những dòng ảnh base64 trước khi quét: chúng dài hàng trăm nghìn ký tự và
 * một chuỗi base64 đủ dài sẽ tình cờ chứa thứ trông như một id.
 */
function srsBrIds(): Set<string> {
  const body = readSrs()
    .split('\n')
    .filter((line) => !line.startsWith('![](data:image'))
    .join('\n');

  return new Set(body.match(BrIdPattern) ?? []);
}

/**
 * Sổ truy vết. Mỗi dòng là một quy tắc SRS.
 *
 * Thêm/đổi dòng nào thì phải đối chiếu mã nguồn thật, không suy từ tên quy tắc.
 */
const BrTrace: readonly BrTraceEntry[] = [
  // ── Tài khoản và hồ sơ ────────────────────────────────────────────────────
  {
    id: 'BR_AUTH_01',
    title: 'Không lưu mật khẩu plaintext trong CSDL hoặc log',
    status: 'IMPLEMENTED',
    where:
      'register-user.use-case.ts chỉ ghi `passwordHash` qua `passwordService.hash`; ' +
      'không chỗ nào ghi `password` thô',
  },
  {
    id: 'BR_AUTH_02',
    title:
      'username duy nhất KHÔNG phân biệt hoa thường; email/SĐT không trùng',
    status: 'IMPLEMENTED',
    where:
      'migration 1789700000000: UQ_users_username_lower và UQ_users_email_lower ' +
      'đều là UNIQUE INDEX trên LOWER(...)',
  },
  {
    id: 'BR_AUTH_03',
    title: 'Điểm/hạng khởi tạo theo cấu hình, không dùng số dư mặc định',
    status: 'UNVERIFIED',
  },
  {
    id: 'BR_AUTH_04',
    title:
      '(a) Không cần xác thực email để kích hoạt, đăng ký xong tự đăng nhập — ' +
      '(b) xoá tài khoản phải ẩn danh hoá, không xoá vật lý (NĐ 13/2023)',
    status: 'IMPLEMENTED',
    where:
      '(a) register-user.use-case.ts gọi `sessionIssuer.issue` ngay sau khi tạo; ' +
      '(b) delete-account.use-case.ts ẩn danh hoá thay vì DELETE',
    note: 'Id này bị SRS dùng cho HAI quy tắc khác nhau — xem docblock đầu file.',
  },
  {
    id: 'BR_AUTH_05',
    title: 'Tài khoản còn giao dịch dở dang thì không cho xoá',
    status: 'IMPLEMENTED',
    where:
      'delete-account.use-case.ts đếm `countOpenForUser` rồi ném ' +
      'UserHasOpenTransactionsException',
  },
  {
    id: 'BR_PROF_01',
    title: 'Hồ sơ đủ điều kiện = Họ tên + Avatar + SĐT + Email',
    status: 'IMPLEMENTED',
    where:
      'core-lib `missingProfileFields` kiểm đúng bốn trường; ProfileGate là cổng ' +
      'duy nhất, dùng cho đăng bài, xin nhận, chat và tạo Group',
  },

  // ── Bài đăng ──────────────────────────────────────────────────────────────
  { id: 'BR_POST_01', title: 'Bắt buộc 1-5 ảnh mỗi bài', status: 'UNVERIFIED' },
  {
    id: 'BR_POST_02',
    title:
      'Quyền tạo bài theo Rank, hạn mức bài đang hoạt động, trạng thái tài khoản và Profile Completion',
    status: 'IMPLEMENTED',
    where:
      'create-post.use-case.ts: ProfileGate + entitlement `POST_OPEN`/`POST_SOS` ' +
      'với `resolveQuotaLimit` fail-closed',
  },
  {
    id: 'BR_POST_03',
    title: 'Toạ độ phải trong lãnh thổ Việt Nam (8.18-23.39, 102.14-109.46)',
    status: 'UNVERIFIED',
  },
  {
    id: 'BR_POST_04',
    title: 'Người cho khai giá trị tham khảo (VNĐ) làm cơ sở quy ra điểm',
    status: 'IMPLEMENTED',
    where:
      'core-lib `quoteRedemption` + `PointRedemptionConfigKey` (2.000 VNĐ/điểm); ' +
      'thiếu giá trị thì ra REDEMPTION_PRICE_UNAVAILABLE',
  },
  {
    id: 'BR_POST_05',
    title:
      'Bắt buộc chọn ít nhất một hình thức nhận đồ (SELF_PICKUP hoặc SHIPPING)',
    status: 'UNVERIFIED',
  },

  // ── Bản đồ và cự ly ───────────────────────────────────────────────────────
  {
    id: 'BR_GIS_01',
    title:
      'Map Discovery chỉ hiện nội dung được phép công khai và có vị trí hợp lệ',
    status: 'IMPLEMENTED',
    where:
      'post.repository.ts `findMapClusters`/`findNearbyPosts` đều lọc ' +
      '`PubliclyVisibleGiftPostStatuses` và `deletedAt IS NULL`',
  },
  {
    id: 'BR-GIS-02',
    title:
      'API nhận category_id/post_type tuỳ chọn; cự ly dùng ST_DWithin + GIST',
    status: 'IMPLEMENTED',
    where: 'GeoQueryHelper.applyRadiusFilter dùng ST_DWithin; IDX geo là GIST',
  },
  {
    id: 'BR-GIS-03',
    title: 'Điều kiện lọc giữ nguyên khi nội dung lên Map Discovery',
    status: 'UNVERIFIED',
  },
  {
    id: 'BR-GIS-04',
    title: '"Quanh Đây" và Distance Filter là hai chức năng khác nhau',
    status: 'UNVERIFIED',
  },
  {
    id: 'BR-GIS-05',
    title:
      'Chọn marker chỉ hiện preview ngắn, xem đầy đủ phải về Detail của module nguồn',
    status: 'IMPLEMENTED',
    where:
      'get-post-map.use-case.ts trả `marker` rút gọn + `deepLinkPath`, không trả nội dung đầy đủ',
  },
  {
    id: 'BR-GIS-06',
    title: 'Lên bản đồ không làm đổi quyền nghiệp vụ gốc của nội dung',
    status: 'UNVERIFIED',
  },

  // ── Chat ──────────────────────────────────────────────────────────────────
  {
    id: 'BR_CHAT_01',
    title:
      'Không có tìm kiếm người dùng để nhắn tin; chat CHỈ mở khi có giao dịch hợp lệ',
    status: 'IMPLEMENTED',
    where:
      'phòng chat chỉ được mở trong `openRoomWithinTransaction`, gọi từ đúng ' +
      'đường duyệt yêu cầu; không endpoint nào tạo phòng trực tiếp',
  },
  {
    id: 'BR_CHAT_02',
    title:
      'Tin nhắn lưu bền vững trước/đồng thời với phát sự kiện; không attachment ở Phase 1',
    status: 'UNVERIFIED',
  },

  // ── Giới thiệu ────────────────────────────────────────────────────────────
  {
    id: 'BR_REF_01',
    title: 'Mã giới thiệu duy nhất, hệ thống sinh tự động sau khi đăng ký',
    status: 'IMPLEMENTED',
    where:
      'core-lib `makeReferralCode` + `referralCodeCandidates`; UQ_users_referral_code ' +
      'và vòng thử lại theo tên ràng buộc',
  },
  {
    id: 'BR_REF_02',
    title:
      'Một tài khoản chỉ dùng MỘT mã giới thiệu khi đăng ký, không đổi được sau đó',
    status: 'IMPLEMENTED',
    where:
      'bảng `referrals` chỉ ghi thêm, có trigger chặn UPDATE; khoá duy nhất theo invitee',
  },
  {
    id: 'BR_REF_03',
    title:
      'Personal Referral thưởng MỘT lần, đủ điều kiện ngay khi đăng ký hợp lệ',
    status: 'IMPLEMENTED',
    where: 'qualify-referral use case + idempotency_key trên point_ledger',
  },

  // ── Chiến dịch và Home nổi bật — CHƯA DỰNG ───────────────────────────────
  {
    id: 'BR_CAMP_01',
    title:
      'Nhiều chiến dịch chạy song song, chỉ MỘT featured_home tại một thời điểm',
    status: 'NOT_IMPLEMENTED',
    note: 'Không bảng `campaign`, không endpoint Home động (UC-ADM-03 chưa bắt đầu)',
  },
  {
    id: 'BR_CAMP_02',
    title: 'Home nổi bật hết hạn thì fallback về Home mặc định',
    status: 'NOT_IMPLEMENTED',
    note: 'Cùng lý do BR_CAMP_01',
  },

  // ── Danh mục ──────────────────────────────────────────────────────────────
  {
    id: 'BR-CAT-01',
    title:
      'Mỗi bài phải gắn category_id; danh mục lưu động trong CSDL, không hard-code',
    status: 'IMPLEMENTED',
    where:
      'bảng `categories` có id/name/slug/icon/sort_order/is_active/parent_id; ' +
      '`posts.category_id` NOT NULL. SRS gọi cột thứ tự là `display_order`, mã ' +
      'nguồn đặt `sort_order` — đổi tên, cùng vai trò',
  },
  {
    id: 'BR-CAT-02',
    title: 'Danh mục baseline + Admin được bổ sung, đổi tên, sắp xếp, ẩn',
    status: 'IMPLEMENTED',
    where:
      'create/update-category use case + `GET|POST|PATCH /admin/categories`',
  },
  {
    id: 'BR-CAT-03',
    title:
      'Danh mục đang được bài tham chiếu KHÔNG được xoá cứng — chỉ deactivate hoặc migrate',
    status: 'IMPLEMENTED',
    where:
      'merge-category.use-case.ts: `merged_into_id` + `is_active = false`, chuyển bài sang danh mục đích; không có đường DELETE',
  },

  // ── Thiện nguyện — CHƯA DỰNG ──────────────────────────────────────────────
  {
    id: 'BR-CHARITY-01',
    title: 'Admin tạo hoạt động trực tiếp; TV Kim Cương tạo ở PENDING_APPROVAL',
    status: 'NOT_IMPLEMENTED',
    note: 'Ba endpoint charity campaigns của SRS đều chưa có; không bảng sự kiện thiện nguyện',
  },
  {
    id: 'BR-CHARITY-02',
    title: 'Hệ thống không tự đối soát số lượng hiện vật ngoài đời',
    status: 'NOT_IMPLEMENTED',
    note: 'Cùng lý do BR-CHARITY-01',
  },
  {
    id: 'BR-CHARITY-03',
    title:
      'Huỷ tham gia khi Event chưa bắt đầu; đánh giá hai chiều sau khi kết thúc',
    status: 'NOT_IMPLEMENTED',
    note: 'Cùng lý do BR-CHARITY-01',
  },

  // ── Phật Pháp — CHƯA DỰNG ─────────────────────────────────────────────────
  {
    id: 'BR-DHARMA-01',
    title:
      'Dùng chung mô hình content_type/category thay vì engine riêng từng loại nội dung',
    status: 'NOT_IMPLEMENTED',
    note: 'Toàn phân hệ chưa dựng: `DHARMA_THREAD` chỉ tồn tại như một subject type của reaction/share, không bảng, không endpoint',
  },
  {
    id: 'BR-DHARMA-02',
    title:
      'Media dùng cơ chế upload R2 hiện có; metadata ở PostgreSQL; không thêm Kafka',
    status: 'NOT_IMPLEMENTED',
    note: 'Cùng lý do BR-DHARMA-01. Phần hạ tầng (R2, PostgreSQL) đã có sẵn và đúng hướng',
  },
  {
    id: 'BR-DHARMA-03',
    title: 'Notification Phật Pháp tái dùng FCM/In-App hiện có',
    status: 'NOT_IMPLEMENTED',
    note: 'Cùng lý do BR-DHARMA-01',
  },
  {
    id: 'BR-DHARMA-04',
    title: 'Phạm vi Phật Pháp là P0, hấp thụ trong effort hiện tại',
    status: 'NOT_IMPLEMENTED',
    note: 'Quy tắc về phạm vi/effort, không phải về hành vi phần mềm — không có chỗ nào trong mã nguồn hiện thực được nó',
  },

  // ── Nhóm ──────────────────────────────────────────────────────────────────
  {
    id: 'BR-GRP-01',
    title:
      'Baseline chỉ TV Kim Cương được CREATE_GROUP, Admin đổi được; mỗi user tối đa 01 Group',
    status: 'IMPLEMENTED',
    where:
      'group.use-cases.ts + capability CREATE_GROUP; UQ một thành viên một nhóm',
  },
  {
    id: 'BR-GRP-02',
    title:
      'Điểm vào: Cá nhân → Nhóm của tôi, phân nhánh theo Owner/Member/đủ điều kiện tạo',
    status: 'IMPLEMENTED',
    where:
      '`GET /groups/me` (SRS gọi là `GET /profile/my-group` — đổi tên, cùng chức năng)',
  },
  {
    id: 'BR-GRP-03',
    title:
      'Copy default_location sang center_location và snapshot radius lúc tạo; sau đó không đổi',
    status: 'IMPLEMENTED',
    where:
      'group.use-cases.ts + migration 1796100000000 seed radius theo hạng; admin-group-radius.controller.ts',
  },
  {
    id: 'BR-GRP-04',
    title:
      'Trường tối thiểu của Group; Invite Link không tự hết hạn khi Group ACTIVE',
    status: 'IMPLEMENTED',
    where:
      'migration 1793700000000 CreateGroups; register-user.use-case.ts nhận group_invite_token',
  },
  {
    id: 'BR-GRP-05',
    title: 'Chỉ Owner tạo/quản lý Sub-team; Member không thấy mục quản trị',
    status: 'IMPLEMENTED',
    where:
      'group-management.use-cases.ts + quyền theo vai trong group.repository.ts; test/group.check.ts canh',
  },
  {
    id: 'BR-GRP-06',
    title:
      'Owner tụt Rank vẫn giữ quyền quản trị; user không tự rời/chuyển Group ở Phase 1',
    status: 'IMPLEMENTED',
    where:
      'core-lib/consts/group.ts + group.controller.ts; không có endpoint rời nhóm',
  },
  {
    id: 'BR-GRP-07',
    title:
      'Owner xoá tài khoản thì Group giải tán, không chuyển Owner; Invite Link mất hiệu lực',
    status: 'IMPLEMENTED',
    where:
      'delete-account.use-case.ts giải tán nhóm; port group.repository.ts ghi chú BR-GRP-07',
  },

  // ── Affiliate nhóm ────────────────────────────────────────────────────────
  {
    id: 'BR-AFF-01',
    title:
      'Group Affiliate độc lập Personal Referral; Phase 1 một tầng (depth = 1)',
    status: 'UNVERIFIED',
  },
  {
    id: 'BR-AFF-02',
    title: 'Baseline áp cho toàn bộ nhóm event Admin bật trong Point Rule',
    status: 'PARTIAL',
    where: '`GET /groups/{id}/affiliate` đọc được số liệu',
    note: 'Bộ máy chia thưởng chưa dựng: ba endpoint affiliate engine của SRS còn thiếu, và tỷ lệ chia (A1-A5) đang chờ Bên A — xem docs/diagram/31-open-items.md',
  },
  {
    id: 'BR-AFF-03',
    title:
      'Một source event sinh nhiều reward record, mỗi beneficiary là một Active Member',
    status: 'NOT_IMPLEMENTED',
    note: 'Cùng lý do BR-AFF-02: chưa có đường sinh reward',
  },
  {
    id: 'BR-AFF-04',
    title:
      'Không cộng lặp cùng beneficiary + source reference + event_type; huỷ thì ghi adjustment',
    status: 'NOT_IMPLEMENTED',
    note: 'Cùng lý do BR-AFF-02. Cơ chế chống lặp (`idempotency_key`) và ghi bù (`appendAdjustment`) đã có sẵn, chỉ thiếu chỗ gọi',
  },

  // ── Độ chính xác mô tả của người tặng ─────────────────────────────────────
  {
    id: 'BR-ACC-01',
    title: 'Giver Accuracy là chỉ số RIÊNG, tách khỏi Điểm Cống hiến/Rank',
    status: 'IMPLEMENTED',
    where:
      'core-lib/models/transaction-review.ts tính riêng; không bút toán point_ledger nào đọc nó',
  },
  {
    id: 'BR-ACC-02',
    title:
      'Sau COMPLETED, Receiver đánh giá 0-100%; lưu từng mẫu và số mẫu hợp lệ',
    status: 'IMPLEMENTED',
    where: 'reviews use case + bảng đánh giá; test/reviews.check.ts',
  },
  {
    id: 'BR-ACC-03',
    title:
      'Ngưỡng cảnh báo 75% sau tối thiểu 05 mẫu hợp lệ thì vào REVIEW_REQUIRED',
    status: 'IMPLEMENTED',
    where:
      'core-lib/models/transaction-review.ts: `reviewThresholdPercent: 75`, `minSamples: 5`',
  },
  {
    id: 'BR-ACC-04',
    title: 'Tracking không đồng nghĩa ban user; mọi can thiệp phải ghi reason',
    status: 'IMPLEMENTED',
    where:
      '`GET /admin/users?accuracyReviewRequired=true` chỉ là hàng đợi, không tự phạt; mọi can thiệp đi qua `appendAudit`',
  },

  // ── Thông báo ─────────────────────────────────────────────────────────────
  {
    id: 'BR-NOTI-01',
    title: 'Phân loại thông báo tối thiểu 9 nhóm',
    status: 'UNVERIFIED',
  },
  {
    id: 'BR-NOTI-02',
    title:
      'Trigger bắt buộc: biến động điểm, 70% ngưỡng hạng, nâng/tụt hạng, trước 1 tháng hết chu kỳ, transaction/chat, moderation, campaign',
    status: 'PARTIAL',
    where:
      'RankChangeNotifier, AcceptedRequestNotifier, RequestLifecycleNotifier, cron nhắc hạn',
    note: 'Nhánh campaign/lịch sự kiện chưa có vì phân hệ chiến dịch chưa dựng (xem BR_CAMP_01)',
  },
  {
    id: 'BR-NOTI-03',
    title:
      'Mọi push quan trọng đồng thời lưu In-App để xem lịch sử đã đọc/chưa đọc',
    status: 'PARTIAL',
    where: 'bảng `notifications` lưu đủ, có `idempotency_key` chống trùng',
    note: 'Phần In-App chạy đủ; phần PUSH thì chưa — `LoggingPushSender` là `IPushSender` duy nhất và ở production nó fail-closed. FCM thật vẫn là việc của F44',
  },

  // ── Điểm ──────────────────────────────────────────────────────────────────
  {
    id: 'BR-POINT-01',
    title:
      'Mọi mức cộng/trừ điểm do Admin cấu hình trong Point Rule, không hard-code',
    status: 'IMPLEMENTED',
    where:
      'bảng `point_rules` + `appendByRule`; `GET|PATCH /admin/points/rules`',
  },
  {
    id: 'BR-POINT-02',
    title:
      'Điểm theo giá trị vật phẩm: 100% ứng X điểm do Admin cấu hình, các mức % quy đổi theo',
    status: 'UNVERIFIED',
  },
  {
    id: 'BR-POINT-03',
    title:
      'Like/Comment chỉ sinh điểm nếu Point Rule được bật; Comment chỉ lần đầu trong ngày',
    status: 'UNVERIFIED',
  },
  {
    id: 'BR-POINT-04',
    title:
      'Điểm trừ vi phạm, ngưỡng và severity do Admin cấu hình; mọi action ghi lý do/Audit Log',
    status: 'UNVERIFIED',
  },
  {
    id: 'BR-POINT-05',
    title:
      'Mọi biến động điểm ghi Point Ledger đủ user_id, event_type, idempotency_key, delta, balance_after, actor/source, created_at',
    status: 'IMPLEMENTED',
    where:
      'migration 1790000000000: `point_ledger` có đủ các cột đó, UQ_point_ledger_idempotency_key, và trigger chặn UPDATE',
  },
  {
    id: 'BR-POINT-06',
    title:
      'Rank dùng SỐ DƯ hiện tại, KHÔNG dùng lifetime riêng; ledger đổi thì xét lại Rank',
    status: 'PARTIAL',
    where:
      'RankChangeNotifier.afterBalanceChange xét lại sau mọi biến động; mặc định `rank.points_source = BALANCE` đúng đặc tả',
    note: 'LỆCH: nguồn tính hạng là cấu hình động và Admin bật được `LIFETIME` — đúng thứ SRS nói là không dùng. Mặc định đúng, nhưng đặc tả không cho phép lựa chọn này tồn tại; cần Bên A chốt giữ hay bỏ',
  },

  // ── Báo xấu ───────────────────────────────────────────────────────────────
  {
    id: 'BR-REP-02',
    title:
      'Nhóm report mở rộng: sai sự thật, ảnh/clip vi phạm, bình luận phản cảm, thao túng điểm/referral, khai giá trị quá sai, nhóm khác do Admin cấu hình',
    status: 'UNVERIFIED',
  },
  {
    id: 'BR-REP-03',
    title:
      'Chỉ thưởng điểm cho người báo cáo SAU khi Admin xác minh hợp lệ; dismiss thì không thưởng',
    status: 'IMPLEMENTED',
    where:
      'report.use-cases.ts ghi điểm với `source: REPORT` chỉ ở nhánh Admin duyệt hợp lệ',
  },
  {
    id: 'BR-REP-04',
    title:
      'Enforcement: nhắc nhở, takedown, trừ điểm, hạ bậc, giới hạn quyền, treo có thời hạn, khoá; mọi action ghi Audit Log và phát notification',
    status: 'UNVERIFIED',
  },
];

/**
 * Số quy tắc CHƯA đối chiếu, tại thời điểm dựng sổ (01/10).
 *
 * Đây là một cái chốt MỘT CHIỀU: phép kiểm dưới đây đỏ khi con số vượt mốc này.
 * Hạ mốc khi đối chiếu thêm được quy tắc; **không bao giờ nâng**. Nâng mốc để cho
 * xanh là bỏ đúng cái việc mà sổ này tồn tại để theo dõi.
 */
const UnverifiedBaseline = 15;

describe('truy vết BR của SRS sang mã nguồn', () => {
  it('mọi BR id trong SRS đều có một dòng trong sổ', () => {
    // Đỏ khi SRS lên bản mới và thêm quy tắc. Đây là nửa quan trọng hơn: thiếu
    // nó thì sổ đứng yên trong khi đặc tả đi tiếp, và không ai biết.
    const inSrs = srsBrIds();
    const inRegistry = new Set(BrTrace.map((entry) => entry.id));

    const missing = [...inSrs].filter((id) => !inRegistry.has(id)).sort();

    expect(missing).toEqual([]);
  });

  it('sổ không có dòng chết — mọi id phải còn trong SRS', () => {
    const inSrs = srsBrIds();

    const stale = BrTrace.map((entry) => entry.id)
      .filter((id) => !inSrs.has(id))
      .sort();

    expect(stale).toEqual([]);
  });

  it('không có id trùng trong sổ', () => {
    const ids = BrTrace.map((entry) => entry.id);

    expect(ids).toHaveLength(new Set(ids).size);
  });

  it('IMPLEMENTED và PARTIAL phải trỏ được tới chỗ quyết định', () => {
    // Một dòng ghi "đã làm" mà không nói ở đâu thì không kiểm lại được, và nó
    // chính là thứ sổ này thay thế.
    const unsourced = BrTrace.filter(
      (entry) =>
        (entry.status === 'IMPLEMENTED' || entry.status === 'PARTIAL') &&
        !entry.where?.trim(),
    ).map((entry) => entry.id);

    expect(unsourced).toEqual([]);
  });

  it('PARTIAL và NOT_IMPLEMENTED phải nói vì sao', () => {
    const unexplained = BrTrace.filter(
      (entry) =>
        (entry.status === 'PARTIAL' || entry.status === 'NOT_IMPLEMENTED') &&
        !entry.note?.trim(),
    ).map((entry) => entry.id);

    expect(unexplained).toEqual([]);
  });

  it('mọi dòng đều có tiêu đề đọc được mà không mở SRS', () => {
    const untitled = BrTrace.filter(
      (entry) => entry.title.trim().length < 10,
    ).map((entry) => entry.id);

    expect(untitled).toEqual([]);
  });

  it('số quy tắc CHƯA đối chiếu không được tăng', () => {
    // Chốt một chiều. Hạ `UnverifiedBaseline` khi đối chiếu thêm được; nâng nó
    // để cho xanh là bỏ đúng cái việc sổ này theo dõi.
    const unverified = BrTrace.filter(
      (entry) => entry.status === 'UNVERIFIED',
    ).map((entry) => entry.id);

    expect(unverified.length).toBeLessThanOrEqual(UnverifiedBaseline);
  });

  it('UNVERIFIED không được mang where hay note — nó nghĩa là CHƯA BIẾT', () => {
    // Một dòng vừa `UNVERIFIED` vừa có `where` là đã đối chiếu rồi mà quên đổi
    // trạng thái, và nó làm con số ở trên nói sai theo chiều xấu.
    const contradictory = BrTrace.filter(
      (entry) =>
        entry.status === 'UNVERIFIED' &&
        (Boolean(entry.where?.trim()) || Boolean(entry.note?.trim())),
    ).map((entry) => entry.id);

    expect(contradictory).toEqual([]);
  });
});
