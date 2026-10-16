/**
 * Hoạt động Từ thiện trên Postgres THẬT (F65 phân hệ 1, BR-CHARITY-01..03).
 *
 * ## Vì sao phải có script này
 *
 * Năm điều dưới đây không một unit test mock nào trả lời được, và cả năm đều là chỗ nếu
 * sai thì sai lặng lẽ:
 *
 * 1. **Hai đường tạo, hai trạng thái duyệt** — đường thành viên hỏi Rank Config qua
 *    `EntitlementRepository` THẬT, đường Admin hỏi `admin_role_permissions` THẬT. Mock
 *    `getCapability` trả `{allowed: true}` là mock đúng cái câu hỏi cần kiểm.
 * 2. **Hồ sơ chờ duyệt không lọt đường công khai** — mệnh đề `WHERE` của
 *    `findPublicByIdOrSlug`, không phải một nhánh `if` nào.
 * 3. **`register` hai lần phải ra `created: false`** — nó phụ thuộc mệnh đề
 *    `WHERE campaign_participations.status = 'CANCELLED'` trên nhánh `DO UPDATE`, tức
 *    phụ thuộc hành vi `ON CONFLICT` của Postgres.
 * 4. **`participantCount` là CÂU CON, không phải cột** — nên nó không thể lệch, và phép
 *    kiểm duy nhất có nghĩa là đếm thật sau khi có người huỷ.
 * 5. **BR-CHARITY-02: KHÔNG tự đối soát** — nhóm 7 chứng minh bằng cách tạo dữ liệu tham
 *    gia rồi khẳng định `current_items_count` vẫn là 0. Một trigger hay hook lọt vào sau
 *    này sẽ làm nhóm đó đỏ.
 *
 * ## Bài học từ `blog.check.ts`
 *
 * Nhóm 1 của script Blog từng tự gọi bộ lọc HTML rồi đưa kết quả cho repository — tức nó
 * kiểm chính nó, không kiểm use case. Nên ở đây nhóm 1, 3, 4, 5, 6 đi qua ĐÚNG use case
 * thật; chỉ nhóm 2 (ràng buộc database) và nhóm 7 chèn SQL trực tiếp, và chèn trực tiếp là
 * đúng mục đích của chúng.
 *
 * ## Đã chứng minh script này THẬT SỰ kiểm
 *
 * Xanh hết không chứng minh gì — `blog.check.ts` từng xanh trong khi không kiểm gì cả. Nên
 * tôi phá hai mệnh đề chịu lực nhất rồi chạy lại:
 *
 * - Bỏ `WHERE campaign_participations.status = 'CANCELLED'` ở nhánh `ON CONFLICT DO UPDATE`
 *   → *"Đăng ký lần hai -> CharityAlreadyRegistered"* ĐỎ.
 * - Bỏ `AND approval_status = 'PENDING_APPROVAL'` trong `UPDATE` của `decideApproval`
 *   → *"Duyệt lần hai cùng hồ sơ"* ĐỎ.
 *
 * ## Một lượt ném ngoài dự kiến sẽ DỪNG script, không chỉ ghi một dòng FAIL
 *
 * Phát hiện ngay trong lượt phá ở trên: khi `decideApproval` mất mệnh đề canh, lượt duyệt
 * thứ hai ĐỔI hồ sơ sang `REJECTED`, nên nhóm 5 gọi `loadPublicCampaign` và ném — script
 * chết ở đó, mất luôn báo cáo của nhóm 5 tới 10.
 *
 * Để nguyên có ý thức: `process.exitCode` vẫn là 1 nên không có chuyện báo xanh sai, và mọi
 * script `*.check.ts` trong repo cùng hình dạng này. Nhưng ai đọc output phải biết **một
 * lượt dừng giữa đường KHÔNG có nghĩa là các nhóm sau đã qua** — sửa nhóm đỏ đầu tiên rồi
 * chạy lại mới thấy phần còn lại.
 */
import { resolveAllEntities } from '@chantam/service.persistency-lib';
import { config as loadEnvFile } from 'dotenv';
import { DataSource } from 'typeorm';
import {
  CancelCharityParticipationUseCase,
  CreateCharityCampaignUseCase,
  DecideCharityApprovalUseCase,
  JoinCharityCampaignUseCase,
  ListJoinedCharityCampaignsUseCase,
  ReplaceCharityMediaUseCase,
  ReviewCharityCampaignUseCase,
  UpdateCharityProgressUseCase,
} from '../src/application/implementations/charity-campaign/charity-campaign.use-cases';
import { IGiftRequestRepository } from '../src/domain/ports/repository';
import * as entities from '../src/infrastructure/entity';
import * as migrations from '../src/infrastructure/persistence/migrations';
import { AdminConfigRepository } from '../src/infrastructure/repository/admin-config.repository';
import { CharityCampaignRepository } from '../src/infrastructure/repository/charity-campaign.repository';
import { EntitlementRepository } from '../src/infrastructure/repository/entitlement.repository';
import { PointLedgerRepository } from '../src/infrastructure/repository/point-ledger.repository';
import {
  fakeCampaignMediaStorage,
  freshMediaKey,
} from './fake-campaign-media-storage';

loadEnvFile({ path: '.env.local' });
loadEnvFile();

const ScratchDatabase = 'chantam_charity_check';

