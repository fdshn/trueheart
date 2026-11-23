import {
  IGetPointFeedCommand,
  IGetPointFeedUseCase,
} from '@/application/contracts/point';
import { UserNotFoundException } from '@/domain/exceptions';
import { IPointFeedCache } from '@/domain/ports/cache';
import {
  IAdminConfigRepository,
  IPointFeedRepository,
  IPointFeedRow,
  IPointLedgerRepository,
} from '@/domain/ports/repository';
import { IRequestThrottle } from '@/domain/ports/security';
import {
  IPointFeedEntryDto,
  IPointFeedResponseDto,
  IUserPointFeedResponseDto,
} from '@chantam.vn/chantam.core-lib/dto';
import {
  PointFeedDisplayIntervalMsConfigKey,
  PointFeedExcludedRuleCodes,
  PointFeedMaxLimit,
  PointFeedMergedRuleCodes,
  PointFeedMinDeltaConfigKey,
  PointFeedPollSecondsConfigKey,
  PointFeedRateLimitPerMinute,
  normalizePointFeedDisplayIntervalMs,
  normalizePointFeedMinDelta,
  normalizePointFeedPollSeconds,
  pointRuleTitle,
} from '@chantam.vn/chantam.core-lib/models';
import { Inject, Injectable } from '@nestjs/common';
import { toPublicUserProfile } from '../shared/public-author';

/**
 * Bảng tin điểm công khai (CR 22/11/2026). App hỏi lại theo `pollAfterSeconds`, gửi `afterId`
 * = `latestId` lượt trước, và hiện từng dòng cách nhau `displayIntervalMs`.
 *
 * Dòng chọn TƯỜNG MINH từng trường — không bao giờ có mã rule, lý do, id tham chiếu.
 */
@Injectable()
export class GetPointFeedUseCase implements IGetPointFeedUseCase {
  public constructor(
    @Inject(IPointFeedRepository)
    private readonly feed: IPointFeedRepository,
    @Inject(IPointFeedCache)
    private readonly cache: IPointFeedCache,
    @Inject(IRequestThrottle)
    private readonly throttle: IRequestThrottle,
    @Inject(IAdminConfigRepository)
    private readonly admin: IAdminConfigRepository,
    @Inject(IPointLedgerRepository)
    private readonly ledger: IPointLedgerRepository,
  ) {}

  public async handle(
    command: IGetPointFeedCommand,
  ): Promise<IPointFeedResponseDto | IUserPointFeedResponseDto> {
    await this.throttle.assertWithinLimit({
      bucket: 'point-feed',
      key: command.viewerId,
      limit: PointFeedRateLimitPerMinute,
    });
    await this.throttle.registerHit({
      bucket: 'point-feed',
      key: command.viewerId,
      windowSeconds: 60,
    });
    const limit = Math.min(Math.max(command.limit, 1), PointFeedMaxLimit);

    if (command.userId !== null) {
      // Feed của người đã tắt cờ / bị khoá / đã xoá: người khác nhận 404 như không tồn tại.
      if (
        command.userId !== command.viewerId &&
        !(await this.feed.isFeedVisible(command.userId))
      )
        throw new UserNotFoundException();
      const [page, summary] = await Promise.all([
        this.page({ ...command, limit }, 0),
        this.ledger.getSummary(command.userId),
      ]);
      return { ...page, balance: summary.balance, lifetime: summary.lifetime };
    }

    const key = `cache:point_feed:${command.afterId ?? 'latest'}:${limit}`;
    const cached = await this.cache.read(key);
    if (cached) return cached;
    const page = await this.page(
      { ...command, limit },
      normalizePointFeedMinDelta(
        await this.admin.getConfigValue(PointFeedMinDeltaConfigKey),
      ),
    );
    await this.cache.write(key, page);
    return page;
  }

  private async page(
    command: IGetPointFeedCommand,
    minDelta: number,
  ): Promise<IPointFeedResponseDto> {
    // Đọc mốc TRƯỚC, rồi chỉ lấy dòng tới mốc đó: dòng commit sau khi đọc mốc sẽ được lượt hỏi
    // kế tiếp nhặt — không bị `latestId` nhảy qua (review M1).
    const latest = await this.feed.latestId(command.userId);
    const [rows, pollSeconds, displayMs] = await Promise.all([
      this.feed.list({
        afterId: command.afterId,
        upToId: latest,
        limit: command.limit,
        userId: command.userId,
        minDelta,
        excludedRuleCodes: PointFeedExcludedRuleCodes,
        mergedRuleCodes: PointFeedMergedRuleCodes,
      }),
      this.admin.getConfigValue(PointFeedPollSecondsConfigKey),
      this.admin.getConfigValue(PointFeedDisplayIntervalMsConfigKey),
    ]);
    const entries = rows
      .map(toEntry)
      .sort((left, right) => left.entryId - right.entryId);
    const last = entries[entries.length - 1];
    // Trang đầy khi đang theo `afterId`: còn dòng sau đó — lượt sau tiếp từ dòng cuối trang
    // này, không nhảy tới id lớn nhất (sẽ bỏ sót).
    const latestId =
      command.afterId !== null && last && entries.length === command.limit
        ? last.entryId
        : (latest ?? last?.entryId ?? command.afterId);
    return {
      entries,
      latestId,
      pollAfterSeconds: normalizePointFeedPollSeconds(pollSeconds),
      displayIntervalMs: normalizePointFeedDisplayIntervalMs(displayMs),
    };
  }
}

/** Dòng công khai: chọn tường minh — chỉ tiêu đề rule, không mã rule/lý do/tham chiếu. */
function toEntry(row: IPointFeedRow): IPointFeedEntryDto {
  return {
    entryId: row.entryId,
    user: toPublicUserProfile({
      globalId: row.userId,
      username: row.username,
      fullName: row.fullName,
      avatarUrl: row.avatarUrl,
      rank: row.rank,
    }),
    delta: row.delta + row.bonusDelta,
    bonusPercent: row.bonusDelta > 0 ? row.bonusPercent : null,
    ruleTitle: pointRuleTitle(row.ruleCode),
    occurredAt: row.occurredAt.toISOString(),
    context: row.context
      ? { type: row.context.type, id: row.context.id, title: row.context.title }
      : null,
  };
}
