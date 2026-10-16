/**
 * Acceptance SRS 3.7A — Group, Sub-team & Group Affiliate — trên Postgres THẬT.
 *
 * Mỗi phép kiểm là MỘT ca trong danh sách acceptance của spec, chạy qua use case và
 * repository thật (không mock), trên policy entitlement do migration seed. Bốn ca
 * affiliate (trong vùng / ngoài vùng / thiếu toạ độ / không cộng trùng) đo ở
 * `npm run test:affiliate` nhóm 3, 4, 6 — không lặp lại ở đây.
 *
 *   npm run test:group-acceptance
 */
import { resolveAllEntities } from '@chantam/service.persistency-lib';
import { config as loadEnvFile } from 'dotenv';
import { DataSource } from 'typeorm';
import { GroupCreationEligibility } from '../src/application/implementations/group/group-creation-eligibility';
import {
  GetGroupInviteUseCase,
  PreviewGroupInviteUseCase,
  UpdateGroupSettingsUseCase,
} from '../src/application/implementations/group/group-management.use-cases';
import { CreateGroupUseCase } from '../src/application/implementations/group/group.use-cases';
import * as entities from '../src/infrastructure/entity';
import * as migrations from '../src/infrastructure/persistence/migrations';
import { AdminConfigRepository } from '../src/infrastructure/repository/admin-config.repository';
import { EntitlementRepository } from '../src/infrastructure/repository/entitlement.repository';
import { GroupRepository } from '../src/infrastructure/repository/group.repository';
import { UserRepository } from '../src/infrastructure/repository/user.repository';

loadEnvFile({ path: '.env.local' });
loadEnvFile();

const ScratchDatabase = 'chantam_group_acceptance_check';

const DiamondId = 'ac000000-0000-4000-8000-0000000000d1';
const DiamondNoLocationId = 'ac000000-0000-4000-8000-0000000000d2';
const MemberRankId = 'ac000000-0000-4000-8000-0000000000d3';
const SecondDiamondId = 'ac000000-0000-4000-8000-0000000000d4';
const HaDong = { lat: 20.9745, lng: 105.7781 };

const failures: string[] = [];

function check(label: string, ok: boolean, detail = ''): void {
  console.log(
    `  ${ok ? 'OK  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`,
  );
  if (!ok) failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
}

