import {
  ICharityManagedMoneyPledge,
  ICharityMoneyPledgePageResult,
  ICharityMoneyPledgeTransfer,
  ICharityMyMoneyPledge,
  ICharityPublicMoneyPledge,
  ICompleteCharityMoneyPledgeCommand,
  ICompleteCharityMoneyPledgeUseCase,
  IDeclareCharityMoneyPledgeCommand,
  IDeclareCharityMoneyPledgeResult,
  IDeclareCharityMoneyPledgeUseCase,
  IListCharityMoneyPledgesCommand,
  IListCharityMoneyPledgesUseCase,
  IListMyCharityMoneyPledgesCommand,
  IListMyCharityMoneyPledgesUseCase,
  IManageCharityMoneyPledgesCommand,
  IManageCharityMoneyPledgesUseCase,
  ISetCharityMoneyPledgeHiddenCommand,
  ISetCharityMoneyPledgeHiddenUseCase,
} from '@/application/contracts/charity-project';
import { IDispatchNotificationUseCase } from '@/application/contracts/notification';
import { assertContributionTypeAccepted } from '@/domain/charity-contribution-type';
import {
  CharityCampaignNotFoundException,
  CharityFundingNeedNotFoundException,
  CharityIntakeClosedException,
  CharityMoneyPledgeAlreadyCompletedException,
  CharityMoneyPledgeAlreadyHiddenException,
  CharityMoneyPledgeLockedException,
  CharityMoneyPledgeNotFoundException,
  CharityMoneyPledgeNotHiddenException,
  CharityMoneyPledgeSelfException,
  CharityNotAcceptingContributionsException,
  CharityReceivingAccountRequiredException,
  TooManyRequestsException,
} from '@/domain/exceptions';
import {
  CharityMoneyPledgeLockedOutcome,
  ICharityBankAccount,
  ICharityCampaignRepository,
  ICharityMoneyPledge,
  ICharityMoneyPledgeAccount,
  ICharityMoneyPledgeCursor,
  ICharityMoneyPledgeRepository,
  ICharityMoneyPledgeRow,
  ICharityProjectRepository,
} from '@/domain/ports/repository';
import { IRequestThrottle } from '@/domain/ports/security';
import {
  NotificationTargetTypes,
  NotificationTypes,
} from '@chantam.vn/chantam.core-lib/consts';
import {
  CharityMoneyPledgeCodeAlphabet,
  CharityMoneyPledgeCodeLength,
  MaxCharityMoneyPledgeHiddenReasonLength,
  MaxCharityMoneyPledgeNoteLength,
  buildVietQrUrl,
  charityMoneyPledgeTransferContent,
  decodeKeysetCursor,
  encodeKeysetCursor,
  isCharityMoneyPledgeAmount,
  isIntakeClosed,
  isPubliclyVisibleProject,
} from '@chantam.vn/chantam.core-lib/models';
import { ValidationFailedException } from '@chantam/service.common-lib/exception';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomInt } from 'node:crypto';
import { toPublicUserProfile } from '../shared/public-author';
import { CharityProjectAccess } from './charity-project.use-cases';

/**
 * Trần khai: 10 lời khai / giờ / người — đủ cho người ủng hộ nhiều khoản, chặn spam lời khai
 * (lời khai hiện công khai). Chỉ đếm lượt THÀNH CÔNG: thứ cần giới hạn là số dòng sinh ra.
 */
export const CharityMoneyPledgeRateLimit = {
  bucket: 'charity-money-pledge',
  limit: 10,
  windowSeconds: 3_600,
} as const;

/** Số lần sinh lại mã chuyển khoản khi trùng — mỗi lần sau dài thêm để chắc chắn thoát. */
const TransferCodeAttempts = 5;

function trimmed(value: string | null | undefined): string | null {
  const text = value?.trim();
  return text ? text : null;
}

function transferCode(length: number): string {
  let code = '';
  for (let index = 0; index < length; index += 1)
    code +=
      CharityMoneyPledgeCodeAlphabet[
        randomInt(CharityMoneyPledgeCodeAlphabet.length)
      ];
  return code;
}