// UUID việt tay thì mọi ký tự phải là chữ số HEX. Bản đầu của tôi dùng `...j1` và
// `...j2` cho hai người tham gia — `j` không phải hex, và Postgres sẽ từ chối cả sáu
// lượt chèn vốn để dựng dự liệu, làm toàn bộ script đỏ vì một lý do không liên quan
// đến F65.
const DiamondId = 'c1000000-0000-4000-8000-0000000000d1';
/**
 * Người tổ chức của hồ sơ CHỜ DUYỆT dùng suốt phần còn lại của script — hạng Vàng.
 *
 * Tới 11/10 vai này do Kim Cương đóng, vì khi đó Kim Cương tạo thì vào
 * `PENDING_APPROVAL`. Từ F65b lát A, Kim Cương có `PUBLISH_CHARITY_WITHOUT_REVIEW` và
 * public NGAY (§2, tiêu chí §11.11), nên không còn dựng được hồ sơ chờ duyệt từ Kim
 * Cương. Vàng tạo được kêu gọi cá nhân nhưng không được public ngay — đúng vai cần.
 */
const OrganizerId = 'c1000000-0000-4000-8000-0000000000a9';
const MemberId = 'c1000000-0000-4000-8000-0000000000e1';
const AdminId = 'c1000000-0000-4000-8000-0000000000ad';
const JoinerId = 'c1000000-0000-4000-8000-0000000000b1';
const OtherJoinerId = 'c1000000-0000-4000-8000-0000000000b2';
const OutsiderId = 'c1000000-0000-4000-8000-0000000000ff';

const failures: string[] = [];

function check(label: string, ok: boolean, detail = ''): void {
  console.log(
    `  ${ok ? 'OK  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`,
  );
  if (!ok) failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
}

/** Kỳ vọng một lượt gọi NÉM, và ném đúng loại lỗi mang tên đó. */
async function expectThrow(
  label: string,
  run: () => Promise<unknown>,
  expectedName: string,
): Promise<void> {
  try {
    await run();
    check(label, false, 'không ném gì');
  } catch (error) {
    const name = (error as Error).constructor.name;
    check(label, name === expectedName, `ném ${name}`);
  }
}

/** Kỳ vọng database TỪ CHỐI, và thông báo chứa tên ràng buộc. */
async function expectReject(
  label: string,
  run: () => Promise<unknown>,
  fragment: string,
): Promise<void> {
  try {
    await run();
    check(label, false, 'không ném gì — ràng buộc không chặn');
  } catch (error) {
    const message = (error as Error).message;
    check(label, message.includes(fragment), message.slice(0, 110));
  }
}

const Hour = 3_600_000;

function writeInput(overrides: Record<string, unknown> = {}) {
  const start = new Date(Date.now() + 24 * Hour);
  return {
    // Hoạt động có tổ chức: loại duy nhất tồn tại trước 12/10, nên mọi phép kiểm
    // trong file này vẫn nói đúng điều chúng vốn nói (F65b §10).
    campaignType: 'ORGANIZED_CAMPAIGN' as const,
    title: 'Bếp cơm Vu Lan 2026',
    description: 'Nấu và trao 500 suất cơm chay tại Chùa Vĩnh Nghiêm.',
    badgeName: 'Tấm lòng Vu Lan',
    targetItemsCount: 500,
    lat: 10.7797,
    lng: 106.699,
    locationLabel: 'Chùa Vĩnh Nghiêm, Quận 3',
    startTime: start.toISOString(),
    endTime: new Date(start.getTime() + 8 * Hour).toISOString(),
    ...overrides,
  };
}

