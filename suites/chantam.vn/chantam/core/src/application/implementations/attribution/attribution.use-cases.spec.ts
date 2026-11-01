import {
  AttributionAlreadyClaimedException,
  AttributionNotConfiguredException,
  AttributionNotEligibleException,
  AttributionReferrerExistsException,
  AttributionSelfReferralException,
  AttributionTargetNotFoundException,
  AttributionTokenExpiredException,
  AttributionTokenInvalidException,
  AttributionTokenRevokedException,
} from '@/domain/exceptions';
import {
  AttributionPlatforms,
  AttributionRiskStatuses,
  AttributionTargetTypes,
} from '@chantam.vn/chantam.core-lib/consts';
import { ValidationFailedException } from '@chantam/service.common-lib/exception';
import {
  ClaimAttributionUseCase,
  CreateAttributionLinkUseCase,
  extractAttributionToken,
  RecordAttributionClickUseCase,
  ResolveAttributionUseCase,
  RevokeAttributionLinksUseCase,
} from './attribution.use-cases';

const Referrer = '10000000-0000-4000-8000-000000000001';
const Newbie = '20000000-0000-4000-8000-000000000002';
const InstallId = '550E8400-E29B-41D4-A716-446655440000';

const liveLink = {
  id: '7',
  code: 'K7QX2MPA9D',
  referrerId: Referrer,
  targetType: AttributionTargetTypes.POST,
  targetValue: 'ABC123',
  campaign: 'tet',
  source: null,
  medium: null,
  createdAt: new Date('2026-11-01T00:00:00Z'),
  revokedAt: null,
  referrer: {
    username: 'nguoi-moi',
    fullName: 'Người Mời',
    avatarUrl: null,
    referralCode: 'AAAABBBBCCCC',
    active: true,
  },
};

function make(
  options: {
    configured?: boolean;
    verify?: Record<string, unknown>;
    link?: Record<string, unknown> | null;
    click?: Record<string, unknown> | null;
    claim?: Record<string, unknown>;
    targetExists?: boolean;
    webBase?: string;
  } = {},
) {
  const attribution = {
    targetExists: jest.fn(
      async (..._args: unknown[]) => options.targetExists ?? true,
    ),
    findOrCreateLink: jest.fn(async (..._args: unknown[]) => ({
      link: liveLink,
      created: true,
    })),
    findLinkByCode: jest.fn(async (..._args: unknown[]) =>
      options.link === null ? null : { ...liveLink, ...options.link },
    ),
    createClick: jest.fn(async (..._args: unknown[]) => undefined),
    findClickByTokenJti: jest.fn(async (..._args: unknown[]) =>
      options.click === null
        ? null
        : {
            clickId: 'click-1',
            expiresAt: new Date('2026-11-15T00:00:00Z'),
            link: { ...liveLink, ...(options.click ?? {}) },
          },
    ),
    upsertResolution: jest.fn(async (..._args: unknown[]) => ({
      claimJti: 'claim-jti',
      claimExpiresAt: new Date('2026-11-02T00:00:00Z'),
      issuedAt: new Date('2026-11-01T00:00:00Z'),
    })),
    claim: jest.fn(
      async (..._args: unknown[]) =>
        options.claim ?? {
          status: 'CLAIMED',
          riskStatus: AttributionRiskStatuses.QUALIFIED,
          created: true,
        },
    ),
    revokeLinks: jest.fn(async (..._args: unknown[]) => 2),
    recordAudit: jest.fn(async (..._args: unknown[]) => undefined),
  };
  const tokens = {
    isConfigured: jest.fn(() => options.configured ?? true),
    sign: jest.fn(
      (kind: string, claims: { jti: string }) => `${kind}.${claims.jti}.sig`,
    ),
    verify: jest.fn(
      () =>
        options.verify ?? {
          status: 'VALID',
          jti: 'token-jti',
          expiresAt: new Date('2026-11-15T00:00:00Z'),
        },
    ),
  };
  const throttle = {
    assertWithinLimit: jest.fn(async (..._args: unknown[]) => undefined),
    registerHit: jest.fn(async (..._args: unknown[]) => undefined),
  };
  const config = {
    web: { publicBaseUrl: options.webBase ?? 'https://chantam.vn' },
    security: { phoneHashPepper: 'pepper' },
  };
  return { attribution, tokens, throttle, config };
}

