import {
  ICharityParticipation,
  ICharityParticipationRepository,
} from '@/domain/ports/repository';
import { CharityParticipationStatus } from '@chantam.vn/chantam.core-lib/models';
import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { updateReturning } from './update-returning';

interface IParticipationRow {
  global_id: string;
  campaign_id: string;
  user_id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  status: CharityParticipationStatus;
  registered_at: Date;
  status_changed_at: Date | null;
  status_changed_by: string | null;
  status_reason: string | null;
  checked_in_at: Date | null;
  checked_in_by: string | null;
  cancelled_at: Date | null;
  positions: {
    volunteerNeedId: string;
    title: string;
    status: string;
  }[];
}

const Select = `
  SELECT participation.global_id, participation.campaign_id, participation.user_id,
         account.username, account.full_name, account.avatar_url, participation.status,
         participation.registered_at, participation.status_changed_at,
         participation.status_changed_by, participation.status_reason,
         participation.checked_in_at, participation.checked_in_by, participation.cancelled_at,
         COALESCE((SELECT jsonb_agg(jsonb_build_object(
                    'volunteerNeedId', need.global_id, 'title', need.title,
                    'status', registration.status) ORDER BY registration.created_at)
                   FROM campaign_volunteer_registrations registration
                   JOIN campaign_volunteer_needs need
                     ON need.global_id = registration.volunteer_need_id
                  WHERE need.campaign_id = participation.campaign_id
                    AND registration.user_id = participation.user_id
                    AND registration.status <> 'CANCELLED'), '[]'::jsonb) AS positions
  FROM campaign_participations participation
  JOIN users account ON account.global_id = participation.user_id`;

const toParticipation = (row: IParticipationRow): ICharityParticipation => ({
  participationId: row.global_id,
  campaignId: row.campaign_id,
  user: {
    userId: row.user_id,
    username: row.username,
    fullName: row.full_name,
    avatarUrl: row.avatar_url,
  },
  status: row.status,
  registeredAt: row.registered_at,
  statusChangedAt: row.status_changed_at,
  statusChangedBy: row.status_changed_by,
  statusReason: row.status_reason,
  checkedInAt: row.checked_in_at,
  checkedInBy: row.checked_in_by,
  cancelledAt: row.cancelled_at,
  positions: row.positions ?? [],
});

@Injectable()
export class CharityParticipationRepository implements ICharityParticipationRepository {
  public constructor(
    @InjectEntityManager() private readonly manager: EntityManager,
  ) {}

  public async list(params: {
    campaignId: string;
    status: CharityParticipationStatus | null;
  }): Promise<ICharityParticipation[]> {
    const rows = await this.manager.query<IParticipationRow[]>(
      `${Select}
       WHERE participation.campaign_id = $1
         AND ($2::varchar IS NULL OR participation.status = $2::varchar)
       ORDER BY participation.registered_at, participation.id
       LIMIT 2000`,
      [params.campaignId, params.status],
    );
    return rows.map(toParticipation);
  }

  public async find(
    campaignId: string,
    participationId: string,
  ): Promise<ICharityParticipation | null> {
    const [row] = await this.manager.query<IParticipationRow[]>(
      `${Select}
       WHERE participation.campaign_id = $1 AND participation.global_id = $2`,
      [campaignId, participationId],
    );
    return row ? toParticipation(row) : null;
  }

  public async findByUser(
    campaignId: string,
    userId: string,
  ): Promise<ICharityParticipation | null> {
    const [row] = await this.manager.query<IParticipationRow[]>(
      `${Select}
       WHERE participation.campaign_id = $1 AND participation.user_id = $2`,
      [campaignId, userId],
    );
    return row ? toParticipation(row) : null;
  }

  public async transition(params: {
    campaignId: string;
    participationId: string;
    from: readonly CharityParticipationStatus[];
    to: CharityParticipationStatus;
    actorId: string;
    reason: string | null;
    checkIn: boolean;
  }): Promise<ICharityParticipation | null> {
    const rows = await updateReturning<{ global_id: string }>(
      this.manager,
      `UPDATE campaign_participations
          SET status = $4::varchar, status_changed_at = now(), status_changed_by = $5,
              status_reason = $6,
              checked_in_at = CASE WHEN $7::boolean THEN now() ELSE checked_in_at END,
              checked_in_by = CASE WHEN $7::boolean THEN $5 ELSE checked_in_by END
        WHERE campaign_id = $1 AND global_id = $2 AND status = ANY($3::varchar[])
        RETURNING global_id`,
      [
        params.campaignId,
        params.participationId,
        [...params.from],
        params.to,
        params.actorId,
        params.reason,
        params.checkIn,
      ],
    );
    if (rows.length === 0) return null;
    return this.find(params.campaignId, params.participationId);
  }
}
