import {
  IAdminConfigRepository,
  ICharityPointCaps,
  ICharityPointsRepository,
} from '@/domain/ports/repository';
import {
  CharityPointCapWindows,
  CharityPointRuleCode,
  CharityPostAuthorRole,
  CharityPostParticipantMultiplierConfigKey,
  DefaultCharityPostParticipantMultiplierPercent,
  charityPointCapConfigKey,
  itemValuePoints,
  normalizeNonNegativeInt,
  participationPoints,
  postMediaPoints,
  vietnamDayStart,
} from '@chantam.vn/chantam.core-lib/models';
import { Inject, Injectable, Logger } from '@nestjs/common';

/**
 * Điểm dự án từ thiện theo giá trị, kèm trần (CHARITY-PROJECT-LIFECYCLE §3.9).
 *
 * Mỗi nơi phát sinh (lượt giao nhận xong, bài ảnh/clip, lượt chấm mức hoàn thành, khiếu nại
 * điều chỉnh) đặt "nên được bao nhiêu" (`target`) rồi ghi phần chênh qua `settle` — dương thì
 * theo trần (vướng thì HOÃN), âm thì trừ ngay. Không sửa bút toán cũ.
 *
 * Gọi SAU khi việc chính đã commit và NUỐT lỗi của chính nó: điểm là chính sách, việc đã xảy
 * ra là sự thật — chính sách không được đánh đổ sự thật (cùng lối `CharityNotifier`). Phần chưa
 * ghi được, job `charity:points` ghi tiếp.
 */
@Injectable()
export class CharityPointsService {
  private readonly logger = new Logger(CharityPointsService.name);

  public constructor(
    @Inject(ICharityPointsRepository)
    private readonly points: ICharityPointsRepository,
    @Inject(IAdminConfigRepository)
    private readonly admin: IAdminConfigRepository,
  ) {}

  /** Lượt giao nhận hoàn tất (hoặc giá trị vừa được điều chỉnh qua khiếu nại). */
  public async awardItemValue(deliveryId: string): Promise<void> {
    await this.safely(`giao nhận ${deliveryId}`, async () => {
      const delivery = await this.points.deliveryValue(deliveryId);
      if (!delivery) return;
      const rule = await this.points.findRule('CHARITY_ITEM_VALUE');
      const existing = await this.points.findAwards({
        ruleCode: 'CHARITY_ITEM_VALUE',
        referenceType: 'CHARITY_DELIVERY',
        referenceId: deliveryId,
      });
      // Rule đang TẮT: không mở award mới; award đã có vẫn theo giá trị mới (điều chỉnh).
      if (!rule?.isEnabled && existing.length === 0) return;
      const award = await this.points.upsertAward({
        campaignId: delivery.campaignId,
        userId: delivery.contributorId,
        ruleCode: 'CHARITY_ITEM_VALUE',
        referenceType: 'CHARITY_DELIVERY',
        referenceId: deliveryId,
        targetPoints: itemValuePoints(
          delivery.confirmedValue,
          rule?.points ?? 0,
        ),
        reason: `Vật phẩm trị giá ${delivery.confirmedValue.toLocaleString('vi-VN')}đ đã tới nơi`,
      });
      await this.settle(award.awardId, 'CHARITY_ITEM_VALUE');
    });
  }

  /** Bài ảnh/clip vừa đăng: một award cho clip, một cho ảnh. */
  public async awardPost(post: {
    postId: string;
    campaignId: string;
    authorId: string;
    authorRole: CharityPostAuthorRole;
    videoCount: number;
    imageCount: number;
  }): Promise<void> {
    await this.safely(`bài ${post.postId}`, async () => {
      const multiplier = normalizeNonNegativeInt(
        await this.admin.getConfigValue(
          CharityPostParticipantMultiplierConfigKey,
        ),
        DefaultCharityPostParticipantMultiplierPercent,
        1000,
      );
      for (const [ruleCode, count, noun] of [
        ['CHARITY_POST_VIDEO', post.videoCount, 'clip'],
        ['CHARITY_POST_IMAGE', post.imageCount, 'ảnh'],
      ] as const) {
        if (count === 0) continue;
        const rule = await this.points.findRule(ruleCode);
        if (!rule?.isEnabled) continue;
        const award = await this.points.upsertAward({
          campaignId: post.campaignId,
          userId: post.authorId,
          ruleCode,
          referenceType: 'CHARITY_CAMPAIGN_POST',
          referenceId: post.postId,
          targetPoints: postMediaPoints({
            mediaCount: count,
            rulePoints: rule.points,
            participant: post.authorRole === 'PARTICIPANT',
            participantMultiplierPercent: multiplier,
          }),
          reason: `${count} ${noun} đăng vào dự án từ thiện`,
        });
        await this.settle(award.awardId, ruleCode);
      }
    });
  }