function toTransfer(
  account: Pick<
    ICharityMoneyPledgeAccount,
    'bankName' | 'bankBin' | 'accountNo' | 'accountName'
  >,
  pledge: Pick<ICharityMoneyPledge, 'pledgedAmount' | 'transferContent'>,
): ICharityMoneyPledgeTransfer {
  return {
    bankName: account.bankName,
    bankBin: account.bankBin,
    accountNo: account.accountNo,
    accountName: account.accountName,
    amount: pledge.pledgedAmount,
    transferContent: pledge.transferContent,
    vietQrUrl: account.bankBin
      ? buildVietQrUrl({
          bankBin: account.bankBin,
          accountNumber: account.accountNo,
          accountName: account.accountName,
          amount: pledge.pledgedAmount,
          note: pledge.transferContent,
        })
      : null,
  };
}

function toMine(row: ICharityMoneyPledgeRow): ICharityMyMoneyPledge {
  return {
    pledgeId: row.pledgeId,
    campaign: {
      campaignId: row.campaign.globalId,
      title: row.campaign.title,
      slug: row.campaign.slug,
    },
    fundingNeedId: row.fundingNeedId,
    pledgedAmount: row.pledgedAmount,
    status: row.status,
    showNamePublicly: row.showNamePublicly,
    note: row.note,
    declaredAt: row.declaredAt,
    completedAt: row.completedAt,
    hiddenAt: row.hiddenAt,
    hiddenReason: row.hiddenReason,
    transfer: row.account ? toTransfer(row.account, row) : null,
  };
}

function toPublic(row: ICharityMoneyPledgeRow): ICharityPublicMoneyPledge {
  return {
    pledgeId: row.pledgeId,
    fundingNeedId: row.fundingNeedId,
    user:
      row.showNamePublicly && row.user ? toPublicUserProfile(row.user) : null,
    pledgedAmount: row.pledgedAmount,
    status: row.status,
    declaredAt: row.declaredAt,
    completedAt: row.completedAt,
  };
}

function toManaged(row: ICharityMoneyPledgeRow): ICharityManagedMoneyPledge {
  return {
    ...toPublic(row),
    user: row.user ? toPublicUserProfile(row.user) : null,
    showNamePublicly: row.showNamePublicly,
    note: row.note,
    transferContent: row.transferContent,
    bankAccount: row.account
      ? {
          accountId: row.account.accountId,
          bankName: row.account.bankName,
          accountNo: row.account.accountNo,
          accountName: row.account.accountName,
          validTo: row.account.validTo,
        }
      : null,
    hiddenAt: row.hiddenAt,
    hiddenReason: row.hiddenReason,
  };
}

function decodeCursor(cursor: string | null): ICharityMoneyPledgeCursor | null {
  if (!cursor) return null;
  const decoded = decodeKeysetCursor(cursor);
  if (!decoded) throw new ValidationFailedException(['cursor: không hợp lệ']);
  return { declaredAt: decoded.createdAt, id: decoded.id };
}

function clampLimit(limit: number): number {
  return Math.min(Math.max(Number.isInteger(limit) ? limit : 20, 1), 50);
}

function page<T>(
  rows: (ICharityMoneyPledgeRow & { cursorId: number })[],
  limit: number,
  map: (row: ICharityMoneyPledgeRow) => T,
): ICharityMoneyPledgePageResult<T> {
  const visible = rows.slice(0, limit);
  const last = visible[visible.length - 1];
  return {
    pledges: visible.map(map),
    nextCursor:
      rows.length > limit && last
        ? encodeKeysetCursor({ createdAt: last.declaredAt, id: last.cursorId })
        : null,
  };
}

/** Ưu tiên tài khoản của khoản tiền (nếu còn hiệu lực), không thì tài khoản sống mới nhất. */
function receivingAccount(
  accounts: ICharityBankAccount[],
  preferredId: string | null,
): ICharityBankAccount | null {
  const live = accounts.filter((account) => account.validTo === null);
  return (
    live.find((account) => account.accountId === preferredId) ?? live[0] ?? null
  );
}

function throwOnMiss(
  outcome: CharityMoneyPledgeLockedOutcome,
  conflict: () => Error,
): ICharityMoneyPledge {
  if (outcome.status === 'UPDATED') return outcome.pledge;
  if (outcome.status === 'NOT_FOUND')
    throw new CharityMoneyPledgeNotFoundException();
  if (outcome.status === 'LOCKED')
    throw new CharityMoneyPledgeLockedException();
  throw conflict();
}