async function thrown(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
    return 'không ném gì';
  } catch (error) {
    return (error as Error).constructor.name;
  }
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
  });
  await dataSource.initialize();
  opened.push(dataSource);
  await dataSource.runMigrations();
  console.log('Đã dựng schema trên database nháp\n');

  try {
    const addUser = async (
      id: string,
      username: string,
      rank: string,
      location: { lat: number; lng: number } | null,
    ) =>
      dataSource.query(
        `INSERT INTO users
           (global_id, username, password_hash, rank, status, full_name, avatar_url,
            phone, email, default_location, referral_code)
         VALUES ($1, $2, 'x', $3, 'ACTIVE', 'Người kiểm', 'https://cdn.test/a.webp',
                 $4, $5,
                 CASE WHEN $6::float8 IS NULL THEN NULL
                      ELSE ST_SetSRID(ST_MakePoint($7::float8, $6::float8), 4326)::geography END,
                 $8)`,
        [
          id,
          username,
          rank,
          `09${id.slice(-8).replace(/[^0-9]/g, '1')}`,
          `${username}@chantam.test`,
          location?.lat ?? null,
          location?.lng ?? null,
          id.replaceAll('-', '').slice(-12).toUpperCase(),
        ],
      );
    await addUser(DiamondId, 'kim-cuong', 'DIAMOND', HaDong);
    await addUser(
      DiamondNoLocationId,
      'kim-cuong-chua-vi-tri',
      'DIAMOND',
      null,
    );
    await addUser(MemberRankId, 'hang-thanh-vien', 'MEMBER', HaDong);
    await addUser(SecondDiamondId, 'kim-cuong-thu-hai', 'DIAMOND', HaDong);

    const groups = new GroupRepository(
      entities.GroupEntity as never,
      dataSource.manager,
    );
    const users = new UserRepository(
      entities.UserEntity as never,
      dataSource.manager,
    );
    const entitlements = new EntitlementRepository(dataSource.manager, {
      countOpenByRequester: async (): Promise<number> => 0,
    } as never);
    const adminConfig = new AdminConfigRepository(dataSource.manager);
    const eligibility = new GroupCreationEligibility(
      users,
      entitlements,
      groups,
    );
    const createGroup = new CreateGroupUseCase(
      groups,
      adminConfig,
      eligibility,
    );
    const getInvite = new GetGroupInviteUseCase(groups, {
      web: { publicBaseUrl: 'https://chantam.vn' },
    } as never);
    const updateSettings = new UpdateGroupSettingsUseCase(groups);
    const create = (ownerId: string, name: string) =>
      createGroup.handle({
        ownerId,
        group: { name, regionLabel: 'Hà Đông, Hà Nội' },
      });

    console.log('1. Tạo Group');
    const created = await create(DiamondId, 'Thiện nguyện Hà Đông');
    const groupId = created.group.groupId;
    check(
      'Diamond có Default Location tạo Group thành công, kèm invite link',
      typeof groupId === 'string' &&
        /^[A-Z0-9]{16}$/.test(created.group.inviteCode ?? ''),
      JSON.stringify({ groupId, inviteCode: created.group.inviteCode }),
    );
    const [center] = await dataSource.query<{ lat: number; lng: number }[]>(
      `SELECT ST_Y(center_location::geometry) AS lat, ST_X(center_location::geometry) AS lng
         FROM groups WHERE global_id = $1`,
      [groupId],
    );
    check(
      'tâm nhóm do backend chụp từ Default Location của Owner',
      Math.abs(Number(center?.lat) - HaDong.lat) < 1e-6 &&
        Math.abs(Number(center?.lng) - HaDong.lng) < 1e-6,
    );
    check(
      'hạng Member tạo Group bị từ chối (theo cấu hình hạng, không hard-code)',
      (await thrown(() => create(MemberRankId, 'Nhóm bị chặn'))) ===
        'GroupCreateNotAllowedException',
    );
    check(
      'Diamond chưa có Default Location bị từ chối',
      (await thrown(() => create(DiamondNoLocationId, 'Nhóm không tâm'))) ===
        'GroupDefaultLocationRequiredException',
    );
    check(
      'người đã sở hữu Group không tạo được Group thứ hai',
      (await thrown(() => create(DiamondId, 'Nhóm thứ hai'))) ===
        'GroupAlreadyMemberException',
    );
    check(
      'canCreateGroup báo trước đúng lý do mà POST sẽ trả',
      (await eligibility.evaluate(MemberRankId)).reasonCode ===
        'GROUP_CREATE_NOT_ALLOWED' &&
        (await eligibility.evaluate(DiamondNoLocationId)).reasonCode ===
          'GROUP_DEFAULT_LOCATION_REQUIRED' &&
        (await eligibility.evaluate(DiamondId)).reasonCode ===
          'GROUP_ALREADY_MEMBER' &&
        (await eligibility.evaluate(SecondDiamondId)).canCreateGroup === true,
    );

    console.log('\n2. Invite Link');
    const invite = await getInvite.handle({ userId: DiamondId, groupId });
    const code = invite.invite.inviteCode;
    check(
      'Owner lấy được Invite Link',
      code === created.group.inviteCode && invite.invite.usable === true,
    );
    check(
      'Invite Link kèm URL đầy đủ của đúng mã đó',
      invite.invite.inviteUrl === `https://chantam.vn/invite/${code}`,
      String(invite.invite.inviteUrl),
    );
    const previewInvite = new PreviewGroupInviteUseCase(groups);
    const preview = await previewInvite.handle({ inviteCode: code });
    check(
      'trang mời công khai xem trước được nhóm: tên, khu vực, chủ nhóm, số người',
      preview.group.name === created.group.name &&
        preview.group.regionLabel === 'Hà Đông, Hà Nội' &&
        preview.group.ownerUsername === 'kim-cuong' &&
        preview.group.memberCount === 1,
      JSON.stringify(preview.group),
    );
    check(
      'bản xem trước KHÔNG mang toạ độ tâm nhóm hay id nội bộ',
      !/lat|lng|center|groupId|ownerId|global_id/i.test(
        Object.keys(preview.group).join(','),
      ),
      Object.keys(preview.group).join(','),
    );

    console.log('\n3. Đăng ký bằng Invite Link');
    const NewcomerId = 'ac000000-0000-4000-8000-0000000000e1';
    const joined = await users.createWithReferral({
      globalId: NewcomerId,
      username: 'nguoi-moi-qua-link',
      passwordHash: 'x',
      groupInviteCode: code,
    });
    check(
      'user mới đăng ký bằng Invite Link được join Group (vai MEMBER)',
      joined.joinedGroupId === groupId &&
        (await groups.findMine(NewcomerId))?.myRole === 'MEMBER',
    );
    const joinAudit = await dataSource.query<
      {
        actor_user_id: string;
        resource_id: string;
        after_json: { inviteCode: string };
      }[]
    >(
      `SELECT actor_user_id, resource_id, after_json FROM admin_audit_logs
        WHERE action = 'GROUP_JOIN' AND actor_user_id = $1`,
      [NewcomerId],
    );
    check(
      'lượt vào nhóm có audit GROUP_JOIN kèm nhóm và mã mời đã dùng',
      joinAudit.length === 1 &&
        joinAudit[0].resource_id === groupId &&
        joinAudit[0].after_json.inviteCode === code,
      JSON.stringify(joinAudit),
    );
    check(
      'Member không lấy được Invite Link',
      (await thrown(() =>
        getInvite.handle({ userId: NewcomerId, groupId }),
      )) === 'ForbiddenException',
    );
    const existingAgain = await users.createWithReferral({
      globalId: MemberRankId,
      username: 'hang-thanh-vien',
      passwordHash: 'x',
      groupInviteCode: code,
    });
    check(
      'tài khoản đã tồn tại dùng Invite Link bị từ chối — không sinh membership',
      existingAgain.user === null &&
        existingAgain.joinedGroupId === null &&
        (await groups.findMine(MemberRankId)) === null,
    );
    const secondGroup = await create(
      SecondDiamondId,
      'Nhóm thứ hai của người khác',
    );
    let secondMembership = 'không ném gì';
    try {
      await dataSource.query(
        `INSERT INTO group_memberships (global_id, group_id, user_id, role)
         VALUES (gen_random_uuid(), $1, $2, 'MEMBER')`,
        [secondGroup.group.groupId, NewcomerId],
      );
    } catch (error) {
      secondMembership = String((error as Error).message);
    }
    check(
      'user đã thuộc Group không thuộc được Group thứ hai — database chặn',
      /group_memberships/.test(secondMembership),
      secondMembership.slice(0, 80),
    );

    console.log('\n4. Owner tụt hạng');
    await dataSource.query(
      `UPDATE users SET rank = 'MEMBER' WHERE global_id = $1`,
      [DiamondId],
    );
    const renamed = await updateSettings
      .handle({
        userId: DiamondId,
        groupId,
        settings: { name: 'Thiện nguyện Hà Đông (đổi tên)' },
      })
      .then(() => 'ok')
      .catch((error: Error) => error.constructor.name);
    check('Owner tụt hạng vẫn quản trị được Group', renamed === 'ok', renamed);
    check(
      'và vẫn lấy được Invite Link',
      (await getInvite.handle({ userId: DiamondId, groupId })).invite
        .inviteCode === code,
    );

    console.log('\n5. Owner xoá tài khoản / Group đóng');
    const dissolved = await groups.dissolveOwnedBy(DiamondId);
    check('Owner xoá tài khoản thì Group được đóng', dissolved === 1);
    check(
      'Invite Link mất hiệu lực',
      (await groups.findActiveByInviteCode(code)) === null,
    );
    let previewError = 'không ném gì';
    try {
      await new PreviewGroupInviteUseCase(groups).handle({ inviteCode: code });
    } catch (error) {
      previewError = (error as Error).constructor.name;
    }
    check(
      'Group đóng thì trang mời trả CÙNG lỗi với mã sai',
      previewError === 'GroupInviteInvalidException',
      previewError,
    );
    const lateId = 'ac000000-0000-4000-8000-0000000000e2';
    let lateError = 'không ném gì';
    try {
      await users.createWithReferral({
        globalId: lateId,
        username: 'den-muon',
        passwordHash: 'x',
        groupInviteCode: code,
      });
    } catch (error) {
      lateError = (error as Error).constructor.name;
    }
    check(
      'Group đóng thì Invite Link không dùng được để đăng ký',
      lateError === 'GroupInviteInvalidException',
    );
    const [{ history }] = await dataSource.query<{ history: string }[]>(
      `SELECT count(*)::text AS history FROM group_memberships WHERE group_id = $1`,
      [groupId],
    );
    check(
      'membership history GIỮ NGUYÊN, không chuyển Owner cho ai',
      Number(history) === 2 &&
        (
          await dataSource.query<{ owner_id: string }[]>(
            `SELECT owner_id FROM groups WHERE global_id = $1`,
            [groupId],
          )
        )[0]?.owner_id === DiamondId,
      `history=${history}`,
    );
  } finally {
    for (const source of opened.reverse())
      if (source.isInitialized) await source.destroy();
  }

  console.log(
    `\n${
      failures.length === 0
        ? 'SRS 3.7A acceptance: tạo Group theo hạng + vị trí, invite chỉ Owner, chỉ tài khoản mới vào nhóm, một người một nhóm, Owner tụt hạng vẫn quản trị, Owner xoá tài khoản thì nhóm đóng và link chết'
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
