import { CharityCampaignNotFoundException } from '@/domain/exceptions';
import {
  ICharityCampaignMediaParams,
  ICharityChangeRequest,
  ICharityChangeRequestRepository,
  ICharityPartyInput,
} from '@/domain/ports/repository';
import {
  CharityChangeRequestStatus,
  ICharityReviewedFields,
  diffCharityRevisions,
} from '@chantam.vn/chantam.core-lib/models';
import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { CharityProjectRepository } from './charity-project.repository';
import { recordCharityRevisions } from './charity-revision.writer';
import { updateReturning } from './update-returning';

interface IRow {
  global_id: string;
  campaign_id: string;
  status: CharityChangeRequestStatus;
  proposed: ICharityReviewedFields;
  base: ICharityReviewedFields;
  submitted_by: string | null;
  submitted_at: Date;
  decided_by: string | null;
  decided_at: Date | null;
  decision_reason: string | null;
}

const Columns = `global_id, campaign_id, status, proposed, base, submitted_by, submitted_at,
       decided_by, decided_at, decision_reason`;

const toRequest = (row: IRow): ICharityChangeRequest => ({
  requestId: row.global_id,
  campaignId: row.campaign_id,
  status: row.status,
  proposed: row.proposed ?? {},
  base: row.base ?? {},
  submittedBy: row.submitted_by,
  submittedAt: row.submitted_at,
  decidedBy: row.decided_by,
  decidedAt: row.decided_at,
  decisionReason: row.decision_reason,
});

/** Bản sửa chờ duyệt (CR 22/11/2026). Đường công khai không bao giờ đọc bảng này. */
@Injectable()
export class CharityChangeRequestRepository implements ICharityChangeRequestRepository {
  public constructor(
    @InjectEntityManager() private readonly manager: EntityManager,
  ) {}

  public async findPending(
    campaignId: string,
  ): Promise<ICharityChangeRequest | null> {
    const [row] = await this.manager.query<IRow[]>(
      `SELECT ${Columns} FROM campaign_change_requests
        WHERE campaign_id = $1 AND status = 'PENDING'`,
      [campaignId],
    );
    return row ? toRequest(row) : null;
  }

  public async upsertPending(params: {
    campaignId: string;
    actorId: string;
    proposed: ICharityReviewedFields;
    base: ICharityReviewedFields;
  }): Promise<ICharityChangeRequest> {
    // INSERT … RETURNING không bị TypeORM bọc — đọc thẳng `rows[0]`.
    const [row] = await this.manager.query<IRow[]>(
      `INSERT INTO campaign_change_requests (campaign_id, proposed, base, submitted_by)
       VALUES ($1, $2::jsonb, $3::jsonb, $4)
       ON CONFLICT (campaign_id) WHERE status = 'PENDING' DO UPDATE
         SET proposed = EXCLUDED.proposed, submitted_by = EXCLUDED.submitted_by,
             submitted_at = now()
       RETURNING ${Columns}`,
      [
        params.campaignId,
        JSON.stringify(params.proposed),
        JSON.stringify(params.base),
        params.actorId,
      ],
    );
    return toRequest(row);
  }

  public async withdraw(params: {
    campaignId: string;
    actorId: string;
  }): Promise<boolean> {
    const rows = await updateReturning<{ global_id: string }>(
      this.manager,
      `UPDATE campaign_change_requests
          SET status = 'WITHDRAWN', decided_at = now(), decided_by = $2
        WHERE campaign_id = $1 AND status = 'PENDING'
        RETURNING global_id`,
      [params.campaignId, params.actorId],
    );
    return rows.length > 0;
  }

  public async listByStatus(params: {
    status: CharityChangeRequestStatus | null;
    limit: number;
    offset: number;
  }): Promise<ICharityChangeRequest[]> {
    const rows = await this.manager.query<IRow[]>(
      `SELECT ${Columns} FROM campaign_change_requests
        WHERE ($1::varchar IS NULL OR status = $1::varchar)
        ORDER BY submitted_at ASC, id ASC
        LIMIT $2 OFFSET $3`,
      [params.status, params.limit, params.offset],
    );
    return rows.map(toRequest);
  }

  public async decide(params: {
    requestId: string;
    actorId: string;
    status: 'APPROVED' | 'REJECTED';
    reason: string | null;
    manager?: EntityManager;
  }): Promise<ICharityChangeRequest | null> {
    const rows = await updateReturning<IRow>(
      params.manager ?? this.manager,
      `UPDATE campaign_change_requests
          SET status = $3, decided_by = $2, decided_at = now(), decision_reason = $4
        WHERE global_id = $1 AND status = 'PENDING'
        RETURNING ${Columns}`,
      [params.requestId, params.actorId, params.status, params.reason],
    );
    return rows.length > 0 ? toRequest(rows[0]) : null;
  }