/**
 * Khai đăng ký ủng hộ tiền. Trả kèm thông tin chuyển khoản; app không giữ tiền — người ủng hộ
 * chuyển thẳng vào tài khoản nhận của chiến dịch.
 */
@Injectable()
export class DeclareCharityMoneyPledgeUseCase implements IDeclareCharityMoneyPledgeUseCase {
  public constructor(
    @Inject(ICharityCampaignRepository)
    private readonly campaigns: ICharityCampaignRepository,
    @Inject(ICharityProjectRepository)
    private readonly projects: ICharityProjectRepository,
    @Inject(ICharityMoneyPledgeRepository)
    private readonly pledges: ICharityMoneyPledgeRepository,
    @Inject(IRequestThrottle)
    private readonly throttle: IRequestThrottle,
  ) {}

  public async handle(
    command: IDeclareCharityMoneyPledgeCommand,
  ): Promise<IDeclareCharityMoneyPledgeResult> {
    const input = command.pledge;
    const note = trimmed(input.note);
    const errors: string[] = [];
    if (!isCharityMoneyPledgeAmount(input.pledgedAmount))
      errors.push(
        'pledge.pledgedAmount: số nguyên VNĐ từ 1.000 đến 10.000.000.000',
      );
    if (note && note.length > MaxCharityMoneyPledgeNoteLength)
      errors.push(
        `pledge.note: tối đa ${MaxCharityMoneyPledgeNoteLength} ký tự`,
      );
    if (errors.length > 0) throw new ValidationFailedException(errors);

    const now = new Date();
    const campaign = await this.campaigns.findByGlobalId(command.campaignId);
    if (!campaign || !isPubliclyVisibleProject(campaign, now))
      throw new CharityCampaignNotFoundException();
    if (
      !campaign.isActive ||
      campaign.endTime <= now ||
      campaign.operationStage === 'SUMMARY' ||
      campaign.summaryPublishedAt !== null
    )
      throw new CharityNotAcceptingContributionsException();
    assertContributionTypeAccepted(campaign, 'MONEY');
    if (isIntakeClosed(campaign, now)) throw new CharityIntakeClosedException();
    if (
      campaign.createdBy === command.userId ||
      (await this.campaigns.isCampaignManager(
        campaign.globalId,
        command.userId,
      ))
    )
      throw new CharityMoneyPledgeSelfException();

    const fundingNeedId = input.fundingNeedId ?? null;
    let preferredAccountId: string | null = null;
    if (fundingNeedId) {
      const need = (
        await this.projects.listFundingNeeds(campaign.globalId)
      ).find((row) => row.fundingNeedId === fundingNeedId);
      if (!need) throw new CharityFundingNeedNotFoundException();
      if (need.status !== 'OPEN')
        throw new ValidationFailedException([
          'pledge.fundingNeedId: khoản tiền này đã đóng',
        ]);
      preferredAccountId = need.bankAccountId;
    }
    const account = receivingAccount(
      await this.projects.listBankAccounts(campaign.globalId),
      preferredAccountId,
    );
    if (!account) throw new CharityReceivingAccountRequiredException();

    await this.throttle.assertWithinLimit({
      bucket: CharityMoneyPledgeRateLimit.bucket,
      key: command.userId,
      limit: CharityMoneyPledgeRateLimit.limit,
    });

    let created: ICharityMoneyPledge | null = null;
    for (
      let attempt = 0;
      attempt < TransferCodeAttempts && !created;
      attempt += 1
    )
      created = await this.pledges.create({
        campaignId: campaign.globalId,
        fundingNeedId,
        userId: command.userId,
        pledgedAmount: input.pledgedAmount,
        showNamePublicly: input.showNamePublicly ?? null,
        note,
        bankAccountId: account.accountId,
        transferContent: charityMoneyPledgeTransferContent(
          transferCode(CharityMoneyPledgeCodeLength + attempt),
        ),
      });
    // 31^6 mã cho lượt đầu, dài thêm mỗi lượt sau — trùng cả năm lượt là chuyện không xảy ra
    // trong thực tế; nếu có thì bảo người dùng thử lại thay vì 500.
    if (!created) throw new TooManyRequestsException(60);

    await this.throttle.registerHit({
      bucket: CharityMoneyPledgeRateLimit.bucket,
      key: command.userId,
      windowSeconds: CharityMoneyPledgeRateLimit.windowSeconds,
    });
    const transfer = toTransfer(account, created);
    return {
      pledge: {
        ...toMine({
          ...created,
          user: null,
          account: null,
          campaign: {
            globalId: campaign.globalId,
            title: campaign.title,
            slug: campaign.slug,
          },
        }),
        transfer,
      },
      transfer,
    };
  }
}

