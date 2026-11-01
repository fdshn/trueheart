import {
  IClaimAttributionCommand,
  IClaimAttributionUseCase,
  ICreateAttributionLinkCommand,
  ICreateAttributionLinkUseCase,
  IListAttributionClaimsCommand,
  IListAttributionClaimsUseCase,
  IRecordAttributionClickCommand,
  IRecordAttributionClickUseCase,
  IResolveAttributionCommand,
  IResolveAttributionUseCase,
  IReviewAttributionClaimCommand,
  IReviewAttributionClaimUseCase,
  IRevokeAttributionLinksCommand,
  IRevokeAttributionLinksUseCase,
} from '@/application/contracts/attribution';
import {
  AttributionAlreadyClaimedException,
  AttributionClaimAlreadyReviewedException,
  AttributionClaimNotFoundException,
  AttributionLinkNotFoundException,
  AttributionNotConfiguredException,
  AttributionNotEligibleException,
  AttributionReferrerExistsException,
  AttributionSelfReferralException,
  AttributionTargetNotFoundException,
  AttributionTokenExpiredException,
  AttributionTokenInvalidException,
  AttributionTokenRevokedException,
} from '@/domain/exceptions';
import { IConfig } from '@/domain/ports/config';
import {
  IAttributionLink,
  IAttributionLinkWithReferrer,
  IAttributionRepository,
} from '@/domain/ports/repository';
import {
  IAttributionTokenService,
  IRequestThrottle,
} from '@/domain/ports/security';
import { hashSignupFingerprint } from '@/infrastructure/security/signup-fingerprint';
import {
  AttributionClaimMaxAccountAgeDays,
  AttributionClaimTokenTtlSeconds,
  AttributionInstallReuseWindowDays,
  AttributionResolveTokenTtlSeconds,
  AttributionTargetTypes,
} from '@chantam.vn/chantam.core-lib/consts';
import {
  IAttributionDeepLinkDto,
  IAttributionLinkDto,
  IClaimAttributionResponseDto,
  ICreateAttributionLinkResponseDto,
  IListAttributionClaimsResponseDto,
  IRecordAttributionClickResponseDto,
  IResolveAttributionResponseDto,
  IReviewAttributionClaimResponseDto,
  IRevokeAttributionLinksResponseDto,
} from '@chantam.vn/chantam.core-lib/dto';
import { PaginationMetaDto, toSkipTake } from '@chantam/service.common-lib/dto';
import { ValidationFailedException } from '@chantam/service.common-lib/exception';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

/**
 * Trần gọi cho từng bước. Mọi lượt gọi đều đếm (không chỉ lượt thành công): thứ cần chặn là
 * dò token và đổ tài khoản, mà cả hai đều là chuỗi lượt THẤT BẠI.
 */
export const AttributionRateLimits = {
  link: { bucket: 'attribution-link', limit: 60, windowSeconds: 3_600 },
  click: { bucket: 'attribution-click', limit: 60, windowSeconds: 600 },
  resolveIp: { bucket: 'attribution-resolve', limit: 30, windowSeconds: 600 },
  resolveInstall: {
    bucket: 'attribution-resolve-install',
    limit: 20,
    windowSeconds: 600,
  },
  claimUser: { bucket: 'attribution-claim', limit: 10, windowSeconds: 600 },
  claimIp: { bucket: 'attribution-claim-ip', limit: 30, windowSeconds: 600 },
} as const;

async function guardRate(
  throttle: IRequestThrottle,
  rule: { bucket: string; limit: number; windowSeconds: number },
  key: string,
): Promise<void> {
  await throttle.assertWithinLimit({
    bucket: rule.bucket,
    key,
    limit: rule.limit,
  });
  await throttle.registerHit({
    bucket: rule.bucket,
    key,
    windowSeconds: rule.windowSeconds,
  });
}

function trimmedOrNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/** Chuẩn hoá theo đúng cách các API đích tra cứu: username thường, mã mời hoa. */
function normalizeTargetValue(
  type: AttributionTargetTypes,
  value: string,
): string {
  const trimmed = value.trim();
  if (type === AttributionTargetTypes.GROUP_INVITE)
    return trimmed.toUpperCase();
  if (
    type === AttributionTargetTypes.PROFILE ||
    type === AttributionTargetTypes.USER
  )
    return trimmed.toLowerCase();
  return trimmed;
}

