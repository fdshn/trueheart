/**
 * Kiểm nền Group trên Postgres THẬT (F51–F55, BR-GRP).
 *
 * Mười thứ unit test mock không thấy được:
 *
 * 1. Tâm nhóm là SNAPSHOT — Owner đổi Default Location thì vùng nhóm đứng yên.
 * 2. `UQ_group_memberships_user` chặn một người thuộc HAI nhóm, không phải chỉ
 *    chặn vào cùng một nhóm hai lần.
 * 3. Index một phần chặn sở hữu hai nhóm CÒN SỐNG, nhưng cho lập lại sau khi
 *    nhóm cũ giải tán.
 * 4. `hasGroupPermission` mang chiều PHẠM VI — trưởng nhóm này không có quyền
 *    trên nhóm khác.
 * 5. Giải tán giữ nguyên membership, chỉ đổi trạng thái.
 * 6. Link mời hết dùng được ngay khi nhóm rời khỏi ACTIVE.
 * 7. Giải tán KHÔNG khoá thành viên cũ ngoài hệ thống nhóm vĩnh viễn — dòng
 *    membership thôi hiệu lực nhưng ở lại, và index một phần cho họ có dòng
 *    ACTIVE mới. UNIQUE trần trên `user_id` sẽ chặn đúng chỗ này.
 * 8. Bỏ trống `subTeamId` GIỮ tổ hiện tại, chỉ `null` tường minh mới gỡ ra —
 *    phân biệt này nằm trong câu SQL nên mock không kiểm được.
 * 9. Lọc danh sách thành viên theo tổ: trưởng tổ chỉ thấy tổ mình.
 * 10. `CHK_groups_radius` vẫn khớp hằng `GroupRadiusColumnBoundsKm` — lệch nhau
 *    thì một cấu hình hợp lệ theo code bị database từ chối.
 */
import { GroupStatuses } from '@chantam.vn/chantam.core-lib/consts';
import { resolveAllEntities } from '@chantam/service.persistency-lib';
import { config as loadEnvFile } from 'dotenv';
import { DataSource } from 'typeorm';
import * as entities from '../src/infrastructure/entity';
import * as migrations from '../src/infrastructure/persistence/migrations';
import { GroupRepository } from '../src/infrastructure/repository/group.repository';
import { UserRepository } from '../src/infrastructure/repository/user.repository';

loadEnvFile({ path: '.env.local' });
loadEnvFile();

const ScratchDatabase = 'chantam_group_check';
const OwnerId = '99999999-9999-4999-8999-9999999f1001';
const MemberId = '99999999-9999-4999-8999-9999999f1002';
const OutsiderId = '99999999-9999-4999-8999-9999999f1003';
const OtherOwnerId = '99999999-9999-4999-8999-9999999f1004';
const GroupId = '66666666-6666-4666-8666-6666666f1001';
const OtherGroupId = '66666666-6666-4666-8666-6666666f1002';

const failures: string[] = [];