  public async applyApproved(params: {
    request: ICharityChangeRequest;
    actorId: string;
    reason: string | null;
    campaign: {
      title?: string;
      description?: string;
      pointBonusPercent?: number;
      acceptedContributionTypes?: readonly string[];
    };
    media: {
      media: readonly ICharityCampaignMediaParams[];
      bannerUrl: string;
    } | null;
    parties: ICharityPartyInput[] | null;
  }): Promise<ICharityChangeRequest | null> {
    const campaignId = params.request.campaignId;
    return this.manager.transaction(async (manager) => {
      const [locked] = await manager.query<{ global_id: string }[]>(
        `SELECT global_id FROM campaigns WHERE global_id = $1 FOR UPDATE`,
        [campaignId],
      );
      if (!locked) throw new CharityCampaignNotFoundException();
      const projects = CharityProjectRepository.untrackedWithin(manager);
      const partyRows = async () =>
        (await projects.listParties(campaignId))
          .filter((party) => !party.isAppealSubject)
          .map((party) => ({
            id: party.partyId,
            values: party as unknown as Record<string, unknown>,
          }));
      const campaignBefore = await this.reviewedCampaignRow(
        manager,
        campaignId,
      );
      const partiesBefore = params.parties ? await partyRows() : [];

      if (params.parties)
        await projects.replaceParties({
          campaignId,
          actorId: params.actorId,
          parties: params.parties,
        });
      const fields = params.campaign;
      await manager.query(
        `UPDATE campaigns
            SET title = COALESCE($2, title),
                description = COALESCE($3, description),
                point_bonus_percent = COALESCE($4::smallint, point_bonus_percent),
                requested_point_bonus_percent =
                  COALESCE($4::smallint, requested_point_bonus_percent),
                accepted_contribution_types =
                  COALESCE($5::text[], accepted_contribution_types),
                updated_at = now()
          WHERE global_id = $1`,
        [
          campaignId,
          fields.title ?? null,
          fields.description ?? null,
          fields.pointBonusPercent ?? null,
          fields.acceptedContributionTypes
            ? [...fields.acceptedContributionTypes]
            : null,
        ],
      );
      if (params.media) {
        await manager.query(
          `DELETE FROM campaign_media WHERE campaign_id = $1`,
          [campaignId],
        );
        await manager.query(
          `INSERT INTO campaign_media
             (campaign_id, storage_key, public_url, media_type, sort_order, is_cover)
           SELECT $1, item.storage_key, item.public_url, item.media_type,
                  item.sort_order, item.is_cover
           FROM UNNEST($2::text[], $3::text[], $4::text[], $5::int[], $6::boolean[])
             AS item(storage_key, public_url, media_type, sort_order, is_cover)`,
          [
            campaignId,
            params.media.media.map((item) => item.storageKey),
            params.media.media.map((item) => item.publicUrl),
            params.media.media.map((item) => item.mediaType),
            params.media.media.map((item) => item.sortOrder),
            params.media.media.map((item) => item.isCover),
          ],
        );
        await manager.query(
          `UPDATE campaigns SET banner_url = $2 WHERE global_id = $1`,
          [campaignId, params.media.bannerUrl],
        );
      }

      // Một lượt ghi lịch sử cho cả chiến dịch lẫn đơn vị nhận → tối đa MỘT thông báo
      // PLAN_CHANGED cho người theo dõi.
      await recordCharityRevisions(manager, {
        campaignId,
        actorId: params.actorId,
        reason: params.reason,
        drafts: [
          ...diffCharityRevisions(
            'CAMPAIGN',
            campaignBefore,
            await this.reviewedCampaignRow(manager, campaignId),
          ),
          ...(params.parties
            ? diffCharityRevisions('PARTY', partiesBefore, await partyRows())
            : []),
        ],
      });
      const decided = await this.decide({
        requestId: params.request.requestId,
        actorId: params.actorId,
        status: 'APPROVED',
        reason: params.reason,
        manager,
      });
      // Admin khác đã quyết trước: huỷ cả lượt áp (ném để transaction lùi lại).
      if (!decided) throw new CharityCampaignNotFoundException();
      return decided;
    });
  }

  /** Giá trị các trường cần duyệt của chiến dịch, dạng hàng lịch sử `CAMPAIGN`. */
  private async reviewedCampaignRow(
    manager: EntityManager,
    campaignId: string,
  ): Promise<{ id: null; values: Record<string, unknown> }[]> {
    const [row] = await manager.query<
      {
        title: string;
        description: string;
        point_bonus_percent: number;
        accepted_contribution_types: string[];
        media: string[] | null;
      }[]
    >(
      `SELECT campaign.title, campaign.description, campaign.point_bonus_percent,
              campaign.accepted_contribution_types,
              (SELECT array_agg(item.public_url ORDER BY item.sort_order)
                 FROM campaign_media item WHERE item.campaign_id = campaign.global_id) AS media
         FROM campaigns campaign WHERE campaign.global_id = $1`,
      [campaignId],
    );
    return row
      ? [
          {
            id: null,
            values: {
              title: row.title,
              description: row.description,
              pointBonusPercent: Number(row.point_bonus_percent),
              acceptedContributionTypes: row.accepted_contribution_types,
              media: row.media ?? [],
            },
          },
        ]
      : [];
  }
}