/** Người ủng hộ báo đã chuyển: `INTENDED → COMPLETED`. Vẫn chỉ là LỜI KHAI. */
@Injectable()
export class CompleteCharityMoneyPledgeUseCase implements ICompleteCharityMoneyPledgeUseCase {
  public constructor(
    @Inject(ICharityMoneyPledgeRepository)
    private readonly pledges: ICharityMoneyPledgeRepository,
  ) {}

  public async handle(
    command: ICompleteCharityMoneyPledgeCommand,
  ): Promise<ICharityMyMoneyPledge> {
    const outcome = await this.pledges.markCompleted({
      pledgeId: command.pledgeId,
      userId: command.userId,
    });
    throwOnMiss(
      outcome,
      () => new CharityMoneyPledgeAlreadyCompletedException(),
    );
    const row = await this.pledges.findRow(command.pledgeId);
    if (!row) throw new CharityMoneyPledgeNotFoundException();
    return toMine(row);
  }
}

@Injectable()
export class ListMyCharityMoneyPledgesUseCase implements IListMyCharityMoneyPledgesUseCase {
  public constructor(
    @Inject(ICharityMoneyPledgeRepository)
    private readonly pledges: ICharityMoneyPledgeRepository,
  ) {}

  public async handle(command: IListMyCharityMoneyPledgesCommand) {
    const limit = clampLimit(command.limit);
    const { rows } = await this.pledges.listMine({
      userId: command.userId,
      campaignId: command.campaignId,
      cursor: decodeCursor(command.cursor),
      limit: limit + 1,
    });
    return page(rows, limit, toMine);
  }
}

/** Danh sách người đăng ký ủng hộ — CÔNG KHAI, không cần đăng nhập. Lời khai bị ẩn không hiện. */
@Injectable()
export class ListCharityMoneyPledgesUseCase implements IListCharityMoneyPledgesUseCase {
  public constructor(
    @Inject(ICharityProjectRepository)
    private readonly projects: ICharityProjectRepository,
    @Inject(ICharityMoneyPledgeRepository)
    private readonly pledges: ICharityMoneyPledgeRepository,
  ) {}

  public async handle(command: IListCharityMoneyPledgesCommand) {
    const cursor = decodeCursor(command.cursor);
    const campaignId = await this.projects.findVisibleCampaignId(
      command.idOrSlug,
    );
    if (!campaignId) throw new CharityCampaignNotFoundException();
    const limit = clampLimit(command.limit);
    const { rows } = await this.pledges.listForCampaign({
      campaignId,
      fundingNeedId: command.fundingNeedId,
      status: command.status,
      includeHidden: false,
      cursor,
      limit: limit + 1,
    });
    return page(rows, limit, toPublic);
  }
}

/** Bản cho ban tổ chức: có ghi chú, nội dung chuyển khoản, tài khoản lúc khai và lời khai bị ẩn. */
@Injectable()
export class ManageCharityMoneyPledgesUseCase implements IManageCharityMoneyPledgesUseCase {
  public constructor(
    private readonly access: CharityProjectAccess,
    @Inject(ICharityMoneyPledgeRepository)
    private readonly pledges: ICharityMoneyPledgeRepository,
  ) {}

  public async handle(command: IManageCharityMoneyPledgesCommand) {
    const cursor = decodeCursor(command.cursor);
    // Đọc: chủ dự án, điều phối viên, Admin đọc — resolve() đã trả 404 cho người lạ.
    const { campaign } = await this.access.resolve(
      command.campaignId,
      command.userId,
    );
    const limit = clampLimit(command.limit);
    const { rows } = await this.pledges.listForCampaign({
      campaignId: campaign.globalId,
      fundingNeedId: command.fundingNeedId,
      status: command.status,
      includeHidden: true,
      cursor,
      limit: limit + 1,
    });
    return page(rows, limit, toManaged);
  }
}