  /** Bài bị gỡ: đưa award về 0 — bút toán trừ phần đã ghi. */
  public async revokePost(postId: string): Promise<void> {
    await this.safely(`gỡ bài ${postId}`, async () => {
      const awards = await this.points.findAwards({
        referenceType: 'CHARITY_CAMPAIGN_POST',
        referenceId: postId,
      });
      for (const award of awards) {
        if (award.targetPoints === 0) continue;
        await this.points.upsertAward({
          campaignId: award.campaignId,
          userId: award.userId,
          ruleCode: award.ruleCode,
          referenceType: award.referenceType,
          referenceId: award.referenceId,
          targetPoints: 0,
          reason: 'Bài đã bị gỡ',
        });
        await this.settle(award.awardId, award.ruleCode);
      }
    });
  }

  /** Lượt chấm (lần đầu, chấm lại, hay điều chỉnh qua khiếu nại) — điểm theo lần MỚI NHẤT. */
  public async awardParticipation(params: {
    campaignId: string;
    participantId: string;
    completionScore: number;
  }): Promise<void> {
    const referenceId = `${params.campaignId}:${params.participantId}`;
    await this.safely(`tham gia ${referenceId}`, async () => {
      const rule = await this.points.findRule('CHARITY_PARTICIPATION');
      const existing = await this.points.findAwards({
        ruleCode: 'CHARITY_PARTICIPATION',
        referenceType: 'CHARITY_PARTICIPATION',
        referenceId,
      });
      if (!rule?.isEnabled && existing.length === 0) return;
      const award = await this.points.upsertAward({
        campaignId: params.campaignId,
        userId: params.participantId,
        ruleCode: 'CHARITY_PARTICIPATION',
        referenceType: 'CHARITY_PARTICIPATION',
        referenceId,
        targetPoints: participationPoints(
          params.completionScore,
          rule?.points ?? 0,
        ),
        reason: `Tham gia dự án, mức hoàn thành ${params.completionScore}/100`,
      });
      await this.settle(award.awardId, 'CHARITY_PARTICIPATION');
    });
  }

  /** Job: vá giao nhận thiếu award, đưa bài đã gỡ/ẩn về 0, ghi tiếp phần đang hoãn. */
  public async settlePending(limit: number): Promise<{
    backfilled: number;
    zeroed: number;
    settled: number;
    applied: number;
    deferred: number;
  }> {
    // Rule tắt thì vá cũng không mở award nào — bỏ qua để số "vá" không báo khống mỗi lượt.
    const itemRule = await this.points.findRule('CHARITY_ITEM_VALUE');
    const missing = itemRule?.isEnabled
      ? await this.points.listDeliveriesWithoutAward(30, limit)
      : [];
    for (const deliveryId of missing) await this.awardItemValue(deliveryId);
    const zeroed = await this.points.zeroAwardsForRemovedPosts(limit);
    let applied = 0;
    let deferred = 0;
    const pending = await this.points.listUnsettled(limit);
    for (const award of pending) {
      const result = await this.settle(award.awardId, award.ruleCode);
      applied += result.applied;
      deferred += result.deferred;
    }
    return {
      backfilled: missing.length,
      zeroed,
      settled: pending.length,
      applied,
      deferred,
    };
  }

  public async caps(rule: CharityPointRuleCode): Promise<ICharityPointCaps> {
    const values = await Promise.all(
      CharityPointCapWindows.map((window) =>
        this.admin.getConfigValue(charityPointCapConfigKey(rule, window)),
      ),
    );
    const [daily, project, cycle] = values.map((value) => {
      const cap = normalizeNonNegativeInt(value, 0);
      return cap === 0 ? null : cap;
    });
    return { daily, project, cycle };
  }

  private async settle(awardId: string, rule: CharityPointRuleCode) {
    return this.points.settle({
      awardId,
      caps: await this.caps(rule),
      dayStart: vietnamDayStart(new Date()),
    });
  }

  private async safely(label: string, action: () => Promise<void>) {
    try {
      await action();
    } catch (error) {
      this.logger.warn(
        `Không ghi được điểm dự án (${label}): ${String(error)} — job charity:points sẽ thử lại`,
      );
    }
  }
}