describe('CreateAttributionLinkUseCase', () => {
  const build = (deps: ReturnType<typeof make>) =>
    new CreateAttributionLinkUseCase(
      deps.attribution as never,
      deps.throttle as never,
      deps.config as never,
    );

  it('người giới thiệu là người gọi; trả URL /a/{code} và deep link', async () => {
    const deps = make();
    const result = await build(deps).handle({
      userId: Referrer,
      link: {
        targetType: AttributionTargetTypes.POST,
        targetValue: ' ABC123 ',
        campaign: ' tet ',
      },
    });

    expect(deps.attribution.findOrCreateLink).toHaveBeenCalledWith(
      expect.objectContaining({
        referrerId: Referrer,
        targetValue: 'ABC123',
        campaign: 'tet',
        source: null,
      }),
    );
    expect(result.link.url).toBe('https://chantam.vn/a/K7QX2MPA9D');
    expect(result.link.deepLink).toEqual({ type: 'POST', value: 'ABC123' });
  });

  it('chuẩn hoá username thường và mã mời hoa', async () => {
    const deps = make();
    await build(deps).handle({
      userId: Referrer,
      link: {
        targetType: AttributionTargetTypes.PROFILE,
        targetValue: 'Cu-Si-Minh',
      },
    });
    await build(deps).handle({
      userId: Referrer,
      link: {
        targetType: AttributionTargetTypes.GROUP_INVITE,
        targetValue: 'e52bj7gq',
      },
    });

    expect(deps.attribution.targetExists).toHaveBeenNthCalledWith(
      1,
      'PROFILE',
      'cu-si-minh',
    );
    expect(deps.attribution.targetExists).toHaveBeenNthCalledWith(
      2,
      'GROUP_INVITE',
      'E52BJ7GQ',
    );
  });

  it('targetType thiếu targetValue (hoặc ngược lại) → lỗi', async () => {
    const deps = make();
    await expect(
      build(deps).handle({
        userId: Referrer,
        link: { targetType: AttributionTargetTypes.POST },
      }),
    ).rejects.toThrow(ValidationFailedException);
    await expect(
      build(deps).handle({ userId: Referrer, link: { targetValue: 'x' } }),
    ).rejects.toThrow(ValidationFailedException);
  });

  it('đích không tồn tại → 404, không tạo link', async () => {
    const deps = make({ targetExists: false });
    await expect(
      build(deps).handle({
        userId: Referrer,
        link: { targetType: AttributionTargetTypes.POST, targetValue: 'NOPE' },
      }),
    ).rejects.toThrow(AttributionTargetNotFoundException);
    expect(deps.attribution.findOrCreateLink).not.toHaveBeenCalled();
  });

  it('chưa cấu hình web → url null, không bịa domain', async () => {
    const deps = make({ webBase: '' });
    const result = await build(deps).handle({ userId: Referrer, link: {} });
    expect(result.link.url).toBeNull();
  });
});

describe('RecordAttributionClickUseCase', () => {
  const build = (deps: ReturnType<typeof make>) =>
    new RecordAttributionClickUseCase(
      deps.attribution as never,
      deps.tokens as never,
      deps.throttle as never,
      deps.config as never,
    );
  const command = {
    code: 'k7qx2mpa9d',
    clientIp: '1.2.3.4',
    userAgent: 'Safari',
  };

  it('mỗi lượt mở một jti; token ký RESOLVE; IP/UA chỉ lưu dạng băm', async () => {
    const deps = make();
    const result = await build(deps).handle(command);

    expect(deps.attribution.findLinkByCode).toHaveBeenCalledWith('K7QX2MPA9D');
    const click = deps.attribution.createClick.mock
      .calls[0][0] as unknown as Record<string, string>;
    expect(click.ipHash).not.toContain('1.2.3.4');
    expect(click.ipHash).toHaveLength(64);
    expect(click.userAgentHash).toHaveLength(64);
    expect(result.click.token).toBe(`RESOLVE.${click.tokenJti}.sig`);
    expect(result.click.deepLinkUrl).toBe(
      `https://chantam.vn/dl?t=${result.click.token}`,
    );
    expect(result.click.referrer).toEqual({
      username: 'nguoi-moi',
      fullName: 'Người Mời',
      avatarUrl: null,
    });
    expect(JSON.stringify(result)).not.toContain(Referrer);
  });

  it('link bị thu hồi, hoặc người giới thiệu bị khoá → 410', async () => {
    await expect(
      build(make({ link: { revokedAt: new Date() } })).handle(command),
    ).rejects.toThrow(AttributionTokenRevokedException);
    await expect(
      build(
        make({ link: { referrer: { ...liveLink.referrer, active: false } } }),
      ).handle(command),
    ).rejects.toThrow(AttributionTokenRevokedException);
  });

  it('chưa có khoá ký → 503, không ghi gì', async () => {
    const deps = make({ configured: false });
    await expect(build(deps).handle(command)).rejects.toThrow(
      AttributionNotConfiguredException,
    );
    expect(deps.attribution.createClick).not.toHaveBeenCalled();
  });
});