function check(label: string, ok: boolean, detail = ''): void {
  console.log(
    `  ${ok ? 'OK  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`,
  );
  if (!ok) failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
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

  const groups = new GroupRepository(
    entities.GroupEntity as never,
    dataSource.manager,
  );

  try {
    for (const [id, name] of [
      [OwnerId, 'chu-nhom'],
      [MemberId, 'thanh-vien'],
      [OutsiderId, 'nguoi-ngoai'],
      [OtherOwnerId, 'chu-nhom-khac'],
    ] as const)
      await dataSource.query(
        `INSERT INTO users
           (global_id, username, email, password_hash, rank, status, default_location)
         VALUES ($1, $2, $3, 'x', 'DIAMOND', 'ACTIVE',
                 ST_SetSRID(ST_MakePoint(106.698, 10.7724), 4326)::geography)`,
        [id, name, `${name}@chantam.test`],
      );

    console.log('1. Tạo nhóm cùng membership OWNER trong một transaction');
    await groups.createWithOwner({
      globalId: GroupId,
      ownerId: OwnerId,
      name: 'Chan Tam Cau Giay',
      description: null,
      avatarUrl: null,
      coverUrl: null,
      centerLocation: { lat: 10.7724, lng: 106.698 },
      regionLabel: 'Cau Giay, Ha Noi',
      radiusKm: 10,
      inviteCode: 'ABCD2345EFGH6789',
      ownerMembershipId: '55555555-5555-4555-8555-5555555f1001',
    });

    const mine = await groups.findMine(OwnerId);
    check('Owner thấy nhóm của mình', mine?.groupId === GroupId);
    check('vai là OWNER', mine?.myRole === 'OWNER', mine?.myRole ?? '');
    check(
      'đếm đúng 1 thành viên',
      mine?.memberCount === 1,
      `${mine?.memberCount}`,
    );
    check(
      'Owner NHẬN được link mời',
      mine?.inviteCode === 'ABCD2345EFGH6789',
      mine?.inviteCode ?? 'null',
    );

    console.log('\n2. Tâm nhóm là SNAPSHOT, không phải tham chiếu');
    // Owner dời Vị trí mặc định sang Đà Nẵng.
    await dataSource.query(
      `UPDATE users
       SET default_location = ST_SetSRID(ST_MakePoint(108.2022, 16.0544), 4326)::geography
       WHERE global_id = $1`,
      [OwnerId],
    );
    const [center] = await dataSource.query<{ moved_m: string }[]>(
      `SELECT ST_Distance(
                center_location,
                ST_SetSRID(ST_MakePoint(106.698, 10.7724), 4326)::geography
              ) AS moved_m
       FROM groups WHERE global_id = $1`,
      [GroupId],
    );
    check(
      'Owner đổi Default Location thì vùng nhóm ĐỨNG YÊN',
      Number(center?.moved_m) < 1,
      `lệch ${center?.moved_m}m`,
    );

    console.log('\n3. Link mời và membership');
    const invited = await groups.findActiveByInviteCode('ABCD2345EFGH6789');
    check('mã mời tra ra nhóm', invited?.groupId === GroupId);
    check(
      'mã sai trả null, KHÔNG phân biệt với nhóm đã giải tán',
      (await groups.findActiveByInviteCode('KHONGCOMAAAAAAAA')) === null,
    );

    await groups.addMember({
      globalId: '55555555-5555-4555-8555-5555555f1002',
      groupId: GroupId,
      userId: MemberId,
    });
    check('thành viên đã vào', await groups.hasMembership(MemberId));
    check('người ngoài chưa vào', !(await groups.hasMembership(OutsiderId)));

    const asMember = await groups.findMine(MemberId);
    check(
      'thành viên thường KHÔNG thấy link mời',
      asMember?.inviteCode === null,
      `${asMember?.inviteCode}`,
    );

    console.log('\n4. Một người thuộc tối đa MỘT nhóm');
    await groups.createWithOwner({
      globalId: OtherGroupId,
      ownerId: OtherOwnerId,
      name: 'Nhom khac',
      description: null,
      avatarUrl: null,
      coverUrl: null,
      centerLocation: { lat: 16.0544, lng: 108.2022 },
      regionLabel: 'Da Nang',
      radiusKm: 10,
      inviteCode: 'ZZZZ2345EFGH6789',
      ownerMembershipId: '55555555-5555-4555-8555-5555555f1003',
    });

    let blockedSecondGroup = false;
    try {
      await groups.addMember({
        globalId: '55555555-5555-4555-8555-5555555f1004',
        groupId: OtherGroupId,
        userId: MemberId,
      });
    } catch {
      blockedSecondGroup = true;
    }
    check(
      'database chặn thuộc hai nhóm — ràng buộc trên user_id, không phải cặp',
      blockedSecondGroup,
    );

    let blockedSecondOwned = false;
    try {
      await groups.createWithOwner({
        globalId: '66666666-6666-4666-8666-6666666f1003',
        ownerId: OwnerId,
        name: 'Nhom thu hai cua cung chu',
        description: null,
        avatarUrl: null,
        coverUrl: null,
        centerLocation: { lat: 10.7724, lng: 106.698 },
        regionLabel: 'Ha Noi',
        radiusKm: 10,
        inviteCode: 'YYYY2345EFGH6789',
        ownerMembershipId: '55555555-5555-4555-8555-5555555f1005',
      });
    } catch {
      blockedSecondOwned = true;
    }
    check('và chặn sở hữu hai nhóm còn sống', blockedSecondOwned);

    console.log('\n5. Quyền nhóm MANG PHẠM VI');
    check(
      'Owner có quyền trên nhóm MÌNH',
      await groups.hasGroupPermission({
        userId: OwnerId,
        groupId: GroupId,
        permission: 'group.settings.manage',
      }),
    );
    check(
      'nhưng KHÔNG có quyền đó trên nhóm KHÁC',
      !(await groups.hasGroupPermission({
        userId: OwnerId,
        groupId: OtherGroupId,
        permission: 'group.settings.manage',
      })),
    );
    check(
      'thành viên thường không có quyền cài đặt',
      !(await groups.hasGroupPermission({
        userId: MemberId,
        groupId: GroupId,
        permission: 'group.settings.manage',
      })),
    );
    check(
      'nhưng xem được trang nhóm',
      await groups.hasGroupPermission({
        userId: MemberId,
        groupId: GroupId,
        permission: 'group.overview.view',
      }),
    );

    console.log('\n5b. Sub-team — bảng riêng, phép gán mang phạm vi');
    const SubTeamId = '44444444-4444-4444-8444-4444444f1001';
    await groups.createSubTeam({
      globalId: SubTeamId,
      groupId: GroupId,
      name: 'To Dich Vong',
    });
    const teams = await groups.listSubTeams({ groupId: GroupId });
    check('tạo được tổ', teams.length === 1, `${teams.length} tổ`);
    check('tổ mới chưa có ai', teams[0]?.memberCount === 0);

    check(
      'xếp thành viên vào tổ và đặt vai trưởng tổ',
      await groups.assignMember({
        groupId: GroupId,
        userId: MemberId,
        subTeamId: SubTeamId,
        role: 'SUBTEAM_ADMIN' as never,
      }),
    );
    check(
      'tổ đếm được đầu người',
      (await groups.listSubTeams({ groupId: GroupId }))[0]?.memberCount === 1,
    );

    const roster = await groups.listMembers({
      groupId: GroupId,
      skip: 0,
      take: 50,
    });
    check('danh sách trả đủ hai người', roster.total === 2, `${roster.total}`);
    const assigned = roster.items.find((row) => row.userId === MemberId);
    check('kèm TÊN tổ, không chỉ id', assigned?.subTeamName === 'To Dich Vong');
    check('và vai mới', assigned?.role === 'SUBTEAM_ADMIN', assigned?.role);
    const ownerRow = roster.items.find((row) => row.userId === OwnerId);
    check(
      'Owner chưa vào tổ nào thì tên tổ là null',
      ownerRow?.subTeamName === null,
    );

    check(
      'trưởng tổ xem được thành viên tổ mình',
      await groups.hasGroupPermission({
        userId: MemberId,
        groupId: GroupId,
        permission: 'group.subteam.member.view',
      }),
    );
    check(
      'nhưng KHÔNG tạo được tổ — BR-GRP-05',
      !(await groups.hasGroupPermission({
        userId: MemberId,
        groupId: GroupId,
        permission: 'group.subteam.manage',
      })),
    );
    check(
      'và KHÔNG xem được affiliate toàn nhóm',
      !(await groups.hasGroupPermission({
        userId: MemberId,
        groupId: GroupId,
        permission: 'group.affiliate.view',
      })),
    );

    // Tổ của nhóm KHÁC: thiếu vế kiểm trong câu UPDATE thì Owner nhóm này xếp
    // được người của mình vào cơ cấu nhóm người ta.
    const OtherSubTeamId = '44444444-4444-4444-8444-4444444f1002';
    await groups.createSubTeam({
      globalId: OtherSubTeamId,
      groupId: OtherGroupId,
      name: 'To cua nhom khac',
    });
    check(
      'KHÔNG xếp được vào tổ của nhóm KHÁC',
      !(await groups.assignMember({
        groupId: GroupId,
        userId: MemberId,
        subTeamId: OtherSubTeamId,
        role: null,
      })),
    );
    check(
      'và lần từ chối đó không đụng gì tới bản ghi cũ',
      (
        await groups.listMembers({ groupId: GroupId, skip: 0, take: 50 })
      ).items.find((row) => row.userId === MemberId)?.subTeamId === SubTeamId,
    );
    check(
      'KHÔNG hạ được vai OWNER',
      !(await groups.assignMember({
        groupId: GroupId,
        userId: OwnerId,
        subTeamId: null,
        role: 'MEMBER' as never,
      })),
    );
    check(
      'người ngoài nhóm thì không gán được',
      !(await groups.assignMember({
        groupId: GroupId,
        userId: OutsiderId,
        subTeamId: SubTeamId,
        role: null,
      })),
    );
    check(
      'gỡ khỏi tổ được',
      await groups.assignMember({
        groupId: GroupId,
        userId: MemberId,
        subTeamId: null,
        role: null,
      }),
    );
    check(
      'gỡ xong thì tổ hết người, vai GIỮ NGUYÊN',
      (await groups.listSubTeams({ groupId: GroupId }))[0]?.memberCount === 0,
    );

    console.log('\n5d. Đổi vai KHÔNG âm thầm gỡ người khỏi tổ');
    // Bẫy cũ: controller đổi "không gửi subTeamId" thành `null`, còn câu UPDATE
    // ghi `sub_team_id` vô điều kiện. Nên phong trưởng tổ cho ai thì gỡ họ khỏi
    // đúng cái tổ họ sắp quản — và không có cách nào đổi vai mà giữ tổ.
    await groups.assignMember({
      groupId: GroupId,
      userId: MemberId,
      subTeamId: SubTeamId,
      role: 'MEMBER' as never,
    });
    check(
      'BỎ TRỐNG subTeamId thì giữ nguyên tổ',
      await groups.assignMember({
        groupId: GroupId,
        userId: MemberId,
        role: 'SUBTEAM_ADMIN' as never,
      }),
    );
    const keptTeam = (
      await groups.listMembers({ groupId: GroupId, skip: 0, take: 50 })
    ).items.find((row) => row.userId === MemberId);
    check(
      'vẫn ở trong tổ sau khi đổi vai',
      keptTeam?.subTeamId === SubTeamId,
      `${keptTeam?.subTeamId}`,
    );
    check(
      'và vai đã đổi thật',
      keptTeam?.role === 'SUBTEAM_ADMIN',
      keptTeam?.role,
    );

    console.log('\n5e. Trưởng tổ chỉ thấy tổ MÌNH, không thấy cả nhóm');
    const scoped = await groups.listMembers({
      groupId: GroupId,
      subTeamId: SubTeamId,
      skip: 0,
      take: 50,
    });
    check(
      'lọc theo tổ trả đúng một người',
      scoped.total === 1,
      `${scoped.total}`,
    );
    check(
      'và KHÔNG có Owner trong đó',
      !scoped.items.some((row) => row.userId === OwnerId),
    );
    check(
      'bỏ trống subTeamId thì vẫn trả CẢ nhóm',
      (await groups.listMembers({ groupId: GroupId, skip: 0, take: 50 }))
        .total === 2,
    );

    console.log('\n5f. Cận bán kính của cột khớp hằng trong code');
    // `resolveGroupRadiusKm` kẹp theo hằng `GroupRadiusColumnBoundsKm`, và hằng
    // đó là bản sao của ràng buộc dưới đây. Lệch nhau thì một cấu hình hợp lệ
    // theo code sẽ bị database từ chối — 500 ở mọi lượt tạo nhóm.
    const [radiusCheck] = await dataSource.query<{ def: string }[]>(
      `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
       WHERE conname = 'CHK_groups_radius'`,
    );
    check(
      'CHK_groups_radius vẫn là 1–50 như hằng trong code',
      /radius_km >= 1/.test(radiusCheck?.def ?? '') &&
        /radius_km <= 50/.test(radiusCheck?.def ?? ''),
      radiusCheck?.def ?? 'KHONG TIM THAY rang buoc',
    );

    console.log('\n5g. Xoá tổ — người trong tổ Ở LẠI nhóm');
    const DoomedTeamId = '44444444-4444-4444-8444-4444444f1003';
    await groups.createSubTeam({
      globalId: DoomedTeamId,
      groupId: GroupId,
      name: 'To se bi xoa',
    });
    await groups.assignMember({
      groupId: GroupId,
      userId: MemberId,
      subTeamId: DoomedTeamId,
      role: 'SUBTEAM_ADMIN' as never,
    });

    check(
      'Owner nhóm KHÁC không xoá được tổ của nhóm này',
      !(await groups.deleteSubTeam({
        groupId: OtherGroupId,
        subTeamId: DoomedTeamId,
      })),
    );
    check(
      'xoá được tổ của chính nhóm mình',
      await groups.deleteSubTeam({
        groupId: GroupId,
        subTeamId: DoomedTeamId,
      }),
    );
    check(
      'gọi lại trả false, KHÔNG đè mốc xoá cũ',
      !(await groups.deleteSubTeam({
        groupId: GroupId,
        subTeamId: DoomedTeamId,
      })),
    );
    check(
      'tổ biến khỏi danh sách',
      !(await groups.listSubTeams({ groupId: GroupId })).some(
        (team) => team.subTeamId === DoomedTeamId,
      ),
    );

    const afterDelete = (
      await groups.listMembers({ groupId: GroupId, skip: 0, take: 50 })
    ).items.find((row) => row.userId === MemberId);
    check(
      'người trong tổ VẪN ở trong nhóm, chỉ rời tổ',
      afterDelete !== undefined && afterDelete.subTeamId === null,
      `subTeamId=${afterDelete?.subTeamId}`,
    );
    check(
      'trưởng tổ của tổ đã xoá hạ về MEMBER',
      afterDelete?.role === 'MEMBER',
      afterDelete?.role,
    );

    console.log('\n5h. Bộ quyền vai có PHIÊN BẢN và thu hồi được');
    // Dựng LẠI vai trưởng tổ trước khi đo: mục 5g vừa hạ người này về MEMBER khi
    // xoá tổ của họ. Không dựng lại thì hai phép kiểm dưới đây xanh vì người đó
    // không còn là SUBTEAM_ADMIN — tức xanh vì lý do sai, và chúng sẽ vẫn xanh kể
    // cả khi việc thu hồi quyền hoàn toàn không hoạt động.
    const LiveTeamId = '44444444-4444-4444-8444-4444444f1004';
    await groups.createSubTeam({
      globalId: LiveTeamId,
      groupId: GroupId,
      name: 'To de do quyen',
    });
    await groups.assignMember({
      groupId: GroupId,
      userId: MemberId,
      subTeamId: LiveTeamId,
      role: 'SUBTEAM_ADMIN' as never,
    });
    check(
      'dựng lại được trưởng tổ để đo — nếu không thì hai phép kiểm dưới vô nghĩa',
      await groups.hasGroupPermission({
        userId: MemberId,
        groupId: GroupId,
        permission: 'group.subteam.activity.view',
      }),
    );

    const before = await groups.listRolePermissions();
    const subteamBefore = before.find((row) => row.role === 'SUBTEAM_ADMIN');
    check(
      'đọc được bộ quyền đang hiệu lực kèm phiên bản',
      subteamBefore !== undefined && subteamBefore.version >= 1,
      `version=${subteamBefore?.version}`,
    );

    const written = await groups.replaceRolePermissions({
      role: 'SUBTEAM_ADMIN' as never,
      permissions: ['group.subteam.member.view'],
      actorUserId: OwnerId,
      changeReason: 'Phep kiem: thu hoi quyen xem hoat dong to',
    });
    check(
      'ghi thành phiên bản MỚI',
      written.version === (subteamBefore?.version ?? 0) + 1,
      `${subteamBefore?.version} -> ${written.version}`,
    );
    check(
      'trả bộ CŨ để ghi audit so trước/sau',
      written.before.includes('group.subteam.activity.view'),
      written.before.join(', '),
    );

    // Đây là phép kiểm quan trọng nhất của cả nhóm 5h: thu hồi phải có HIỆU LỰC.
    // Thiếu vế MAX(version) trong `hasGroupPermission` thì dòng cũ vẫn khớp và
    // quyền đã thu hồi vẫn dùng được — tệ hơn cả việc chưa có đường thu hồi.
    check(
      'quyền đã THU HỒI mất tác dụng ngay',
      !(await groups.hasGroupPermission({
        userId: MemberId,
        groupId: GroupId,
        permission: 'group.subteam.activity.view',
      })),
    );
    check(
      'quyền còn giữ thì vẫn chạy',
      await groups.hasGroupPermission({
        userId: MemberId,
        groupId: GroupId,
        permission: 'group.subteam.member.view',
      }),
    );

    const history = await dataSource.query<{ total: string }[]>(
      `SELECT count(*) AS total FROM group_role_permissions WHERE role = 'SUBTEAM_ADMIN'`,
    );
    check(
      'dòng CŨ ở lại làm lịch sử',
      Number(history[0]?.total) > 1,
      `${history[0]?.total} dòng`,
    );

    // Tập rỗng: thiếu dòng mốc thì MAX(version) vẫn trỏ bộ cũ và việc thu hồi
    // toàn bộ âm thầm không có hiệu lực.
    await groups.replaceRolePermissions({
      role: 'SUBTEAM_ADMIN' as never,
      permissions: [],
      actorUserId: OwnerId,
      changeReason: 'Phep kiem: thu hoi toan bo quyen cua truong to',
    });
    check(
      'thu hồi TOÀN BỘ thì không quyền nào còn tác dụng',
      !(await groups.hasGroupPermission({
        userId: MemberId,
        groupId: GroupId,
        permission: 'group.subteam.member.view',
      })),
    );
    const emptySet = (await groups.listRolePermissions()).find(
      (row) => row.role === 'SUBTEAM_ADMIN',
    );
    check(
      'và danh sách đọc ra RỖNG, không lộ dòng mốc',
      emptySet === undefined || emptySet.permissions.length === 0,
      `${emptySet?.permissions.join(', ')}`,
    );

    console.log('\n6. Owner xoá tài khoản → nhóm giải tán');
    const dissolved = await groups.dissolveOwnedBy(OwnerId);
    check('giải tán đúng một nhóm', dissolved === 1, `${dissolved}`);

    const [after] = await dataSource.query<
      { status: string; dissolved_at: Date | null }[]
    >(`SELECT status, dissolved_at FROM groups WHERE global_id = $1`, [
      GroupId,
    ]);
    check('trạng thái DISSOLVED', after?.status === 'DISSOLVED');
    check('có mốc giải tán', after?.dissolved_at !== null);

    const [kept] = await dataSource.query<{ total: string }[]>(
      `SELECT count(*) AS total FROM group_memberships WHERE group_id = $1`,
      [GroupId],
    );
    check(
      'membership GIỮ NGUYÊN để tra lại được',
      Number(kept?.total) === 2,
      `${kept?.total} bản ghi`,
    );

    check(
      'link mời hết dùng được ngay',
      (await groups.findActiveByInviteCode('ABCD2345EFGH6789')) === null,
    );
    check(
      'và quyền trên nhóm đã giải tán cũng mất',
      !(await groups.hasGroupPermission({
        userId: OwnerId,
        groupId: GroupId,
        permission: 'group.settings.manage',
      })),
    );

    check(
      'gọi lại không giải tán thêm lần nào',
      (await groups.dissolveOwnedBy(OwnerId)) === 0,
    );

    console.log('\n6b. Giải tán KHÔNG khoá thành viên ngoài hệ thống nhóm');
    // Lỗ này sống tới 30/09: `hasMembership` chỉ hỏi "có dòng membership nào
    // không", nên sau khi nhóm giải tán, thành viên cũ vẫn bị coi là đã có nhóm.
    // Họ không lập được nhóm mới, mà cũng không vào nhóm nào khác được — đường
    // duy nhất để vào là link mời cho tài khoản MỚI. Nhóm đã chết, họ mất luôn
    // quyền thuộc một nhóm.
    const statuses = await dataSource.query<{ status: string }[]>(
      `SELECT status FROM group_memberships WHERE group_id = $1`,
      [GroupId],
    );
    check(
      'membership của nhóm đã giải tán thôi hiệu lực',
      statuses.length === 2 &&
        statuses.every((row) => row.status === 'DISSOLVED'),
      statuses.map((row) => row.status).join(', '),
    );
    check(
      'nhưng dòng vẫn Ở LẠI làm lịch sử (CHỐT-02)',
      statuses.length === 2,
      `${statuses.length} bản ghi`,
    );
    check(
      'hasMembership trả false — thành viên cũ KHÔNG còn bị coi là có nhóm',
      !(await groups.hasMembership(MemberId)),
    );
    check(
      'findMine trả null nên màn hình Nhóm của tôi hiện lại nút Tạo nhóm',
      (await groups.findMine(MemberId)) === null,
    );

    // Đây là phép kiểm mà index một phần phải đỗ: UNIQUE trần trên `user_id` sẽ
    // chặn dòng thứ hai, và khi đó thành viên cũ vẫn kẹt dù đã sửa hasMembership.
    const RebornGroupId = '55555555-5555-4555-8555-5555555f1001';
    await groups.createWithOwner({
      globalId: RebornGroupId,
      ownerId: MemberId,
      name: 'Nhom lap lai sau giai tan',
      description: null,
      avatarUrl: null,
      coverUrl: null,
      centerLocation: { lat: 21.03, lng: 105.85 },
      regionLabel: 'Ha Noi',
      radiusKm: 10,
      inviteCode: 'REBORN2345EFGH67',
      ownerMembershipId: '66666666-6666-4666-8666-6666666f1001',
    });
    check(
      'thành viên cũ lập được nhóm MỚI — đúng ý của index một phần',
      (await groups.findMine(MemberId))?.groupId === RebornGroupId,
    );
    check(
      'và người đó nay có hai dòng membership: một lịch sử, một hiệu lực',
      (
        await dataSource.query<{ total: string }[]>(
          `SELECT count(*) AS total FROM group_memberships WHERE user_id = $1`,
          [MemberId],
        )
      )[0]?.total === '2',
    );
    check(
      'quyền đọc từ dòng HIỆU LỰC, không phải dòng lịch sử',
      await groups.hasGroupPermission({
        userId: MemberId,
        groupId: RebornGroupId,
        permission: 'group.settings.manage',
      }),
    );

    console.log('\nN. listForAdmin — CMS chọn nhóm (A5)');
    const byName = await groups.listForAdmin({
      keyword: 'cau GIAY',
      status: null,
      skip: 0,
      take: 10,
    });
    check(
      'tìm theo tên không phân biệt hoa thường, thấy cả nhóm đã giải tán',
      byName.total === 1 &&
        byName.items[0]?.groupId === GroupId &&
        byName.items[0].status === 'DISSOLVED',
      JSON.stringify(byName.items.map((item) => item.name)),
    );
    const byOwner = await groups.listForAdmin({
      keyword: 'thanh-vien',
      status: null,
      skip: 0,
      take: 10,
    });
    check(
      'tìm theo username chủ nhóm; đếm chỉ thành viên đang hiệu lực',
      byOwner.items.length === 1 &&
        byOwner.items[0]?.groupId === RebornGroupId &&
        byOwner.items[0].ownerUsername === 'thanh-vien' &&
        byOwner.items[0].memberCount === 1,
      JSON.stringify(byOwner.items[0]),
    );
    const byId = await groups.listForAdmin({
      keyword: OtherGroupId,
      status: null,
      skip: 0,
      take: 10,
    });
    check(
      'dán đúng groupId thì ra đúng nhóm đó',
      byId.total === 1 && byId.items[0]?.groupId === OtherGroupId,
    );
    const activeOnly = await groups.listForAdmin({
      keyword: null,
      status: GroupStatuses.ACTIVE,
      skip: 0,
      take: 10,
    });
    check(
      'lọc ACTIVE bỏ nhóm đã giải tán',
      activeOnly.total >= 2 &&
        activeOnly.items.every((item) => item.status === 'ACTIVE'),
      `${activeOnly.total}`,
    );
    const firstPage = await groups.listForAdmin({
      keyword: null,
      status: null,
      skip: 0,
      take: 1,
    });
    check(
      'total là tổng cả bộ lọc, không phải cỡ trang',
      firstPage.items.length === 1 && firstPage.total === activeOnly.total + 1,
      `items=${firstPage.items.length} total=${firstPage.total}`,
    );
    check(
      'trang vượt cuối vẫn trả total đúng',
      (
        await groups.listForAdmin({
          keyword: null,
          status: null,
          skip: 100,
          take: 10,
        })
      ).total === firstPage.total,
    );

    console.log(
      '\nP. Đăng ký kèm mã mời — kiểm và vào nhóm CÙNG transaction (SRS 3.7A)',
    );
    const users = new UserRepository(
      entities.UserEntity as never,
      dataSource.manager,
    );
    const register = (globalId: string, username: string, code?: string) =>
      users.createWithReferral({
        globalId,
        username,
        passwordHash: 'x',
        groupInviteCode: code,
      });
    const InvitedId = '99999999-9999-4999-8999-9999999f1101';
    const joined = await register(
      InvitedId,
      'moi-qua-link',
      'ZZZZ2345EFGH6789',
    );
    check(
      'mã của nhóm ACTIVE: tài khoản tạo xong ĐÃ là thành viên của đúng nhóm đó',
      joined.joinedGroupId === OtherGroupId &&
        (await groups.findMine(InvitedId))?.groupId === OtherGroupId,
      `${joined.joinedGroupId}`,
    );
    check(
      'vào với vai MEMBER, không phải vai nào khác',
      (await groups.findMine(InvitedId))?.myRole === 'MEMBER',
    );

    const rejectsWith = async (globalId: string, code: string) => {
      try {
        await register(globalId, `tu-choi-${globalId.slice(-4)}`, code);
        return 'không ném gì';
      } catch (error) {
        return (error as Error).constructor.name;
      }
    };
    const accountExists = async (globalId: string) =>
      (
        await dataSource.query<{ total: string }[]>(
          `SELECT count(*)::text AS total FROM users WHERE global_id = $1`,
          [globalId],
        )
      )[0]?.total === '1';

    const WrongCodeId = '99999999-9999-4999-8999-9999999f1102';
    check(
      'mã không tồn tại: GroupInviteInvalidException',
      (await rejectsWith(WrongCodeId, 'KHONGCOMA0000000')) ===
        'GroupInviteInvalidException',
    );
    check(
      'và KHÔNG để lại tài khoản nào — cả lượt đăng ký rollback',
      !(await accountExists(WrongCodeId)),
    );
    const DissolvedCodeId = '99999999-9999-4999-8999-9999999f1103';
    check(
      'mã của nhóm ĐÃ GIẢI TÁN cũng bị từ chối, không để lại tài khoản',
      (await rejectsWith(DissolvedCodeId, 'ABCD2345EFGH6789')) ===
        'GroupInviteInvalidException' &&
        !(await accountExists(DissolvedCodeId)),
    );
    const PlainId = '99999999-9999-4999-8999-9999999f1104';
    const plain = await register(PlainId, 'dang-ky-thuong');
    check(
      'không gửi mã thì đăng ký bình thường, không vào nhóm nào',
      plain.user !== null &&
        plain.joinedGroupId === null &&
        (await groups.findMine(PlainId)) === null,
    );
    // Bốn id trên chung 12 ký tự đầu nên mã giới thiệu ứng viên đầu TRÙNG nhau —
    // lần tạo thứ hai phải lùi sang ứng viên kế. Trước SAVEPOINT, đúng ca này nổ
    // "current transaction is aborted" và đăng ký trả 500.
    const codes = await dataSource.query<{ referral_code: string }[]>(
      `SELECT referral_code FROM users WHERE global_id = ANY($1::uuid[])`,
      [[InvitedId, PlainId]],
    );
    check(
      'mã giới thiệu đầu trùng thì lùi sang ứng viên kế, không 500',
      codes.length === 2 && codes[0].referral_code !== codes[1].referral_code,
      codes.map((row) => row.referral_code).join(' / '),
    );
  } finally {
    for (const source of opened.reverse())
      if (source.isInitialized) await source.destroy();
  }

  console.log(
    `\n${
      failures.length === 0
        ? 'Group: tâm là snapshot, một người một nhóm, quyền mang phạm vi'
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