function deepLinkOf(link: IAttributionLink): IAttributionDeepLinkDto | null {
  return link.targetType && link.targetValue
    ? { type: link.targetType, value: link.targetValue }
    : null;
}

/**
 * Lấy token từ thứ app dán vào: token trần, hoặc nguyên URL `…/dl?t=<token>` — người dùng
 * thường dán cả link chứ không tách được tham số.
 */
export function extractAttributionToken(raw: string): string {
  const trimmed = raw.trim();
  if (!/^https?:\/\//i.test(trimmed)) return trimmed;
  try {
    return new URL(trimmed).searchParams.get('t')?.trim() ?? '';
  } catch {
    return '';
  }
}

function webUrl(config: IConfig, path: string): string | null {
  const base = config.web.publicBaseUrl;
  return base ? `${base}${path}` : null;
}

function assertConfigured(tokens: IAttributionTokenService): void {
  if (!tokens.isConfigured()) throw new AttributionNotConfiguredException();
}

/** Link mở được không: chưa bị thu hồi và người giới thiệu còn hoạt động. */
function isLive(link: IAttributionLinkWithReferrer): boolean {
  return link.revokedAt === null && link.referrer.active;
}

/**
 * Người giới thiệu tạo link chia sẻ. Người giới thiệu lấy từ PHIÊN ĐĂNG NHẬP — client không
 * gửi được `referrerUserId` nào.
 */
@Injectable()
export class CreateAttributionLinkUseCase implements ICreateAttributionLinkUseCase {
  public constructor(
    @Inject(IAttributionRepository)
    private readonly attribution: IAttributionRepository,
    @Inject(IRequestThrottle) private readonly throttle: IRequestThrottle,
    @Inject(IConfig) private readonly config: IConfig,
  ) {}

  public async handle(
    command: ICreateAttributionLinkCommand,
  ): Promise<ICreateAttributionLinkResponseDto> {
    const targetType = command.link.targetType ?? null;
    const rawValue = trimmedOrNull(command.link.targetValue);
    if ((targetType === null) !== (rawValue === null))
      throw new ValidationFailedException([
        'link: targetType và targetValue phải cùng có hoặc cùng bỏ trống',
      ]);
    const targetValue =
      targetType && rawValue
        ? normalizeTargetValue(targetType, rawValue)
        : null;

    await guardRate(this.throttle, AttributionRateLimits.link, command.userId);

    if (
      targetType &&
      targetValue &&
      !(await this.attribution.targetExists(targetType, targetValue))
    )
      throw new AttributionTargetNotFoundException();

    const { link, created } = await this.attribution.findOrCreateLink({
      referrerId: command.userId,
      targetType,
      targetValue,
      campaign: trimmedOrNull(command.link.campaign),
      source: trimmedOrNull(command.link.source),
      medium: trimmedOrNull(command.link.medium),
    });
    if (created)
      await this.attribution.recordAudit({
        event: 'LINK',
        outcome: 'CREATED',
        userId: command.userId,
      });

    const dto: IAttributionLinkDto = {
      code: link.code,
      url: webUrl(this.config, `/a/${link.code}`),
      deepLink: deepLinkOf(link),
      campaign: link.campaign,
      source: link.source,
      medium: link.medium,
      createdAt: link.createdAt,
    };
    return { link: dto, created };
  }
}

/**
 * Landing ghi một lượt mở link và nhận token có chữ ký cho lượt đó.
 *
 * Mỗi lượt mở một token riêng: một link gửi vào nhóm có nhiều người mở, và "một token chỉ
 * claim cho một tài khoản" phải là một token cho MỖI người mở.
 */
@Injectable()
export class RecordAttributionClickUseCase implements IRecordAttributionClickUseCase {
  public constructor(
    @Inject(IAttributionRepository)
    private readonly attribution: IAttributionRepository,
    @Inject(IAttributionTokenService)
    private readonly tokens: IAttributionTokenService,
    @Inject(IRequestThrottle) private readonly throttle: IRequestThrottle,
    @Inject(IConfig) private readonly config: IConfig,
  ) {}

  public async handle(
    command: IRecordAttributionClickCommand,
  ): Promise<IRecordAttributionClickResponseDto> {
    assertConfigured(this.tokens);
    await guardRate(
      this.throttle,
      AttributionRateLimits.click,
      command.clientIp,
    );

    const link = await this.attribution.findLinkByCode(
      command.code.trim().toUpperCase(),
    );
    if (!link) throw new AttributionLinkNotFoundException();
    if (!isLive(link)) throw new AttributionTokenRevokedException();

    const pepper = this.config.security.phoneHashPepper;
    const clickId = randomUUID();
    const tokenJti = randomUUID();
    const issuedAt = new Date();
    const expiresAt = new Date(
      issuedAt.getTime() + AttributionResolveTokenTtlSeconds * 1000,
    );
    const ipHash = hashSignupFingerprint('IP', command.clientIp, pepper);
    await this.attribution.createClick({
      clickId,
      linkId: link.id,
      tokenJti,
      issuedAt,
      expiresAt,
      ipHash,
      userAgentHash: hashSignupFingerprint(
        'USER_AGENT',
        command.userAgent,
        pepper,
      ),
    });
    await this.attribution.recordAudit({
      event: 'CLICK',
      outcome: 'ISSUED',
      clickId,
      ipHash,
    });

    const token = this.tokens.sign('RESOLVE', {
      jti: tokenJti,
      issuedAt,
      expiresAt,
    });
    return {
      click: {
        token,
        expiresAt,
        deepLinkUrl: webUrl(this.config, `/dl?t=${token}`),
        referrer: {
          username: link.referrer.username,
          fullName: link.referrer.fullName,
          avatarUrl: link.referrer.avatarUrl,
        },
        deepLink: deepLinkOf(link),
      },
    };
  }
}

const Unmatched: IResolveAttributionResponseDto = {
  matched: false,
  attributionToken: null,
  referralCode: null,
  deepLink: null,
};

/**
 * App mới cài dán token: trả người giới thiệu, deep link và một claim token dùng một lần.
 *
 * - Chuỗi không phải token của hệ thống, hay chữ ký sai, trả `matched: false` — người dùng
 *   dán nhầm thì app chỉ cần bỏ qua; kẻ giả mạo không được biết vì sao hỏng.
 * - Token thật nhưng hết hạn / bị thu hồi / sai loại thì báo lỗi rõ để app nói đúng lý do.
 * - Cùng (lượt mở, bản cài) gọi lại ra đúng claim token cũ.
 */
@Injectable()
export class ResolveAttributionUseCase implements IResolveAttributionUseCase {
  private readonly logger = new Logger(ResolveAttributionUseCase.name);

  public constructor(
    @Inject(IAttributionRepository)
    private readonly attribution: IAttributionRepository,
    @Inject(IAttributionTokenService)
    private readonly tokens: IAttributionTokenService,
    @Inject(IRequestThrottle) private readonly throttle: IRequestThrottle,
    @Inject(IConfig) private readonly config: IConfig,
  ) {}

  public async handle(
    command: IResolveAttributionCommand,
  ): Promise<IResolveAttributionResponseDto> {
    assertConfigured(this.tokens);
    const pepper = this.config.security.phoneHashPepper;
    const installIdHash =
      hashSignupFingerprint(
        'INSTALL',
        command.installId.toLowerCase(),
        pepper,
      ) ?? '';
    const ipHash = hashSignupFingerprint('IP', command.clientIp, pepper);
    await guardRate(
      this.throttle,
      AttributionRateLimits.resolveIp,
      command.clientIp,
    );
    await guardRate(
      this.throttle,
      AttributionRateLimits.resolveInstall,
      installIdHash,
    );

    const audit = (outcome: string, clickId: string | null = null) =>
      this.attribution.recordAudit({
        event: 'RESOLVE',
        outcome,
        clickId,
        installIdHash,
        ipHash,
      });

    const verification = this.tokens.verify(
      extractAttributionToken(command.token),
      'RESOLVE',
    );
    switch (verification.status) {
      case 'NOT_OURS':
        await audit('NOT_OURS');
        return Unmatched;
      case 'BAD_SIGNATURE':
        this.logger.warn('Token attribution sai chữ ký ở bước resolve');
        await audit('BAD_SIGNATURE');
        return Unmatched;
      case 'WRONG_AUDIENCE':
        await audit('WRONG_AUDIENCE');
        throw new AttributionTokenInvalidException();
      case 'EXPIRED':
        await audit('EXPIRED');
        throw new AttributionTokenExpiredException();
    }

    const context = await this.attribution.findClickByTokenJti(
      verification.jti,
    );
    // Chữ ký đúng mà không có lượt mở nào: database đã bị dựng lại, hoặc khoá ký bị lộ.
    if (!context) {
      this.logger.warn(
        `Token attribution hợp lệ nhưng không có lượt mở: ${verification.jti}`,
      );
      await audit('UNKNOWN_JTI');
      throw new AttributionTokenInvalidException();
    }
    if (!isLive(context.link)) {
      await audit('REVOKED', context.clickId);
      throw new AttributionTokenRevokedException();
    }

    const now = new Date();
    const resolution = await this.attribution.upsertResolution({
      clickId: context.clickId,
      installIdHash,
      platform: command.platform,
      ipHash,
      newClaimJti: randomUUID(),
      newClaimExpiresAt: new Date(
        now.getTime() + AttributionClaimTokenTtlSeconds * 1000,
      ),
    });
    await audit('MATCHED', context.clickId);

    return {
      matched: true,
      // Ký lại từ đúng (jti, iat, exp) đã lưu: Ed25519 tiền định nên ra đúng chuỗi cũ.
      attributionToken: this.tokens.sign('CLAIM', {
        jti: resolution.claimJti,
        issuedAt: resolution.issuedAt,
        expiresAt: resolution.claimExpiresAt,
      }),
      referralCode: context.link.referrer.referralCode,
      deepLink: deepLinkOf(context.link),
    };
  }
}

/**
 * Gắn người giới thiệu cho tài khoản vừa đăng ký. KHÔNG phát thưởng: chỉ ghi `referrals`,
 * và đường thưởng giới thiệu sẵn có chỉ trả khi người được mời hoàn tất onboarding.
 */
@Injectable()
export class ClaimAttributionUseCase implements IClaimAttributionUseCase {
  public constructor(
    @Inject(IAttributionRepository)
    private readonly attribution: IAttributionRepository,
    @Inject(IAttributionTokenService)
    private readonly tokens: IAttributionTokenService,
    @Inject(IRequestThrottle) private readonly throttle: IRequestThrottle,
    @Inject(IConfig) private readonly config: IConfig,
  ) {}

  public async handle(
    command: IClaimAttributionCommand,
  ): Promise<IClaimAttributionResponseDto> {
    assertConfigured(this.tokens);
    await guardRate(
      this.throttle,
      AttributionRateLimits.claimUser,
      command.userId,
    );
    await guardRate(
      this.throttle,
      AttributionRateLimits.claimIp,
      command.clientIp,
    );
    const ipHash = hashSignupFingerprint(
      'IP',
      command.clientIp,
      this.config.security.phoneHashPepper,
    );
    const audit = (outcome: string) =>
      this.attribution.recordAudit({
        event: 'CLAIM',
        outcome,
        userId: command.userId,
        ipHash,
      });

    const verification = this.tokens.verify(
      extractAttributionToken(command.attributionToken),
      'CLAIM',
    );
    if (verification.status !== 'VALID' && verification.status !== 'EXPIRED') {
      await audit(verification.status);
      throw new AttributionTokenInvalidException();
    }

    const outcome = await this.attribution.claim({
      claimJti: verification.jti,
      userId: command.userId,
      tokenExpired: verification.status === 'EXPIRED',
      ipHash,
      maxAccountAgeDays: AttributionClaimMaxAccountAgeDays,
      installReuseWindowDays: AttributionInstallReuseWindowDays,
    });
    await audit(
      outcome.status === 'CLAIMED'
        ? outcome.created
          ? `CLAIMED_${outcome.riskStatus}`
          : 'CLAIMED_RETRY'
        : outcome.status,
    );

    switch (outcome.status) {
      case 'CLAIMED':
        return { claimed: true, riskStatus: outcome.riskStatus };
      case 'NOT_FOUND':
        throw new AttributionTokenInvalidException();
      case 'EXPIRED':
        throw new AttributionTokenExpiredException();
      case 'REVOKED':
        throw new AttributionTokenRevokedException();
      case 'ALREADY_CLAIMED':
        throw new AttributionAlreadyClaimedException();
      case 'REFERRER_EXISTS':
        throw new AttributionReferrerExistsException();
      case 'SELF_REFERRAL':
        throw new AttributionSelfReferralException();
      case 'NOT_ELIGIBLE':
        throw new AttributionNotEligibleException();
    }
  }
}

@Injectable()
export class ListAttributionClaimsUseCase implements IListAttributionClaimsUseCase {
  public constructor(
    @Inject(IAttributionRepository)
    private readonly attribution: IAttributionRepository,
  ) {}

  public async handle(
    command: IListAttributionClaimsCommand,
  ): Promise<IListAttributionClaimsResponseDto> {
    const { skip, take } = toSkipTake(command);
    const { items, total } = await this.attribution.listClaims({
      riskStatus: command.riskStatus,
      skip,
      take,
    });
    return {
      claims: items,
      meta: new PaginationMetaDto(Math.floor(skip / take) + 1, take, total),
    };
  }
}

@Injectable()
export class ReviewAttributionClaimUseCase implements IReviewAttributionClaimUseCase {
  public constructor(
    @Inject(IAttributionRepository)
    private readonly attribution: IAttributionRepository,
  ) {}

  public async handle(
    command: IReviewAttributionClaimCommand,
  ): Promise<IReviewAttributionClaimResponseDto> {
    const outcome = await this.attribution.reviewClaim({
      claimId: command.claimId,
      reviewerId: command.reviewerId,
      decision: command.decision,
      note: command.note.trim(),
    });
    await this.attribution.recordAudit({
      event: 'REVIEW',
      outcome: `${command.decision}_${outcome.status}`,
      userId: command.reviewerId,
    });
    switch (outcome.status) {
      case 'REVIEWED':
        return { claim: outcome.claim };
      case 'NOT_FOUND':
        throw new AttributionClaimNotFoundException();
      case 'ALREADY_REVIEWED':
        throw new AttributionClaimAlreadyReviewedException();
      case 'REFERRER_EXISTS':
        throw new AttributionReferrerExistsException();
    }
  }
}

/** Thu hồi theo đúng một tiêu chí. Link đã thu hồi thì resolve/claim mới trả REVOKED. */
@Injectable()
export class RevokeAttributionLinksUseCase implements IRevokeAttributionLinksUseCase {
  public constructor(
    @Inject(IAttributionRepository)
    private readonly attribution: IAttributionRepository,
  ) {}

  public async handle(
    command: IRevokeAttributionLinksCommand,
  ): Promise<IRevokeAttributionLinksResponseDto> {
    const linkCode = trimmedOrNull(command.revocation.linkCode)?.toUpperCase();
    const campaign = trimmedOrNull(command.revocation.campaign) ?? undefined;
    const referrerId =
      trimmedOrNull(command.revocation.referrerUserId) ?? undefined;
    if ([linkCode, campaign, referrerId].filter(Boolean).length !== 1)
      throw new ValidationFailedException([
        'revocation: cần đúng một trong linkCode, campaign hoặc referrerUserId',
      ]);

    const revokedLinks = await this.attribution.revokeLinks({
      actorId: command.actorId,
      linkCode: linkCode ?? undefined,
      campaign,
      referrerId,
      reason: command.revocation.reason.trim(),
    });
    await this.attribution.recordAudit({
      event: 'REVOKE',
      outcome: `REVOKED_${revokedLinks}`,
      userId: command.actorId,
    });
    return { revokedLinks };
  }
}