describe('ResolveAttributionUseCase', () => {
  const build = (deps: ReturnType<typeof make>) =>
    new ResolveAttributionUseCase(
      deps.attribution as never,
      deps.tokens as never,
      deps.throttle as never,
      deps.config as never,
    );
  const command = {
    token: 'tok',
    installId: InstallId,
    platform: AttributionPlatforms.IOS,
    clientIp: '1.2.3.4',
  };

  it('khớp: trả claim token ký từ dữ liệu đã lưu, mã giới thiệu, deep link', async () => {
    const deps = make();
    const result = await build(deps).handle(command);

    expect(result).toEqual({
      matched: true,
      attributionToken: 'CLAIM.claim-jti.sig',
      referralCode: 'AAAABBBBCCCC',
      deepLink: { type: 'POST', value: 'ABC123' },
    });
    expect(deps.tokens.sign).toHaveBeenCalledWith('CLAIM', {
      jti: 'claim-jti',
      issuedAt: new Date('2026-11-01T00:00:00Z'),
      expiresAt: new Date('2026-11-02T00:00:00Z'),
    });
  });

  it('installId chỉ đi xuống repository dạng băm, không phân biệt hoa thường', async () => {
    const deps = make();
    await build(deps).handle(command);
    await build(deps).handle({
      ...command,
      installId: InstallId.toLowerCase(),
    });

    const [first, second] = deps.attribution.upsertResolution.mock.calls.map(
      (call) =>
        (call as unknown as [{ installIdHash: string }])[0].installIdHash,
    );
    expect(first).toHaveLength(64);
    expect(first).not.toContain(InstallId.toLowerCase());
    expect(first).toBe(second);
  });

  it('IP khác (đổi Wi-Fi/4G/VPN) không đổi gì: IP không phải khoá resolve', async () => {
    const deps = make();
    await build(deps).handle(command);
    await build(deps).handle({ ...command, clientIp: '9.9.9.9' });

    const calls = deps.attribution.upsertResolution.mock.calls.map(
      (call) =>
        (call as unknown as [{ clickId: string; installIdHash: string }])[0],
    );
    expect(calls[0].clickId).toBe(calls[1].clickId);
    expect(calls[0].installIdHash).toBe(calls[1].installIdHash);
  });

  it('dán nguyên URL …/dl?t=<token> cũng được', async () => {
    const deps = make();
    await build(deps).handle({
      ...command,
      token: 'https://chantam.vn/dl?t=abc.def.ghi',
    });
    expect(deps.tokens.verify).toHaveBeenCalledWith('abc.def.ghi', 'RESOLVE');
  });

  it.each([['NOT_OURS'], ['BAD_SIGNATURE']])(
    '%s → matched:false, không lộ lý do',
    async (status) => {
      const deps = make({ verify: { status } });
      await expect(build(deps).handle(command)).resolves.toEqual({
        matched: false,
        attributionToken: null,
        referralCode: null,
        deepLink: null,
      });
      expect(deps.attribution.upsertResolution).not.toHaveBeenCalled();
      expect(deps.attribution.recordAudit).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'RESOLVE', outcome: status }),
      );
    },
  );

  it.each([
    [
      'WRONG_AUDIENCE',
      { status: 'WRONG_AUDIENCE' },
      AttributionTokenInvalidException,
    ],
    [
      'EXPIRED',
      { status: 'EXPIRED', jti: 'j', expiresAt: new Date() },
      AttributionTokenExpiredException,
    ],
  ])('%s → lỗi nghiệp vụ rõ', async (_label, verify, error) => {
    await expect(build(make({ verify })).handle(command)).rejects.toThrow(
      error,
    );
  });

  it('chữ ký đúng mà không có lượt mở → INVALID', async () => {
    await expect(build(make({ click: null })).handle(command)).rejects.toThrow(
      AttributionTokenInvalidException,
    );
  });

  it('link đã thu hồi → REVOKED', async () => {
    await expect(
      build(make({ click: { revokedAt: new Date() } })).handle(command),
    ).rejects.toThrow(AttributionTokenRevokedException);
  });

  it('rate limit theo IP VÀ theo bản cài, đếm cả lượt hỏng', async () => {
    const deps = make({ verify: { status: 'NOT_OURS' } });
    await build(deps).handle(command);
    expect(
      deps.throttle.registerHit.mock.calls.map(
        (call) => (call as unknown as [{ bucket: string }])[0].bucket,
      ),
    ).toEqual(['attribution-resolve', 'attribution-resolve-install']);
  });
});