async function main(): Promise<void> {
  const baseUri = process.env.DATABASE_URI;
  if (!baseUri) throw new Error('Thiếu DATABASE_URI.');

  const adminUri = baseUri.replace(/\/[^/?]+(\?|$)/, '/postgres$1');
  const scratchUri = baseUri.replace(/\/[^/?]+(\?|$)/, `/${ScratchDatabase}$1`);

  const opened: DataSource[] = [];
  const admin = new DataSource({ type: 'postgres', url: adminUri });
  await admin.initialize();
  opened.push(admin);
  await admin.query(`DROP DATABASE IF EXISTS ${ScratchDatabase}`);
  await admin.query(`CREATE DATABASE ${ScratchDatabase}`);

  const dataSource = new DataSource({
    type: 'postgres',
    url: scratchUri,
    entities: resolveAllEntities(entities),
    migrations: resolveAllEntities(migrations),
    migrationsTableName: 'migrations',
    extra: { max: 10 },
  });
  await dataSource.initialize();
  opened.push(dataSource);
  await dataSource.runMigrations();
  console.log('Đã dựng schema trên database nháp\n');

  try {
    const repository = new CharityCampaignRepository(
      dataSource.manager,
      // Sổ điểm THẬT: bút toán của lượt giao nhận từ thiện ghi trong transaction
      // hoàn tất, nên một mock ở đây bỏ đúng chỗ cần kiểm.
      new PointLedgerRepository(dataSource.manager),
    );
    // `EntitlementRepository` đòi một `IGiftRequestRepository` để đếm hạn mức đang dùng
    // của những capability CÓ bộ đếm. `SUBMIT_CHARITY_PROPOSAL` không có bộ đếm nào, nhưng
    // `getOwnEntitlements` trả MỌI capability của hạng đó và đếm cho từng cái có counter —
    // nên vẫn phải đưa một thứ gì đó vào.
    //
    // Dựng `GiftRequestRepository` thật ở đây là kéo theo `EntitySchema` và
    // `ChatRepository`, tức ba tầng phụ thuộc cho một con số mà phép kiểm này không hỏi.
    // Nên một stub hẹp, và cố ý KHÔNG bổ sung method nào khác: nếu mai sau
    // `getOwnEntitlements` đếm thêm thứ gì thì stub thiếu method sẽ ném
    // "is not a function" — ồn ào, đúng kiểu cần, chứ không âm thầm trả 0.
    const entitlements = new EntitlementRepository(dataSource.manager, {
      countOpenByRequester: async (): Promise<number> => 0,
    } as unknown as IGiftRequestRepository);
    const adminConfig = new AdminConfigRepository(dataSource.manager);

    const createUseCase = new CreateCharityCampaignUseCase(
      repository,
      entitlements,
      adminConfig,
      fakeCampaignMediaStorage(),
    );

    // Mỗi lượt tạo một key MỚI dưới namespace của đúng người tạo — key là UNIQUE
    // toàn bảng, và bản thật từ chối key nằm ngoài namespace của người gọi.
    const withMedia = <T extends { actorUserId: string }>(command: T) => {
      const key = freshMediaKey(command.actorUserId);
      return { media: [key], coverKey: key, ...command };
    };
    const joinUseCase = new JoinCharityCampaignUseCase(repository);
    const cancelUseCase = new CancelCharityParticipationUseCase(repository);
    const reviewUseCase = new ReviewCharityCampaignUseCase(repository);
    const progressUseCase = new UpdateCharityProgressUseCase(
      repository,
      adminConfig,
    );
    const decideUseCase = new DecideCharityApprovalUseCase(
      repository,
      adminConfig,
    );
    const joinedUseCase = new ListJoinedCharityCampaignsUseCase(repository);

    const seedUser = async (
      id: string,
      username: string,
      rank: string,
    ): Promise<void> => {
      await dataSource.query(
        `INSERT INTO users (global_id, username, password_hash, rank, status)
         VALUES ($1, $2, 'x', $3, 'ACTIVE')`,
        [id, username, rank],
      );
    };

    await seedUser(DiamondId, 'kimcuong', 'DIAMOND');
    await seedUser(OrganizerId, 'hangvang', 'GOLD');
    await seedUser(MemberId, 'thanhvien', 'MEMBER');
    await seedUser(AdminId, 'quantri', 'MEMBER');
    await seedUser(JoinerId, 'nguoithamgia1', 'MEMBER');
    await seedUser(OtherJoinerId, 'nguoithamgia2', 'MEMBER');
    await seedUser(OutsiderId, 'nguoingoaicuoc', 'MEMBER');

    // Admin thật: gắn vai SUPER_ADMIN, vai đã được cấp `campaign.manage` ở migration
    // 1797600000000. Không tự chèn quyền bằng tay — nếu lượt cấp đó thiếu thì nhóm 1 phải
    // ĐỎ, vì khi lên production nó cũng sẽ thiếu y như vậy.
    await dataSource.query(
      `INSERT INTO admin_user_roles (user_id, role_id)
       SELECT $1, id FROM admin_roles WHERE code = 'SUPER_ADMIN'`,
      [AdminId],
    );

    console.log('1. BR-CHARITY-01 — ai tạo được, và hồ sơ vào trạng thái nào');

    const seededCapability = await entitlements.getCapability(
      DiamondId,
      'SUBMIT_CHARITY_PROPOSAL',
    );
    check(
      'Rank Config có SUBMIT_CHARITY_PROPOSAL (seed sẵn từ 1790100000000) và chỉ Kim Cương bật',
      seededCapability?.allowed === true,
      JSON.stringify(seededCapability),
    );

    const memberCapability = await entitlements.getCapability(
      MemberId,
      'SUBMIT_CHARITY_PROPOSAL',
    );
    check(
      'Hạng MEMBER bị TẮT trong Rank Config',
      memberCapability?.allowed === false,
      JSON.stringify(memberCapability),
    );

    // Luật ĐỔI từ F65b lát A (§2, tiêu chí §11.11): Kim Cương có quyền public ngay.
    const diamondPublished = await createUseCase.handle(
      withMedia({
        ...writeInput({ title: 'Hoạt động Kim Cương public ngay' }),
        actorUserId: DiamondId,
        asAdmin: false,
      }),
    );
    check(
      'Kim Cương tạo hoạt động có tổ chức -> APPROVED ngay, không chờ Admin',
      diamondPublished.approvalStatus === 'APPROVED' &&
        diamondPublished.approvedAt !== null &&
        diamondPublished.approvedBy === DiamondId,
      `${diamondPublished.approvalStatus} / ${String(diamondPublished.approvedBy)}`,
    );

    const pendingCampaign = await createUseCase.handle(
      withMedia({
        ...writeInput({
          campaignType: 'INDIVIDUAL_APPEAL',
          beneficiaryRelation: 'SELF',
        }),
        actorUserId: OrganizerId,
        asAdmin: false,
      }),
    );
    check(
      'hạng Vàng tạo kêu gọi cá nhân -> PENDING_APPROVAL (tạo được, không public ngay)',
      pendingCampaign.approvalStatus === 'PENDING_APPROVAL',
      pendingCampaign.approvalStatus,
    );
    check(
      'Hồ sơ chờ duyệt KHÔNG có approvedAt (CHK_campaigns_approved_at)',
      pendingCampaign.approvedAt === null &&
        pendingCampaign.approvedBy === null,
    );

    await expectThrow(
      'Hạng MEMBER tạo -> bị từ chối',
      () =>
        createUseCase.handle(
          withMedia({
            ...writeInput({ title: 'Hoạt động của thành viên thường' }),
            actorUserId: MemberId,
            asAdmin: false,
          }),
        ),
      'CharityCampaignCreateNotAllowedException',
    );

    const adminCampaign = await createUseCase.handle(
      withMedia({
        ...writeInput({ title: 'Trung thu cho em 2026' }),
        actorUserId: AdminId,
        asAdmin: true,
      }),
    );
    check(
      'Admin tạo -> APPROVED ngay',
      adminCampaign.approvalStatus === 'APPROVED',
      adminCampaign.approvalStatus,
    );
    check(
      'Hồ sơ Admin tạo ghi approvedBy là chính họ',
      adminCampaign.approvedBy === AdminId && adminCampaign.approvedAt !== null,
      `approvedBy=${adminCampaign.approvedBy}`,
    );

    await expectThrow(
      'Người KHÔNG có quyền campaign.manage gọi đường Admin -> ForbiddenException',
      () =>
        createUseCase.handle(
          withMedia({
            ...writeInput({ title: 'Mạo danh Admin' }),
            actorUserId: MemberId,
            asAdmin: true,
          }),
        ),
      'ForbiddenException',
    );

    console.log('\n2. Ràng buộc database — lớp cuối chặn SQL tay');

    await expectReject(
      'end_time <= start_time bị chặn',
      () =>
        dataSource.query(
          `INSERT INTO campaigns (title, slug, description, banner_url, badge_name,
                                  start_time, end_time)
           VALUES ('Thử', 'thu-thu-tu-thoi-gian', 'Mô tả đủ mười ký tự.',
                   'https://cdn.chantam.vn/a.jpg', 'Huy hiệu',
                   now(), now() - interval '1 hour')`,
        ),
      'CHK_campaigns_time_order',
    );

    await expectReject(
      'slug sai dạng bị chặn',
      () =>
        dataSource.query(
          `INSERT INTO campaigns (title, slug, description, banner_url, badge_name,
                                  start_time, end_time)
           VALUES ('Thử', 'Slug Có Hoa Và Dấu Cách', 'Mô tả đủ mười ký tự.',
                   'https://cdn.chantam.vn/a.jpg', 'Huy hiệu',
                   now(), now() + interval '1 hour')`,
        ),
      'CHK_campaigns_slug_shape',
    );

    // Từ migration 1800500000000 CHECK là `^https?://`: `http://` của storage dev được
    // nhận (spec media 12/10), nhưng scheme khác vẫn phải bị chặn.
    await expectReject(
      'banner_url không phải http(s) bị chặn',
      () =>
        dataSource.query(
          `INSERT INTO campaigns (title, slug, description, banner_url, badge_name,
                                  start_time, end_time)
           VALUES ('Thử', 'thu-banner', 'Mô tả đủ mười ký tự.',
                   'javascript:alert(1)', 'Huy hiệu',
                   now(), now() + interval '1 hour')`,
        ),
      'CHK_campaigns_banner_url',
    );

    await expectReject(
      'badge_name chỉ gồm dấu cách bị chặn',
      () =>
        dataSource.query(
          `INSERT INTO campaigns (title, slug, description, banner_url, badge_name,
                                  start_time, end_time)
           VALUES ('Thử', 'thu-badge', 'Mô tả đủ mười ký tự.',
                   'https://cdn.chantam.vn/a.jpg', '   ',
                   now(), now() + interval '1 hour')`,
        ),
      'CHK_campaigns_badge_name',
    );

    await expectReject(
      'APPROVED mà thiếu approved_at bị chặn',
      () =>
        dataSource.query(
          `INSERT INTO campaigns (title, slug, description, banner_url, badge_name,
                                  start_time, end_time, approval_status)
           VALUES ('Thử', 'thu-approved-at', 'Mô tả đủ mười ký tự.',
                   'https://cdn.chantam.vn/a.jpg', 'Huy hiệu',
                   now(), now() + interval '1 hour', 'APPROVED')`,
        ),
      'CHK_campaigns_approved_at',
    );

    await expectReject(
      'slug trùng bị chặn',
      () =>
        dataSource.query(
          `INSERT INTO campaigns (title, slug, description, banner_url, badge_name,
                                  start_time, end_time)
           VALUES ('Thử', $1, 'Mô tả đủ mười ký tự.',
                   'https://cdn.chantam.vn/a.jpg', 'Huy hiệu',
                   now(), now() + interval '1 hour')`,
          [adminCampaign.slug],
        ),
      'UQ_campaigns_slug',
    );

    await expectReject(
      'Hai người tham gia chấm nhau không dùng chung reviewer/reviewee được',
      () =>
        dataSource.query(
          `INSERT INTO campaign_reviews
             (campaign_id, reviewer_id, reviewee_id, reviewer_role, rating)
           VALUES ($1, $2, $2, 'PARTICIPANT', 5)`,
          [adminCampaign.globalId, JoinerId],
        ),
      'CHK_campaign_reviews_not_self',
    );

    console.log('\n3. Hồ sơ chờ duyệt KHÔNG lọt đường công khai');

    check(
      'Tra bằng ID một hồ sơ PENDING -> không trả gì',
      (await repository.findPublicByIdOrSlug(pendingCampaign.globalId)) ===
        null,
    );
    check(
      'Tra bằng SLUG một hồ sơ PENDING -> không trả gì',
      (await repository.findPublicByIdOrSlug(pendingCampaign.slug)) === null,
    );
    check(
      'Hồ sơ APPROVED tra được bằng slug',
      (await repository.findPublicByIdOrSlug(adminCampaign.slug))?.globalId ===
        adminCampaign.globalId,
    );
    const publicList = await repository.listPublic({ limit: 50, offset: 0 });
    check(
      'Danh sách công khai chỉ có hồ sơ đã duyệt',
      publicList.items.every(
        (item) => item.approvalStatus === 'APPROVED' && item.isActive,
        // Hai: của Admin và của Kim Cương public ngay. Hồ sơ chờ duyệt của hạng Vàng
        // không có mặt — đó là điều phép kiểm này canh.
      ) && publicList.items.length === 2,
      `${publicList.items.length} hàng`,
    );
    // Người gửi hồ sơ vẫn phải thấy hồ sơ của mình — nếu không thì họ không bao giờ biết
    // nó bị từ chối vì sao.
    const mine = await repository.listByCreator({
      userId: OrganizerId,
      limit: 10,
      offset: 0,
    });
    check(
      'Người gửi thấy hồ sơ PENDING của mình qua listByCreator',
      mine.total === 1 && mine.items[0].approvalStatus === 'PENDING_APPROVAL',
    );

    console.log(
      '\n4. Duyệt — hai Admin bấm cùng lúc thì người sau thấy xung đột',
    );

    const approved = await decideUseCase.handle({
      actorUserId: AdminId,
      campaignId: pendingCampaign.globalId,
      approve: true,
      note: 'Hồ sơ đủ thông tin.',
    });
    check(
      'Duyệt -> APPROVED, có approvedBy và approvedAt',
      approved.approvalStatus === 'APPROVED' &&
        approved.approvedBy === AdminId &&
        approved.approvedAt !== null,
    );
    await expectThrow(
      'Duyệt lần hai cùng hồ sơ -> CharityApprovalAlreadyDecided',
      () =>
        decideUseCase.handle({
          actorUserId: AdminId,
          campaignId: pendingCampaign.globalId,
          approve: false,
          note: 'Đổi ý',
        }),
      'CharityApprovalAlreadyDecidedException',
    );

    console.log('\n5. Đăng ký, huỷ, đăng ký lại — và BR-CHARITY-03');

    const target = pendingCampaign.globalId;

    const joined = await joinUseCase.handle({
      actorUserId: JoinerId,
      campaignId: target,
    });
    check(
      'Đăng ký -> isJoined true, participantCount 1',
      joined.campaign.isJoined === true &&
        joined.campaign.participantCount === 1,
      `count=${joined.campaign.participantCount}`,
    );

    await expectThrow(
      'Đăng ký lần hai -> CharityAlreadyRegistered',
      () => joinUseCase.handle({ actorUserId: JoinerId, campaignId: target }),
      'CharityAlreadyRegisteredException',
    );

    await joinUseCase.handle({
      actorUserId: OtherJoinerId,
      campaignId: target,
    });
    const cancelled = await cancelUseCase.handle({
      actorUserId: OtherJoinerId,
      campaignId: target,
    });
    check(
      'Huỷ -> isJoined false, participantCount về 1',
      cancelled.campaign.isJoined === false &&
        cancelled.campaign.participantCount === 1,
      `count=${cancelled.campaign.participantCount}`,
    );

    const [rowCount] = await dataSource.query<{ total: string }[]>(
      `SELECT count(*)::text AS total FROM campaign_participations
        WHERE campaign_id = $1 AND user_id = $2`,
      [target, OtherJoinerId],
    );
    check(
      'Huỷ KHÔNG sinh hàng lịch sử — vẫn đúng một hàng mỗi người',
      rowCount.total === '1',
      `${rowCount.total} hàng`,
    );

    await expectThrow(
      'Huỷ khi chưa đăng ký -> CharityNotRegistered',
      () =>
        cancelUseCase.handle({ actorUserId: OutsiderId, campaignId: target }),
      'CharityNotRegisteredException',
    );

    const rejoined = await joinUseCase.handle({
      actorUserId: OtherJoinerId,
      campaignId: target,
    });
    check(
      'Đăng ký lại sau khi huỷ -> được, count về 2',
      rejoined.campaign.participantCount === 2,
      `count=${rejoined.campaign.participantCount}`,
    );

    const joinedList = await joinedUseCase.handle({
      actorUserId: JoinerId,
      limit: 10,
      offset: 0,
    });
    check(
      'Danh sách "tôi đã đăng ký" trả đúng một hoạt động và isJoined true',
      joinedList.total === 1 && joinedList.items[0].isJoined === true,
      `total=${joinedList.total}`,
    );

    console.log(
      '\n6. BR-CHARITY-03 — mốc thời gian quyết định huỷ và đánh giá',
    );

    await expectThrow(
      'Đánh giá TRƯỚC khi kết thúc -> CharityReviewTooEarly',
      () =>
        reviewUseCase.handle({
          actorUserId: JoinerId,
          campaignId: target,
          revieweeId: OrganizerId,
          rating: 5,
        }),
      'CharityReviewTooEarlyException',
    );

    // Dời hoạt động về QUÁ KHỨ bằng SQL. Không chờ thật tám tiếng, và không giả đồng hồ ở
    // tầng JS: `canCancelCharityParticipation` so với `Date.now()`, nên mốc phải thật.
    await dataSource.query(
      `UPDATE campaigns
          SET start_time = now() - interval '2 hours',
              end_time   = now() - interval '1 hour'
        WHERE global_id = $1`,
      [target],
    );

    await expectThrow(
      'Huỷ sau khi hoạt động đã bắt đầu -> CharityCancelTooLate',
      () => cancelUseCase.handle({ actorUserId: JoinerId, campaignId: target }),
      'CharityCancelTooLateException',
    );

    const participantReview = await reviewUseCase.handle({
      actorUserId: JoinerId,
      campaignId: target,
      revieweeId: OrganizerId,
      rating: 5,
      comment: 'Tổ chức chu đáo.',
    });
    check(
      'Người tham gia chấm người tổ chức -> vai PARTICIPANT',
      participantReview.review.reviewerRole === 'PARTICIPANT' &&
        participantReview.review.rating === 5,
      participantReview.review.reviewerRole,
    );

    const organizerReview = await reviewUseCase.handle({
      actorUserId: OrganizerId,
      campaignId: target,
      revieweeId: JoinerId,
      rating: 4,
    });
    check(
      'Người tổ chức chấm người tham gia -> vai ORGANIZER',
      organizerReview.review.reviewerRole === 'ORGANIZER',
      organizerReview.review.reviewerRole,
    );

    await expectThrow(
      'Chấm lại cùng một người -> CharityReviewDuplicate',
      () =>
        reviewUseCase.handle({
          actorUserId: JoinerId,
          campaignId: target,
          revieweeId: OrganizerId,
          rating: 1,
        }),
      'CharityReviewDuplicateException',
    );

    await expectThrow(
      'Hai người THAM GIA chấm nhau -> CharityReviewNotPermitted',
      () =>
        reviewUseCase.handle({
          actorUserId: JoinerId,
          campaignId: target,
          revieweeId: OtherJoinerId,
          rating: 1,
        }),
      'CharityReviewNotPermittedException',
    );

    await expectThrow(
      'Người ngoài cuộc đánh giá -> CharityReviewNotPermitted',
      () =>
        reviewUseCase.handle({
          actorUserId: OutsiderId,
          campaignId: target,
          revieweeId: OrganizerId,
          rating: 1,
        }),
      'CharityReviewNotPermittedException',
    );

    console.log('\n7. BR-CHARITY-02 — hệ thống KHÔNG tự đối soát số phần quà');

    const beforeProgress = await repository.findByGlobalId(target);
    check(
      'Sau hai lượt đăng ký và hai lượt đánh giá, current_items_count VẪN là 0',
      beforeProgress?.currentItemsCount === 0,
      `current=${beforeProgress?.currentItemsCount}`,
    );

    const [triggers] = await dataSource.query<{ total: string }[]>(
      `SELECT count(*)::text AS total
         FROM information_schema.triggers
        WHERE event_object_table = 'campaigns'`,
    );
    check(
      'Bảng campaigns KHÔNG có trigger nào',
      triggers.total === '0',
      `${triggers.total} trigger`,
    );

    const declared = await progressUseCase.handle({
      actorUserId: OrganizerId,
      campaignId: target,
      currentItemsCount: 480,
      asAdmin: false,
    });
    check(
      'Người tổ chức khai 480/500 -> progressPercent 96',
      declared.currentItemsCount === 480 && declared.progressPercent === 96,
      `percent=${declared.progressPercent}`,
    );

    await expectThrow(
      'Người khác cập nhật tiến độ -> CharityNotOrganizer',
      () =>
        progressUseCase.handle({
          actorUserId: JoinerId,
          campaignId: target,
          currentItemsCount: 1,
          asAdmin: false,
        }),
      'CharityNotOrganizerException',
    );

    const adminDeclared = await progressUseCase.handle({
      actorUserId: AdminId,
      campaignId: target,
      currentItemsCount: 500,
      asAdmin: true,
    });
    check(
      'Admin cập nhật được tiến độ -> 500/500, 100%',
      adminDeclared.currentItemsCount === 500 &&
        adminDeclared.progressPercent === 100,
      `percent=${adminDeclared.progressPercent}`,
    );

    // Khai VƯỢT mục tiêu là chuyện tốt và phải hiện đúng, không kẹp về 100.
    const overshoot = await progressUseCase.handle({
      actorUserId: AdminId,
      campaignId: target,
      currentItemsCount: 600,
      asAdmin: true,
    });
    check(
      'Khai vượt mục tiêu -> 120%, KHÔNG kẹp về 100',
      overshoot.progressPercent === 120,
      `percent=${overshoot.progressPercent}`,
    );

    console.log('\n8. progressPercent khi không đặt mục tiêu');

    const noTarget = await createUseCase.handle(
      withMedia({
        ...writeInput({
          title: 'Quyên góp trực tuyến mùa lũ',
          targetItemsCount: 0,
          lat: undefined,
          lng: undefined,
          locationLabel: undefined,
        }),
        actorUserId: AdminId,
        asAdmin: true,
      }),
    );
    check(
      'targetItemsCount = 0 -> progressPercent null, KHÔNG phải 0',
      noTarget.progressPercent === null,
      `percent=${String(noTarget.progressPercent)}`,
    );
    check(
      'Hoạt động không gắn toạ độ -> lat và lng đều null',
      noTarget.lat === null && noTarget.lng === null,
      `lat=${String(noTarget.lat)} lng=${String(noTarget.lng)}`,
    );

    console.log(
      '\n9. Toạ độ đọc ra đúng chiều (ST_Y là vĩ độ, ST_X là kinh độ)',
    );

    const located = await repository.findByGlobalId(adminCampaign.globalId);
    check(
      'lat ~ 10.7797 (vĩ độ Sài Gòn), không phải 106.699',
      Math.abs((located?.lat ?? 0) - 10.7797) < 0.0001,
      `lat=${String(located?.lat)}`,
    );
    check(
      'lng ~ 106.699 (kinh độ Sài Gòn)',
      Math.abs((located?.lng ?? 0) - 106.699) < 0.0001,
      `lng=${String(located?.lng)}`,
    );

    console.log('\n10. Lọc theo pha thời gian');

    const ended = await repository.listPublic({
      limit: 50,
      offset: 0,
      phase: 'ENDED',
    });
    check(
      'phase=ENDED chỉ trả hoạt động đã kết thúc',
      ended.items.length === 1 && ended.items[0].globalId === target,
      `${ended.items.length} hàng`,
    );
    const upcoming = await repository.listPublic({
      limit: 50,
      offset: 0,
      phase: 'UPCOMING',
    });
    check(
      'phase=UPCOMING không chứa hoạt động đã kết thúc',
      upcoming.items.every((item) => item.globalId !== target),
      `${upcoming.items.length} hàng`,
    );

    console.log('\n11. Media chiến dịch — ràng buộc thật và luồng thay cả bộ');

    const replaceMedia = new ReplaceCharityMediaUseCase(
      repository,
      fakeCampaignMediaStorage(),
    );

    const imageA = freshMediaKey(OrganizerId);
    const videoB = freshMediaKey(OrganizerId, 'mp4');
    const mediaCampaign = await createUseCase.handle({
      ...writeInput({
        campaignType: 'INDIVIDUAL_APPEAL',
        beneficiaryRelation: 'SELF',
        title: 'Kiểm media chiến dịch',
      }),
      media: [videoB, imageA],
      coverKey: imageA,
      actorUserId: OrganizerId,
      asAdmin: false,
    });
    check(
      'tạo kèm media: media theo đúng thứ tự, bìa là ảnh, bannerUrl lấy từ bìa',
      mediaCampaign.media.length === 2 &&
        mediaCampaign.media[0].type === 'VIDEO' &&
        mediaCampaign.media[1].isCover &&
        mediaCampaign.bannerUrl === mediaCampaign.media[1].url,
      JSON.stringify(mediaCampaign.media),
    );
    check(
      'hồ sơ Vàng vào chờ duyệt (điều kiện cho các phép thay bên dưới)',
      mediaCampaign.approvalStatus === 'PENDING_APPROVAL',
      mediaCampaign.approvalStatus,
    );

    // Gửi lại đúng các key đang có, chỉ đổi thứ tự và bìa.
    const reordered = await replaceMedia.handle({
      campaignId: mediaCampaign.globalId,
      actorUserId: OrganizerId,
      media: [imageA, videoB],
      coverKey: imageA,
    });
    check(
      'thay cả bộ bằng CHÍNH các key cũ (đổi thứ tự) không vướng UNIQUE(storage_key)',
      reordered.media[0].isCover && reordered.media[1].type === 'VIDEO',
      JSON.stringify(reordered.media),
    );

    // Đổi ẢNH BÌA: câu `UPDATE campaigns SET banner_url` chỉ chạy thật ở đây — unit test
    // mock query không thấy được nó ghi sai cột hay sai hàng.
    const imageC = freshMediaKey(OrganizerId);
    await replaceMedia.handle({
      campaignId: mediaCampaign.globalId,
      actorUserId: OrganizerId,
      media: [imageC, imageA],
      coverKey: imageC,
    });
    const coverSwapped = await dataSource.query<
      { banner_url: string; covers: string[] }[]
    >(
      `SELECT c.banner_url,
              array_agg(m.storage_key) FILTER (WHERE m.is_cover) AS covers
         FROM campaigns c JOIN campaign_media m ON m.campaign_id = c.global_id
        WHERE c.global_id = $1 GROUP BY c.banner_url`,
      [mediaCampaign.globalId],
    );
    check(
      'đổi ảnh bìa: banner_url trong database đổi theo đúng ảnh bìa mới',
      coverSwapped[0]?.banner_url === `https://cdn.chantam.test/${imageC}` &&
        coverSwapped[0]?.covers?.length === 1 &&
        coverSwapped[0]?.covers[0] === imageC,
      JSON.stringify(coverSwapped),
    );

    // Key của hoạt động khác.
    // Kêu gọi cá nhân, không phải hoạt động có tổ chức: người tạo hạng Vàng không có
    // quyền tạo loại có tổ chức (chỉ Kim Cương).
    const other = await createUseCase.handle(
      withMedia({
        ...writeInput({
          title: 'Hoạt động khác giữ key',
          campaignType: 'INDIVIDUAL_APPEAL',
          beneficiaryRelation: 'SELF',
        }),
        actorUserId: OrganizerId,
        asAdmin: false,
      }),
    );
    const otherKey = (
      await dataSource.query<{ storage_key: string }[]>(
        `SELECT storage_key FROM campaign_media WHERE campaign_id = $1`,
        [other.globalId],
      )
    )[0].storage_key;
    await expectThrow(
      'key đã thuộc hoạt động khác → CharityMediaInvalidException, không phải 500',
      () =>
        replaceMedia.handle({
          campaignId: mediaCampaign.globalId,
          actorUserId: OrganizerId,
          media: [otherKey],
          coverKey: otherKey,
        }),
      'CharityMediaInvalidException',
    );
    // Lượt thay hỏng giữa transaction (DELETE đã chạy rồi INSERT vướng UNIQUE) phải
    // rollback cả lượt: bộ cũ và banner_url còn nguyên, không để hồ sơ trơ trụi.
    const afterFailedReplace = await dataSource.query<
      { keys: string[]; banner_url: string }[]
    >(
      `SELECT array_agg(m.storage_key ORDER BY m.sort_order) AS keys, c.banner_url
         FROM campaigns c JOIN campaign_media m ON m.campaign_id = c.global_id
        WHERE c.global_id = $1 GROUP BY c.banner_url`,
      [mediaCampaign.globalId],
    );
    check(
      'lượt thay hỏng vì UNIQUE rollback trọn: media và banner_url giữ nguyên',
      JSON.stringify(afterFailedReplace[0]?.keys) ===
        JSON.stringify([imageC, imageA]) &&
        afterFailedReplace[0]?.banner_url ===
          `https://cdn.chantam.test/${imageC}`,
      JSON.stringify(afterFailedReplace),
    );

    const memberKey = freshMediaKey(MemberId);
    await expectThrow(
      'người khác (không phải người tạo) không thay được',
      () =>
        replaceMedia.handle({
          campaignId: mediaCampaign.globalId,
          actorUserId: MemberId,
          media: [memberKey],
          coverKey: memberKey,
        }),
      'CharityNotOrganizerException',
    );

    // Admin duyệt chen giữa — repository kiểm lại dưới khoá dòng.
    await dataSource.query(
      `UPDATE campaigns SET approval_status = 'APPROVED', approved_at = now(), approved_by = $2
        WHERE global_id = $1`,
      [mediaCampaign.globalId, AdminId],
    );
    await expectThrow(
      'repository.replaceMedia trên hồ sơ đã duyệt → NotEditable (kiểm dưới khoá, không chỉ ở use case)',
      () =>
        repository.replaceMedia({
          campaignId: mediaCampaign.globalId,
          actorUserId: OrganizerId,
          media: [],
          bannerUrl: 'https://cdn.chantam.test/x.webp',
        }),
      'CharityMediaNotEditableException',
    );

    // Ràng buộc database — lớp cuối khi code sai.
    await expectReject(
      'CHECK: bìa là video bị chặn',
      () =>
        dataSource.query(
          `INSERT INTO campaign_media (campaign_id, storage_key, public_url, media_type, sort_order, is_cover)
           VALUES ($1, 'k-video-cover', 'https://x/v.mp4', 'VIDEO', 3, true)`,
          [other.globalId],
        ),
      'CHK_campaign_media_cover_is_image',
    );
    await expectReject(
      'UNIQUE: hai bìa trong một hoạt động bị chặn',
      () =>
        dataSource.query(
          `INSERT INTO campaign_media (campaign_id, storage_key, public_url, media_type, sort_order, is_cover)
           VALUES ($1, 'k-second-cover', 'https://x/b.webp', 'IMAGE', 3, true)`,
          [other.globalId],
        ),
      'UQ_campaign_media_one_cover',
    );
    await expectReject(
      'CHECK: sort_order ngoài 0..4 bị chặn',
      () =>
        dataSource.query(
          `INSERT INTO campaign_media (campaign_id, storage_key, public_url, media_type, sort_order, is_cover)
           VALUES ($1, 'k-order-5', 'https://x/c.webp', 'IMAGE', 5, false)`,
          [other.globalId],
        ),
      'CHK_campaign_media_sort_order',
    );

    // Hoạt động cũ không có media.
    await dataSource.query(
      `DELETE FROM campaign_media WHERE campaign_id = $1`,
      [other.globalId],
    );
    const legacy = await repository.findByGlobalId(other.globalId);
    check(
      'hoạt động không có dòng media nào: media = [] và bannerUrl giữ nguyên',
      Array.isArray(legacy?.media) &&
        legacy?.media.length === 0 &&
        legacy?.bannerUrl === other.bannerUrl,
      JSON.stringify(legacy?.media),
    );

    // Đọc lại giá trị chứ không đếm kết quả UPDATE: TypeORM bọc UPDATE … RETURNING
    // thành `[rows, affected]`, nên `.length` của nó luôn ≥ 1 dù không hàng nào đổi.
    await dataSource.query(
      `UPDATE campaigns SET banner_url = 'http://localhost:19000/a.webp'
        WHERE global_id = $1`,
      [other.globalId],
    );
    const [devBanner] = await dataSource.query<{ banner_url: string }[]>(
      `SELECT banner_url FROM campaigns WHERE global_id = $1`,
      [other.globalId],
    );
    check(
      'banner_url http:// (storage dev) được nhận sau khi nới CHECK',
      devBanner?.banner_url === 'http://localhost:19000/a.webp',
      devBanner?.banner_url,
    );

    console.log('\nXoá hoạt động (CMS): chỉ khi chưa có ai tham gia');
    check(
      'hoạt động đã có người đăng ký thì HAS_ACTIVITY, KHÔNG xoá',
      (await repository.softDeleteIfUnused(target)) === 'HAS_ACTIVITY' &&
        (await repository.findByGlobalId(target)) !== null,
    );
    check(
      'hoạt động chưa ai đụng tới (chỉ có media) thì xoá được',
      (await repository.softDeleteIfUnused(other.globalId)) === 'DELETED',
    );
    check(
      'xoá xong biến khỏi mọi đường đọc, kể cả đường Admin',
      (await repository.findByGlobalId(other.globalId)) === null &&
        (await repository.findPublicByIdOrSlug(other.globalId)) === null,
    );
    const [softRow] = await dataSource.query<
      { deleted_at: Date | null; is_active: boolean }[]
    >(`SELECT deleted_at, is_active FROM campaigns WHERE global_id = $1`, [
      other.globalId,
    ]);
    check(
      'nhưng dòng VẪN nằm trong database (xoá mềm), đã tắt',
      softRow?.deleted_at !== null && softRow?.is_active === false,
    );
    check(
      'xoá lần hai trả NOT_FOUND',
      (await repository.softDeleteIfUnused(other.globalId)) === 'NOT_FOUND',
    );
  } finally {
    for (const source of opened.reverse())
      if (source.isInitialized) await source.destroy();
  }

  console.log(
    `\n${
      failures.length === 0
        ? 'F65 Từ thiện: BR-CHARITY-01 hai đường tạo đúng trạng thái duyệt (Rank Config THẬT và admin_role_permissions THẬT), bảy ràng buộc database chặn đúng, hồ sơ chờ duyệt không lọt đường công khai dù tra bằng id, duyệt lần hai thấy xung đột, huỷ không sinh hàng lịch sử, BR-CHARITY-03 hai mốc thời gian và đánh giá đúng hai chiều, BR-CHARITY-02 không có trigger nào và current_items_count chỉ đổi khi người ta khai'
        : `${failures.length} phép kiểm thất bại`
    }`,
  );
  if (failures.length > 0) {
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exitCode = 1;
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
