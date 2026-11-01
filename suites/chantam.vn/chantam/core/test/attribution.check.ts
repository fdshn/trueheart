/**
 * Deferred attribution trên Postgres THẬT, đi qua use case thật + khoá Ed25519 thật.
 *
 * Phủ các mục kiểm thử bắt buộc của spec 01/11:
 *  1. token đúng chữ ký resolve được          2. sai chữ ký / sai audience / hết hạn
 *  3. resolve lặp cùng bản cài ra cùng kết quả 4. đổi IP vẫn resolve và claim được
 *  5. tự giới thiệu bị từ chối (cả vòng)       6. claim lặp bởi cùng người là idempotent
 *  7. token bị người khác claim thì từ chối     8. một người không có hai người giới thiệu
 *  9. deep link bốn loại đúng contract         10. không phát thưởng trước onboarding
 * 11. (rate limit: unit test)                  12. (envelope: smoke HTTP)
 * Thêm: claim song song, thu hồi link, bản cài dùng lại → chờ duyệt, duyệt/từ chối,
 * ràng buộc database.
 *
 *   npm run test:attribution
 */
import {
  AttributionPlatforms,
  AttributionRiskStatuses,
  AttributionTargetTypes,
} from '@chantam.vn/chantam.core-lib/consts';
import { resolveAllEntities } from '@chantam/service.persistency-lib';
import { config as loadEnvFile } from 'dotenv';
import { generateKeyPairSync } from 'node:crypto';
import { DataSource } from 'typeorm';
import {
  ClaimAttributionUseCase,
  CreateAttributionLinkUseCase,
  RecordAttributionClickUseCase,
  ResolveAttributionUseCase,
  RevokeAttributionLinksUseCase,
} from '../src/application/implementations/attribution/attribution.use-cases';
import * as entities from '../src/infrastructure/entity';
import * as migrations from '../src/infrastructure/persistence/migrations';
import { AttributionRepository } from '../src/infrastructure/repository/attribution.repository';
import { Ed25519AttributionTokenService } from '../src/infrastructure/security/attribution-token.service';

loadEnvFile({ path: '.env.local' });
loadEnvFile();

const ScratchDatabase = 'chantam_attribution_check';
const id = (tail: string) => `7a000000-0000-4000-8000-0000000000${tail}`;
const Referrer = id('01');
const Referrer2 = id('02');
const Newbie = id('03');
const Other = id('04');
const OldUser = id('05');
const Member = id('06');
const LoopUser = id('07');
const CodeUser = id('08');
const Racer1 = id('09');
const Racer2 = id('10');
const Twin1 = id('11');
const Twin2 = id('12');
const GroupId = id('20');
const PostId = id('21');
const CategoryId = '30000000-0000-4000-8000-000000000001';

const failures: string[] = [];
function check(label: string, ok: boolean, detail = ''): void {
  console.log(
    `  ${ok ? 'OK  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`,
  );
  if (!ok) failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
}