describe('ClaimAttributionUseCase', () => {
  const build = (deps: ReturnType<typeof make>) =>
    new ClaimAttributionUseCase(
      deps.attribution as never,
      deps.tokens as never,
      deps.throttle as never,
      deps.config as never,
    );
  const command = {
    userId: Newbie,
    attributionToken: 'claim',
    clientIp: '1.2.3.4',
  };

  it('thành công: claimed true kèm riskStatus; chỉ gọi repository, không đụng thưởng', async () => {
    const deps = make();
    await expect(build(deps).handle(command)).resolves.toEqual({
      claimed: true,
      riskStatus: 'QUALIFIED',
    });
    expect(deps.tokens.verify).toHaveBeenCalledWith('claim', 'CLAIM');
    expect(deps.attribution.claim).toHaveBeenCalledWith(
      expect.objectContaining({
        claimJti: 'token-jti',
        userId: Newbie,
        tokenExpired: false,
        maxAccountAgeDays: 7,
      }),
    );
  });

  it('token hết hạn vẫn đi xuống repository (để người đã claim gọi lại được)', async () => {
    const deps = make({
      verify: { status: 'EXPIRED', jti: 'old', expiresAt: new Date() },
    });
    await build(deps).handle(command);
    expect(deps.attribution.claim).toHaveBeenCalledWith(
      expect.objectContaining({ claimJti: 'old', tokenExpired: true }),
    );
  });

  it.each([['NOT_OURS'], ['BAD_SIGNATURE'], ['WRONG_AUDIENCE']])(
    '%s → INVALID, không chạm repository',
    async (status) => {
      const deps = make({ verify: { status } });
      await expect(build(deps).handle(command)).rejects.toThrow(
        AttributionTokenInvalidException,
      );
      expect(deps.attribution.claim).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['NOT_FOUND', AttributionTokenInvalidException],
    ['EXPIRED', AttributionTokenExpiredException],
    ['REVOKED', AttributionTokenRevokedException],
    ['ALREADY_CLAIMED', AttributionAlreadyClaimedException],
    ['REFERRER_EXISTS', AttributionReferrerExistsException],
    ['SELF_REFERRAL', AttributionSelfReferralException],
    ['NOT_ELIGIBLE', AttributionNotEligibleException],
  ])('repository %s → lỗi tương ứng', async (status, error) => {
    await expect(
      build(make({ claim: { status } })).handle(command),
    ).rejects.toThrow(error);
  });

  it('mọi kết cục đều ghi audit kèm mã', async () => {
    const deps = make({ claim: { status: 'SELF_REFERRAL' } });
    await expect(build(deps).handle(command)).rejects.toThrow();
    expect(deps.attribution.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'CLAIM',
        outcome: 'SELF_REFERRAL',
        userId: Newbie,
      }),
    );
  });
});

describe('RevokeAttributionLinksUseCase', () => {
  const build = (deps: ReturnType<typeof make>) =>
    new RevokeAttributionLinksUseCase(deps.attribution as never);

  it('đúng một tiêu chí', async () => {
    const deps = make();
    await expect(
      build(deps).handle({
        actorId: Referrer,
        revocation: { campaign: 'tet', reason: 'spam' },
      }),
    ).resolves.toEqual({ revokedLinks: 2 });
    await expect(
      build(deps).handle({ actorId: Referrer, revocation: { reason: 'x' } }),
    ).rejects.toThrow(ValidationFailedException);
    await expect(
      build(deps).handle({
        actorId: Referrer,
        revocation: { campaign: 'tet', linkCode: 'ABC', reason: 'x' },
      }),
    ).rejects.toThrow(ValidationFailedException);
  });
});

describe('extractAttributionToken', () => {
  it.each([
    ['token trần', ' a.b.c ', 'a.b.c'],
    ['URL /dl', 'https://chantam.vn/dl?t=a.b.c', 'a.b.c'],
    ['URL không có t', 'https://chantam.vn/p/ABC', ''],
  ])('%s', (_label, raw, expected) => {
    expect(extractAttributionToken(raw)).toBe(expected);
  });
});