/** Báo người khai khi lời khai bị ẩn / bỏ ẩn. Lỗi gửi không chặn. */
@Injectable()
export class CharityMoneyPledgeNotifier {
  private readonly logger = new Logger(CharityMoneyPledgeNotifier.name);

  public constructor(
    @Inject(IDispatchNotificationUseCase)
    private readonly dispatch: IDispatchNotificationUseCase,
  ) {}

  public async notify(
    pledge: ICharityMoneyPledge,
    campaignTitle: string,
    at: Date,
  ): Promise<void> {
    const hidden = pledge.hiddenAt !== null;
    const amount = `${pledge.pledgedAmount.toLocaleString('vi-VN')}đ`;
    const reason =
      hidden && pledge.hiddenReason ? ` Lý do: ${pledge.hiddenReason}` : '';
    const type = hidden
      ? NotificationTypes.CHARITY_MONEY_PLEDGE_HIDDEN
      : NotificationTypes.CHARITY_MONEY_PLEDGE_UNHIDDEN;
    try {
      await this.dispatch.handle({
        userId: pledge.userId,
        type,
        title: hidden
          ? 'Lời khai ủng hộ tiền bị ẩn'
          : 'Lời khai ủng hộ tiền được hiện lại',
        body: hidden
          ? `Ban tổ chức dự án "${campaignTitle}" đã ẩn lời khai ủng hộ ${amount} của bạn.${reason}`
          : `Ban tổ chức dự án "${campaignTitle}" đã hiện lại lời khai ủng hộ ${amount} của bạn.`,
        referenceType: 'CHARITY_MONEY_PLEDGE',
        referenceId: pledge.pledgeId,
        target: {
          type: NotificationTargetTypes.CHARITY_CAMPAIGN,
          id: pledge.campaignId,
        },
        // Ẩn → bỏ ẩn → ẩn lại là ba sự kiện thật: khoá theo mốc của từng lần.
        idempotencyKey: `${type}:${pledge.pledgeId}:${at.getTime()}`,
      });
    } catch (error) {
      this.logger.warn(
        `Không gửi được thông báo lời khai ủng hộ ${pledge.pledgeId}: ${String(error)}`,
      );
    }
  }
}

/**
 * Chủ dự án / điều phối viên ẩn lời khai vô lý (số tiền ảo, khai trêu) hoặc bỏ ẩn — chỉ trước khi
 * dự án kết thúc. Không đổi `INTENDED`/`COMPLETED`.
 */
@Injectable()
export class SetCharityMoneyPledgeHiddenUseCase implements ISetCharityMoneyPledgeHiddenUseCase {
  public constructor(
    private readonly access: CharityProjectAccess,
    @Inject(ICharityMoneyPledgeRepository)
    private readonly pledges: ICharityMoneyPledgeRepository,
    private readonly notifier: CharityMoneyPledgeNotifier,
  ) {}

  public async handle(
    command: ISetCharityMoneyPledgeHiddenCommand,
  ): Promise<ICharityManagedMoneyPledge> {
    const reason = command.hidden ? trimmed(command.reason) : null;
    if (reason && reason.length > MaxCharityMoneyPledgeHiddenReasonLength)
      throw new ValidationFailedException([
        `hide.reason: tối đa ${MaxCharityMoneyPledgeHiddenReasonLength} ký tự`,
      ]);
    const current = await this.pledges.findById(command.pledgeId);
    if (!current) throw new CharityMoneyPledgeNotFoundException();
    // Người không có vai ở dự án nhận 404 từ resolve(); có vai đọc mà không vận hành → 403.
    const { campaign } = await this.access.forOperate({
      userId: command.userId,
      campaignId: current.campaignId,
    });
    const outcome = await this.pledges.setHidden({
      pledgeId: command.pledgeId,
      hidden: command.hidden,
      actorId: command.userId,
      reason,
    });
    const pledge = throwOnMiss(outcome, () =>
      command.hidden
        ? new CharityMoneyPledgeAlreadyHiddenException()
        : new CharityMoneyPledgeNotHiddenException(),
    );
    await this.notifier.notify(pledge, campaign.title, new Date());
    const row = await this.pledges.findRow(command.pledgeId);
    if (!row) throw new CharityMoneyPledgeNotFoundException();
    return toManaged(row);
  }
}