async function errorCode(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
    return 'OK';
  } catch (error) {
    return (error as { constructor: { name: string } }).constructor.name;
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
    extra: { max: 10 },
  });
  await dataSource.initialize();
  opened.push(dataSource);
  await dataSource.runMigrations();
  console.log('Đã dựng schema trên database nháp\n');

  try {
    const sql = (query: string, params: unknown[] = []) =>
      dataSource.query(query, params);

    console.log('0. Migration');
    await dataSource.undoLastMigration();
    await dataSource.runMigrations();
    check('down → up chạy được', true);

    const people: [string, string, string, string][] = [
      [Referrer, 'at_referrer', 'MEMBER', '0 days'],
      [Referrer2, 'at_referrer2', 'MEMBER', '0 days'],
      [Newbie, 'at_newbie', 'VIEWER', '0 days'],
      [Other, 'at_other', 'VIEWER', '0 days'],
      [OldUser, 'at_old', 'VIEWER', '30 days'],
      [Member, 'at_member', 'MEMBER', '1 day'],
      [LoopUser, 'at_loop', 'VIEWER', '0 days'],
      [CodeUser, 'at_code', 'VIEWER', '0 days'],
      [Racer1, 'at_racer1', 'VIEWER', '0 days'],
      [Racer2, 'at_racer2', 'VIEWER', '0 days'],
      [Twin1, 'at_twin1', 'VIEWER', '0 days'],
      [Twin2, 'at_twin2', 'VIEWER', '0 days'],
    ];
    for (const [userId, username, rank, age] of people)
      await sql(
        `INSERT INTO users (global_id, username, password_hash, rank, status, referral_code, created_at)
         VALUES ($1, $2, 'x', $3, 'ACTIVE', $5, now() - $4::interval)`,
        // Mã riêng một tham số: dùng lại `$2` vừa làm varchar vừa làm text là 42P08.
        [
          userId,
          username,
          rank,
          age,
          userId.replaceAll('-', '').slice(20).toUpperCase(),
        ],
      );
    await sql(
      `INSERT INTO groups (global_id, owner_id, name, center_location, region_label,
                           radius_km, invite_code, status, activated_at)
       VALUES ($1, $2, 'Nhóm kiểm', ST_SetSRID(ST_MakePoint(105.79, 20.97), 4326)::geography,
               'Hà Nội', 10, 'E52BJ7GQ9HK5G2EW', 'ACTIVE', now())`,
      [GroupId, Referrer],
    );
    await sql(
      `INSERT INTO posts
         (global_id, post_type, author_id, category_id, title, description, location, area_label,
          status, total_quantity, remaining_quantity, details, renewed_count, share_code)
       VALUES ($1, 'OFFER', $2, $3, 'Bài kiểm', 'Mô tả đủ dài cho bài kiểm attribution',
               ST_SetSRID(ST_MakePoint(106.698, 10.7724), 4326)::geography, 'Quận 1',
               'PUBLISHED', 1, 1, '{}'::jsonb, 0, 'SHARE12345')`,
      [PostId, Referrer, CategoryId],
    );

    const pem = generateKeyPairSync('ed25519')
      .privateKey.export({ type: 'pkcs8', format: 'pem' })
      .toString();
    const config = {
      attribution: { signingKeys: [{ kid: 'k1', privateKeyPem: pem }] },
      web: { publicBaseUrl: 'https://chantam.vn' },
      security: { phoneHashPepper: 'pepper-check' },
    };
    const tokens = new Ed25519AttributionTokenService(config as never);
    const otherTokens = new Ed25519AttributionTokenService({
      attribution: {
        signingKeys: [
          {
            kid: 'k1',
            privateKeyPem: generateKeyPairSync('ed25519')
              .privateKey.export({ type: 'pkcs8', format: 'pem' })
              .toString(),
          },
        ],
      },
    } as never);
    const throttle = {
      assertWithinLimit: async () => undefined,
      registerHit: async () => undefined,
    };
    const repo = new AttributionRepository(dataSource.manager);
    const createLink = new CreateAttributionLinkUseCase(
      repo,
      throttle,
      config as never,
    );
    const recordClick = new RecordAttributionClickUseCase(
      repo,
      tokens,
      throttle,
      config as never,
    );
    const resolve = new ResolveAttributionUseCase(
      repo,
      tokens,
      throttle,
      config as never,
    );
    const claim = new ClaimAttributionUseCase(
      repo,
      tokens,
      throttle,
      config as never,
    );
    const revoke = new RevokeAttributionLinksUseCase(repo);

    const install = (n: number) =>
      `550e8400-e29b-41d4-a716-4466554400${String(n).padStart(2, '0')}`;
    const newClickToken = async (code: string) =>
      (
        await recordClick.handle({
          code,
          clientIp: '1.1.1.1',
          userAgent: 'Safari',
        })
      ).click.token;
    const resolveFor = (token: string, n: number, ip = '1.1.1.1') =>
      resolve.handle({
        token,
        installId: install(n),
        platform: AttributionPlatforms.IOS,
        clientIp: ip,
      });

    console.log('\n1. Link và deep link (mục 9)');
    const postLink = await createLink.handle({
      userId: Referrer,
      link: {
        targetType: AttributionTargetTypes.POST,
        targetValue: 'SHARE12345',
        campaign: 'tet',
      },
    });
    const again = await createLink.handle({
      userId: Referrer,
      link: {
        targetType: AttributionTargetTypes.POST,
        targetValue: 'SHARE12345',
        campaign: 'tet',
      },
    });
    check(
      'tạo lại link y hệt trả link cũ',
      postLink.created &&
        !again.created &&
        again.link.code === postLink.link.code,
    );
    const deepLinks: [AttributionTargetTypes, string][] = [
      [AttributionTargetTypes.POST, 'SHARE12345'],
      [AttributionTargetTypes.PROFILE, 'at_referrer2'],
      [AttributionTargetTypes.USER, 'at_referrer2'],
    ];
    const [{ ready }] = await sql(
      `SELECT EXISTS (SELECT 1 FROM groups WHERE global_id = $1) AS ready`,
      [GroupId],
    );
    if (ready)
      deepLinks.push([AttributionTargetTypes.GROUP_INVITE, 'E52BJ7GQ9HK5G2EW']);
    for (const [type, value] of deepLinks) {
      const link = await createLink.handle({
        userId: Referrer2,
        link: { targetType: type, targetValue: value },
      });
      const resolved = await resolveFor(
        await newClickToken(link.link.code),
        90,
      );
      check(
        `deep link ${type} trả {type, value}`,
        resolved.matched &&
          resolved.deepLink?.type === type &&
          resolved.deepLink.value === value,
        JSON.stringify(resolved.deepLink),
      );
    }
    check(
      'đã kiểm GROUP_INVITE',
      ready === true,
      ready ? '' : 'không dựng được nhóm mẫu',
    );
    check(
      'đích không có thật → 404',
      (await errorCode(() =>
        createLink.handle({
          userId: Referrer,
          link: {
            targetType: AttributionTargetTypes.POST,
            targetValue: 'NOPE',
          },
        }),
      )) === 'AttributionTargetNotFoundException',
    );

    console.log('\n2. Resolve (mục 1, 2, 3, 4)');
    const token = await newClickToken(postLink.link.code);
    const first = await resolveFor(token, 1);
    const repeat = await resolveFor(token, 1, '8.8.8.8');
    const [referrerCode] = await sql(
      `SELECT referral_code FROM users WHERE global_id = $1`,
      [Referrer],
    );
    check(
      'khớp: referralCode của người mời, deep link POST',
      first.matched &&
        first.referralCode === referrerCode.referral_code &&
        first.deepLink?.type === 'POST',
    );
    check(
      'gọi lại cùng bản cài (đổi IP) → cùng claim token',
      repeat.attributionToken === first.attributionToken,
    );
    const otherInstall = await resolveFor(token, 2);
    check(
      'bản cài khác → claim token khác',
      otherInstall.attributionToken !== first.attributionToken,
    );
    const [{ n: resolutions }] = await sql(
      `SELECT count(*)::int AS n FROM attribution_resolutions`,
    );
    const [installRow] = await sql(
      `SELECT install_id_hash FROM attribution_resolutions LIMIT 1`,
    );
    check(
      'installId chỉ lưu dạng băm',
      !String(installRow.install_id_hash).includes('550e8400') &&
        resolutions >= 2,
    );
    check(
      'chuỗi lạ → matched:false',
      (await resolveFor('xin chao', 1)).matched === false,
    );
    const forged = otherTokens.sign('RESOLVE', {
      jti: '00000000-0000-4000-8000-000000000000',
      issuedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    });
    check(
      'sai chữ ký → matched:false',
      (await resolveFor(forged, 1)).matched === false,
    );
    check(
      'dán claim token vào resolve → INVALID',
      (await errorCode(() => resolveFor(first.attributionToken ?? '', 1))) ===
        'AttributionTokenInvalidException',
    );
    const expiredToken = tokens.sign('RESOLVE', {
      jti: '00000000-0000-4000-8000-000000000001',
      issuedAt: new Date(Date.now() - 20 * 86_400_000),
      expiresAt: new Date(Date.now() - 86_400_000),
    });
    check(
      'hết hạn → EXPIRED',
      (await errorCode(() => resolveFor(expiredToken, 1))) ===
        'AttributionTokenExpiredException',
    );

    console.log('\n3. Claim (mục 5, 6, 7, 8, 10)');
    const claimed = await claim.handle({
      userId: Newbie,
      attributionToken: first.attributionToken ?? '',
      clientIp: '1.1.1.1',
    });
    const [referral] = await sql(
      `SELECT referrer_id, qualified_at, reward_entry_id FROM referrals WHERE referee_id = $1`,
      [Newbie],
    );
    check(
      'claim ghi đúng referrals, chưa đủ điều kiện, chưa thưởng',
      claimed.claimed &&
        claimed.riskStatus === AttributionRiskStatuses.QUALIFIED &&
        referral?.referrer_id === Referrer &&
        referral.qualified_at === null &&
        referral.reward_entry_id === null,
    );
    const [{ n: ledger }] = await sql(
      `SELECT count(*)::int AS n FROM point_ledger WHERE user_id = $1`,
      [Referrer],
    );
    check(
      'không bút toán điểm nào cho người mời (mục 10)',
      ledger === 0,
      `ledger=${ledger}`,
    );
    const retry = await claim.handle({
      userId: Newbie,
      attributionToken: first.attributionToken ?? '',
      clientIp: '9.9.9.9',
    });
    check('cùng người claim lại (đổi IP) → idempotent', retry.claimed);
    check(
      'người khác claim cùng token → ALREADY_CLAIMED',
      (await errorCode(() =>
        claim.handle({
          userId: Other,
          attributionToken: first.attributionToken ?? '',
          clientIp: '1.1.1.1',
        }),
      )) === 'AttributionAlreadyClaimedException',
    );
    check(
      'người khác dùng claim token của bản cài khác trên CÙNG lượt mở → ALREADY_CLAIMED',
      (await errorCode(() =>
        claim.handle({
          userId: Other,
          attributionToken: otherInstall.attributionToken ?? '',
          clientIp: '1.1.1.1',
        }),
      )) === 'AttributionAlreadyClaimedException',
    );
    const secondLink = await createLink.handle({ userId: Referrer2, link: {} });
    const second = await resolveFor(
      await newClickToken(secondLink.link.code),
      3,
    );
    check(
      'đã có người giới thiệu → claim link người khác bị từ chối',
      (await errorCode(() =>
        claim.handle({
          userId: Newbie,
          attributionToken: second.attributionToken ?? '',
          clientIp: '1.1.1.1',
        }),
      )) === 'AttributionReferrerExistsException',
    );

    const selfLink = await createLink.handle({ userId: Newbie, link: {} });
    const selfResolved = await resolveFor(
      await newClickToken(selfLink.link.code),
      4,
    );
    check(
      'tự giới thiệu → SELF_REFERRAL',
      (await errorCode(() =>
        claim.handle({
          userId: Newbie,
          attributionToken: selfResolved.attributionToken ?? '',
          clientIp: '1.1.1.1',
        }),
      )) === 'AttributionSelfReferralException',
    );
    // Vòng: Newbie đã được Referrer giới thiệu; Referrer không được nhận giới thiệu từ Newbie.
    // Referrer là MEMBER nên dùng LoopUser: LoopUser mời CodeUser trước, rồi CodeUser→LoopUser.
    await sql(
      `INSERT INTO referrals (referrer_id, referee_id, code) VALUES ($1, $2, 'X')`,
      [LoopUser, Twin2],
    );
    const loopLink = await createLink.handle({ userId: Twin2, link: {} });
    const loopResolved = await resolveFor(
      await newClickToken(loopLink.link.code),
      5,
    );
    check(
      'giới thiệu vòng (B mời lại người đã mời mình) → SELF_REFERRAL',
      (await errorCode(() =>
        claim.handle({
          userId: LoopUser,
          attributionToken: loopResolved.attributionToken ?? '',
          clientIp: '1.1.1.1',
        }),
      )) === 'AttributionSelfReferralException',
    );

    const eligibilityLink = await createLink.handle({
      userId: Referrer,
      link: { campaign: 'eligibility' },
    });
    for (const [label, userId] of [
      ['tài khoản quá 7 ngày', OldUser],
      ['đã hoàn tất onboarding', Member],
    ] as const) {
      const resolved = await resolveFor(
        await newClickToken(eligibilityLink.link.code),
        userId === OldUser ? 6 : 7,
      );
      check(
        `${label} → NOT_ELIGIBLE`,
        (await errorCode(() =>
          claim.handle({
            userId,
            attributionToken: resolved.attributionToken ?? '',
            clientIp: '1.1.1.1',
          }),
        )) === 'AttributionNotEligibleException',
      );
    }

    await sql(
      `INSERT INTO referrals (referrer_id, referee_id, code) VALUES ($1, $2, 'BYCODE')`,
      [Referrer, CodeUser],
    );
    const sameReferrer = await resolveFor(
      await newClickToken(eligibilityLink.link.code),
      8,
    );
    const sameResult = await claim.handle({
      userId: CodeUser,
      attributionToken: sameReferrer.attributionToken ?? '',
      clientIp: '1.1.1.1',
    });
    const [{ n: codeReferrals }] = await sql(
      `SELECT count(*)::int AS n FROM referrals WHERE referee_id = $1`,
      [CodeUser],
    );
    check(
      'đã nhập mã CÙNG người mời lúc đăng ký → claim thành công, không thêm dòng referrals',
      sameResult.claimed && codeReferrals === 1,
    );

    console.log('\n4. Claim song song');
    const raceLink = await createLink.handle({
      userId: Referrer,
      link: { campaign: 'race' },
    });
    const raceResolved = await resolveFor(
      await newClickToken(raceLink.link.code),
      10,
    );
    const race = await Promise.all(
      [Racer1, Racer2].map((userId) =>
        errorCode(() =>
          claim.handle({
            userId,
            attributionToken: raceResolved.attributionToken ?? '',
            clientIp: '1.1.1.1',
          }),
        ),
      ),
    );
    const [{ n: raceClaims }] = await sql(
      `SELECT count(*)::int AS n FROM attribution_claims WHERE referred_user_id IN ($1, $2)`,
      [Racer1, Racer2],
    );
    check(
      'hai tài khoản claim cùng token song song → đúng một thắng',
      race.filter((r) => r === 'OK').length === 1 &&
        race.filter((r) => r === 'AttributionAlreadyClaimedException')
          .length === 1 &&
        raceClaims === 1,
      race.join(','),
    );

    console.log('\n5. Bản cài dùng lại → chờ duyệt');
    const twinLink = await createLink.handle({
      userId: Referrer2,
      link: { campaign: 'twin' },
    });
    const twinA = await resolveFor(await newClickToken(twinLink.link.code), 11);
    await claim.handle({
      userId: Twin1,
      attributionToken: twinA.attributionToken ?? '',
      clientIp: '1.1.1.1',
    });
    const twinB = await resolveFor(await newClickToken(twinLink.link.code), 11);
    const flagged = await claim.handle({
      userId: Racer2,
      attributionToken: twinB.attributionToken ?? '',
      clientIp: '1.1.1.1',
    });
    const [{ n: racer2Referrals }] = await sql(
      `SELECT count(*)::int AS n FROM referrals WHERE referee_id = $1`,
      [Racer2],
    );
    check(
      'cùng bản cài claim cho tài khoản thứ hai → PENDING_REVIEW, CHƯA ghi referrals',
      flagged.riskStatus === AttributionRiskStatuses.PENDING_REVIEW &&
        racer2Referrals === 0,
      flagged.riskStatus,
    );
    const [pending] = await sql(
      `SELECT global_id FROM attribution_claims WHERE referred_user_id = $1`,
      [Racer2],
    );
    const approved = await repo.reviewClaim({
      claimId: pending.global_id,
      reviewerId: Referrer,
      decision: 'APPROVE',
      note: 'người nhà',
    });
    const [{ n: afterApprove }] = await sql(
      `SELECT count(*)::int AS n FROM referrals WHERE referee_id = $1`,
      [Racer2],
    );
    const [{ n: audits }] = await sql(
      `SELECT count(*)::int AS n FROM admin_audit_logs WHERE action = 'ATTRIBUTION_CLAIM_APPROVE'`,
    );
    check(
      'duyệt → QUALIFIED, ghi referrals, có audit log Admin',
      approved.status === 'REVIEWED' &&
        approved.claim.riskStatus === 'QUALIFIED' &&
        afterApprove === 1 &&
        audits === 1,
    );
    check(
      'duyệt lần hai → ALREADY_REVIEWED',
      (
        await repo.reviewClaim({
          claimId: pending.global_id,
          reviewerId: Referrer,
          decision: 'REJECT',
          note: 'x',
        })
      ).status === 'ALREADY_REVIEWED',
    );

    console.log('\n6. Thu hồi');
    const revokeLink = await createLink.handle({
      userId: Referrer2,
      link: { campaign: 'revoke-me' },
    });
    const pendingToken = await newClickToken(revokeLink.link.code);
    const resolvedBeforeRevoke = await resolveFor(pendingToken, 12);
    const revoked = await revoke.handle({
      actorId: Referrer,
      revocation: { campaign: 'revoke-me', reason: 'spam' },
    });
    check(
      'thu hồi theo chiến dịch đếm đúng số link',
      revoked.revokedLinks === 1,
    );
    check(
      'resolve token của link đã thu hồi → REVOKED',
      (await errorCode(() => resolveFor(pendingToken, 13))) ===
        'AttributionTokenRevokedException',
    );
    check(
      'claim token phát trước khi thu hồi → REVOKED',
      (await errorCode(() =>
        claim.handle({
          userId: Other,
          attributionToken: resolvedBeforeRevoke.attributionToken ?? '',
          clientIp: '1.1.1.1',
        }),
      )) === 'AttributionTokenRevokedException',
    );
    check(
      'landing mở link đã thu hồi → REVOKED',
      (await errorCode(() => newClickToken(revokeLink.link.code))) ===
        'AttributionTokenRevokedException',
    );
    const recreated = await createLink.handle({
      userId: Referrer2,
      link: { campaign: 'revoke-me' },
    });
    check(
      'tạo lại sau thu hồi → link MỚI',
      recreated.created && recreated.link.code !== revokeLink.link.code,
    );

    console.log('\n7. Claim token hết hạn');
    const expiryLink = await createLink.handle({
      userId: Referrer,
      link: { campaign: 'expiry' },
    });
    const expiryResolved = await resolveFor(
      await newClickToken(expiryLink.link.code),
      14,
    );
    await claim.handle({
      userId: Other,
      attributionToken: expiryResolved.attributionToken ?? '',
      clientIp: '1.1.1.1',
    });
    const [res] = await sql(
      `SELECT claim_jti, resolved_at FROM attribution_resolutions WHERE claim_jti IN
         (SELECT claim_jti FROM attribution_claims WHERE referred_user_id = $1)`,
      [Other],
    );
    const staleClaimToken = tokens.sign('CLAIM', {
      jti: res.claim_jti,
      issuedAt: new Date(Date.now() - 3 * 86_400_000),
      expiresAt: new Date(Date.now() - 86_400_000),
    });
    const staleRetry = await claim.handle({
      userId: Other,
      attributionToken: staleClaimToken,
      clientIp: '1.1.1.1',
    });
    check(
      'người đã claim gọi lại bằng token đã hết hạn → vẫn idempotent',
      staleRetry.claimed,
    );
    const freshLink = await createLink.handle({
      userId: Referrer,
      link: { campaign: 'fresh-expiry' },
    });
    const freshResolved = await resolveFor(
      await newClickToken(freshLink.link.code),
      15,
    );
    const [freshRow] = await sql(
      `SELECT claim_jti FROM attribution_resolutions ORDER BY id DESC LIMIT 1`,
    );
    check(
      'người chưa claim dùng claim token hết hạn → EXPIRED',
      Boolean(freshResolved.matched) &&
        (await errorCode(() =>
          claim.handle({
            userId: Twin2,
            attributionToken: tokens.sign('CLAIM', {
              jti: freshRow.claim_jti,
              issuedAt: new Date(Date.now() - 3 * 86_400_000),
              expiresAt: new Date(Date.now() - 86_400_000),
            }),
            clientIp: '1.1.1.1',
          }),
        )) === 'AttributionTokenExpiredException',
    );

    console.log('\n8. Thưởng chỉ sau onboarding (mục 10)');
    const pendingQualify = async () =>
      (
        await sql(
          `SELECT invite.referee_id FROM referrals invite JOIN users referee ON referee.global_id = invite.referee_id
           WHERE invite.qualified_at IS NULL AND referee.rank <> 'VIEWER' AND invite.referee_id = $1`,
          [Newbie],
        )
      ).length;
    const beforeOnboarding = await pendingQualify();
    await sql(`UPDATE users SET rank = 'MEMBER' WHERE global_id = $1`, [
      Newbie,
    ]);
    check(
      'quan hệ từ claim chỉ vào hàng chờ thưởng khi người được mời rời VIEWER',
      beforeOnboarding === 0 && (await pendingQualify()) === 1,
    );

    console.log('\n9. Audit và ràng buộc');
    const [{ n: auditRows }] = await sql(
      `SELECT count(*)::int AS n FROM attribution_audit_events WHERE event = 'CLAIM' AND outcome IN ('ALREADY_CLAIMED', 'SELF_REFERRAL', 'REFERRER_EXISTS')`,
    );
    check(
      'lượt claim bị từ chối có audit kèm mã nghiệp vụ',
      auditRows >= 3,
      `rows=${auditRows}`,
    );
    const rejects = async (query: string, params: unknown[]) => {
      try {
        await sql(query, params);
        return '';
      } catch (error) {
        return (error as { code?: string }).code ?? 'ERR';
      }
    };
    // Một lượt mở CHƯA có claim — để lỗi duy nhất có thể là CHECK, không phải FK hay unique.
    const [freeResolution] = await sql(
      `SELECT resolution.id, resolution.click_id FROM attribution_resolutions resolution
       WHERE NOT EXISTS (SELECT 1 FROM attribution_claims claim WHERE claim.click_id = resolution.click_id)
       LIMIT 1`,
    );
    check(
      'claim QUALIFIED thiếu referral_id → 23514',
      (await rejects(
        `INSERT INTO attribution_claims (global_id, click_id, resolution_id, claim_jti, referrer_id, referred_user_id, risk_status)
         VALUES (gen_random_uuid(), $1, $2, gen_random_uuid(), $3, $4, 'QUALIFIED')`,
        [freeResolution.click_id, freeResolution.id, Referrer, OldUser],
      )) === '23514',
    );
    check(
      'claim tự giới thiệu chèn tay → 23514',
      (await rejects(
        `INSERT INTO attribution_claims (global_id, click_id, resolution_id, claim_jti, referrer_id, referred_user_id, risk_status)
         VALUES (gen_random_uuid(), $1, $2, gen_random_uuid(), $3, $3, 'PENDING_REVIEW')`,
        [freeResolution.click_id, freeResolution.id, OldUser],
      )) === '23514',
    );
    check(
      'link có targetType mà thiếu targetValue → 23514',
      (await rejects(
        `INSERT INTO attribution_links (code, referrer_id, target_type) VALUES ('ZZZZZZZZZZ', $1, 'POST')`,
        [Referrer],
      )) === '23514',
    );
  } finally {
    for (const source of opened.reverse())
      if (source.isInitialized) await source.destroy();
    const cleanup = new DataSource({ type: 'postgres', url: adminUri });
    await cleanup.initialize();
    await cleanup.query(`DROP DATABASE IF EXISTS ${ScratchDatabase}`);
    await cleanup.destroy();
  }

  console.log(
    `\n${failures.length === 0 ? 'Deferred attribution: token, resolve, claim, chống gian lận đều đúng' : `${failures.length} phép kiểm thất bại`}`,
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
