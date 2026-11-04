import {
  AddCharityBankAccountOutcome,
  ICharityBankAccount,
  ICharityBankAccountInput,
  ICharityCustomSection,
  ICharityCustomSectionInput,
  ICharityFundingNeed,
  ICharityFundingNeedInput,
  ICharityItemNeed,
  ICharityNeedItemProfileInput,
  ICharityParty,
  ICharityPartyInput,
  ICharityPhase,
  ICharityProjectProfile,
  ICharityProjectRepository,
  ICharitySectionState,
  ICharityStageEvent,
  ICharityTeamMember,
  ICharityTeamMemberInput,
  ICharityVolunteerNeed,
  ICharityVolunteerNeedInput,
  ICharityVolunteerRegistration,
  MoveCharityStageOutcome,
  RegisterCharityVolunteerOutcome,
  SubmitCharityDraftOutcome,
} from '@/domain/ports/repository';
import {
  CharityBeneficiaryKind,
  CharityCallToAction,
  CharityCustomFieldType,
  CharityDeliveryMethod,
  CharityFieldVisibility,
  CharityItemCondition,
  CharityOpenClosedStatus,
  CharityOperationStage,
  CharityPartyRole,
  CharityPhaseKey,
  CharityReportMode,
  CharitySupplySource,
  CharityTeamRole,
  CharityVolunteerNeedStatus,
  CharityVolunteerRegistrationStatus,
} from '@chantam.vn/chantam.core-lib/models';
import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { updateReturning } from './update-returning';

const num = (value: unknown): number => Number(value ?? 0);

interface IPartyRow {
  global_id: string;
  role: CharityPartyRole;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  hotline: string | null;
  pic_name: string | null;
  pic_phone: string | null;
  pic_user_id: string | null;
  beneficiary_kind: CharityBeneficiaryKind | null;
  is_appeal_subject: boolean;
  evidence_urls: string[];
  updated_at: Date;
}

const toParty = (row: IPartyRow): ICharityParty => ({
  partyId: row.global_id,
  role: row.role,
  name: row.name,
  address: row.address,
  phone: row.phone,
  email: row.email,
  hotline: row.hotline,
  picName: row.pic_name,
  picPhone: row.pic_phone,
  picUserId: row.pic_user_id,
  beneficiaryKind: row.beneficiary_kind,
  isAppealSubject: row.is_appeal_subject,
  evidenceUrls: row.evidence_urls ?? [],
  updatedAt: row.updated_at,
});

interface IBankRow {
  global_id: string;
  label: string | null;
  bank_name: string;
  account_no: string;
  account_name: string;
  valid_from: Date;
  valid_to: Date | null;
  close_reason: string | null;
}

const toBank = (row: IBankRow): ICharityBankAccount => ({
  accountId: row.global_id,
  label: row.label,
  bankName: row.bank_name,
  accountNo: row.account_no,
  accountName: row.account_name,
  validFrom: row.valid_from,
  validTo: row.valid_to,
  closeReason: row.close_reason,
});

const FundingColumns = `funding.global_id, funding.title, funding.description,
  funding.beneficiary_party_id, funding.receiving_unit, funding.bank_account_id,
  funding.target_amount, funding.confirmed_amount, funding.external_amount, funding.deadline,
  funding.status, funding.sort_order, funding.updated_at`;

interface IFundingRow {
  global_id: string;
  title: string;
  description: string | null;
  beneficiary_party_id: string | null;
  receiving_unit: string | null;
  bank_account_id: string | null;
  target_amount: string | number;
  confirmed_amount: string | number;
  external_amount: string | number;
  deadline: Date | null;
  status: CharityOpenClosedStatus;
  sort_order: number;
  updated_at: Date;
}

const toFunding = (row: IFundingRow): ICharityFundingNeed => {
  const targetAmount = num(row.target_amount);
  const confirmedAmount = num(row.confirmed_amount);
  const externalAmount = num(row.external_amount);
  return {
    fundingNeedId: row.global_id,
    title: row.title,
    description: row.description,
    beneficiaryPartyId: row.beneficiary_party_id,
    receivingUnit: row.receiving_unit,
    bankAccountId: row.bank_account_id,
    targetAmount,
    confirmedAmount,
    externalAmount,
    remainingAmount: Math.max(
      0,
      targetAmount - confirmedAmount - externalAmount,
    ),
    deadline: row.deadline,
    status: row.status,
    sortOrder: row.sort_order,
    updatedAt: row.updated_at,
  };
};

const VolunteerColumns = `volunteer.global_id, volunteer.title, volunteer.description,
  volunteer.requirements, volunteer.needed_count, volunteer.starts_at, volunteer.ends_at,
  volunteer.location_label, volunteer.status, volunteer.sort_order,
  (SELECT count(*) FROM campaign_volunteer_registrations registration
    WHERE registration.volunteer_need_id = volunteer.global_id
      AND registration.status = 'REGISTERED') AS registered_count,
  (SELECT count(*) FROM campaign_volunteer_registrations registration
    WHERE registration.volunteer_need_id = volunteer.global_id
      AND registration.status = 'CONFIRMED') AS confirmed_count`;

interface IVolunteerRow {
  global_id: string;
  title: string;
  description: string | null;
  requirements: string | null;
  needed_count: number;
  starts_at: Date | null;
  ends_at: Date | null;
  location_label: string | null;
  status: CharityVolunteerNeedStatus;
  sort_order: number;
  registered_count: string | number;
  confirmed_count: string | number;
}

const toVolunteer = (row: IVolunteerRow): ICharityVolunteerNeed => {
  const registeredCount = num(row.registered_count);
  const confirmedCount = num(row.confirmed_count);
  return {
    volunteerNeedId: row.global_id,
    title: row.title,
    description: row.description,
    requirements: row.requirements,
    neededCount: row.needed_count,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    locationLabel: row.location_label,
    status: row.status,
    sortOrder: row.sort_order,
    registeredCount,
    confirmedCount,
    remainingCount: Math.max(
      0,
      row.needed_count - registeredCount - confirmedCount,
    ),
  };
};

/**
 * Dự án từ thiện 4 giai đoạn — đợt 1 (docs/plan/CHARITY-PROJECT-LIFECYCLE.md §3.1, §3.2,
 * §3.11, §3.12). Khung chiến dịch vẫn ở `CharityCampaignRepository`.
 */
@Injectable()
export class CharityProjectRepository implements ICharityProjectRepository {
  public constructor(
    @InjectEntityManager() private readonly manager: EntityManager,
  ) {}

  // ── Hồ sơ ───────────────────────────────────────────────────────────────

  public async getProfile(
    campaignId: string,
  ): Promise<ICharityProjectProfile | null> {
    const [row] = await this.manager.query<
      {
        appeal_purpose: string | null;
        appeal_audience: string | null;
        appeal_circumstance: string | null;
        call_to_actions: CharityCallToAction[];
        max_bank_accounts: number | null;
      }[]
    >(
      `SELECT appeal_purpose, appeal_audience, appeal_circumstance, call_to_actions,
              max_bank_accounts
       FROM campaigns WHERE global_id = $1 AND deleted_at IS NULL`,
      [campaignId],
    );
    return row
      ? {
          appealPurpose: row.appeal_purpose,
          appealAudience: row.appeal_audience,
          appealCircumstance: row.appeal_circumstance,
          callToActions: row.call_to_actions ?? [],
          maxBankAccounts: row.max_bank_accounts,
        }
      : null;
  }

  public async updateProfile(params: {
    campaignId: string;
    actorId: string;
    profile: Omit<ICharityProjectProfile, 'maxBankAccounts'>;
  }): Promise<void> {
    await this.manager.query(
      `UPDATE campaigns
       SET appeal_purpose = $2, appeal_audience = $3, appeal_circumstance = $4,
           call_to_actions = $5::text[], updated_at = now()
       WHERE global_id = $1 AND deleted_at IS NULL`,
      [
        params.campaignId,
        params.profile.appealPurpose,
        params.profile.appealAudience,
        params.profile.appealCircumstance,
        params.profile.callToActions,
      ],
    );
  }

  public async setMaxBankAccounts(params: {
    campaignId: string;
    actorId: string;
    maxBankAccounts: number | null;
    reason: string;
  }): Promise<boolean> {
    return this.manager.transaction(async (manager) => {
      const before = await manager.query<
        { max_bank_accounts: number | null }[]
      >(
        `SELECT max_bank_accounts FROM campaigns
         WHERE global_id = $1 AND deleted_at IS NULL FOR UPDATE`,
        [params.campaignId],
      );
      if (before.length === 0) return false;
      await manager.query(
        `UPDATE campaigns SET max_bank_accounts = $2, updated_at = now() WHERE global_id = $1`,
        [params.campaignId, params.maxBankAccounts],
      );
      await manager.query(
        `INSERT INTO admin_audit_logs
           (actor_user_id, action, resource_type, resource_id, before_json, after_json, reason)
         VALUES ($1, 'CHARITY_CAMPAIGN_LIMITS', 'CHARITY_CAMPAIGN', $2, $3::jsonb, $4::jsonb, $5)`,
        [
          params.actorId,
          params.campaignId,
          JSON.stringify({ maxBankAccounts: before[0].max_bank_accounts }),
          JSON.stringify({ maxBankAccounts: params.maxBankAccounts }),
          params.reason,
        ],
      );
      return true;
    });
  }

  // ── Nháp và giai đoạn ──────────────────────────────────────────────────

  public async submitDraft(params: {
    campaignId: string;
    actorId: string;
    approvalStatus: 'APPROVED' | 'PENDING_APPROVAL';
  }): Promise<SubmitCharityDraftOutcome> {
    const approved = params.approvalStatus === 'APPROVED';
    const rows = await updateReturning<{ global_id: string }>(
      this.manager,
      `WITH updated AS (
         UPDATE campaigns
            SET submitted_at = now(),
                approval_status = CASE WHEN $3 THEN 'APPROVED' ELSE 'PENDING_APPROVAL' END,
                approved_at = CASE WHEN $3 THEN now() END,
                approved_by = CASE WHEN $3 THEN $2::uuid END,
                operation_stage = CASE WHEN $3 THEN 'EXECUTION' ELSE 'PLAN' END,
                updated_at = now()
          WHERE global_id = $1 AND submitted_at IS NULL AND deleted_at IS NULL
          RETURNING global_id
       ), stage_event AS (
         INSERT INTO campaign_stage_events (campaign_id, from_stage, to_stage, actor_id, reason)
         SELECT global_id, 'PLAN', 'EXECUTION', $2::uuid, 'Công khai ngay khi gửi duyệt'
         FROM updated WHERE $3
       )
       SELECT global_id FROM updated`,
      [params.campaignId, params.actorId, approved],
    );
    return rows.length > 0 ? 'SUBMITTED' : 'NOT_DRAFT';
  }

  public async moveStage(params: {
    campaignId: string;
    from: CharityOperationStage;
    to: CharityOperationStage;
    actorId: string | null;
    reason: string | null;
  }): Promise<MoveCharityStageOutcome> {
    // Điều kiện `operation_stage = from` trong chính câu UPDATE: job và ban tổ chức cùng
    // chuyển một lúc thì lượt sau thấy STALE chứ không ghi đè.
    const rows = await updateReturning<{ global_id: string }>(
      this.manager,
      `WITH updated AS (
         UPDATE campaigns SET operation_stage = $3, updated_at = now()
          WHERE global_id = $1 AND operation_stage = $2 AND deleted_at IS NULL
          RETURNING global_id
       ), stage_event AS (
         INSERT INTO campaign_stage_events (campaign_id, from_stage, to_stage, actor_id, reason)
         SELECT global_id, $4, $5, $6::uuid, $7 FROM updated
       )
       SELECT global_id FROM updated`,
      [
        params.campaignId,
        params.from,
        params.to,
        // Truyền lại from/to làm tham số riêng cho INSERT: dùng chung `$2` vừa so với cột
        // `varchar` vừa ghi vào cột khác là chỗ Postgres suy kiểu lệch (42P08).
        params.from,
        params.to,
        params.actorId,
        params.reason,
      ],
    );
    return rows.length > 0 ? 'MOVED' : 'STALE';
  }

  public async listStageEvents(
    campaignId: string,
  ): Promise<ICharityStageEvent[]> {
    const rows = await this.manager.query<
      {
        from_stage: CharityOperationStage;
        to_stage: CharityOperationStage;
        actor_id: string | null;
        reason: string | null;
        created_at: Date;
      }[]
    >(
      `SELECT from_stage, to_stage, actor_id, reason, created_at
       FROM campaign_stage_events WHERE campaign_id = $1 ORDER BY created_at, id`,
      [campaignId],
    );
    return rows.map((row) => ({
      fromStage: row.from_stage,
      toStage: row.to_stage,
      actorId: row.actor_id,
      reason: row.reason,
      createdAt: row.created_at,
    }));
  }

  public async listStageCandidates(limit: number): Promise<
    {
      campaignId: string;
      stored: CharityOperationStage;
      distribution: { startsAt: Date; endsAt: Date } | null;
      endTime: Date;
    }[]
  > {
    const rows = await this.manager.query<
      {
        global_id: string;
        operation_stage: CharityOperationStage;
        end_time: Date;
        starts_at: Date | null;
        ends_at: Date | null;
      }[]
    >(
      `SELECT campaign.global_id, campaign.operation_stage, campaign.end_time,
              phase.starts_at, phase.ends_at
       FROM campaigns campaign
       LEFT JOIN campaign_phases phase
         ON phase.campaign_id = campaign.global_id AND phase.phase = 'DISTRIBUTION'
       WHERE campaign.operation_stage IN ('EXECUTION', 'EVENT')
         AND campaign.deleted_at IS NULL
         AND (COALESCE(phase.ends_at, campaign.end_time) <= now()
              OR (campaign.operation_stage = 'EXECUTION' AND phase.starts_at <= now()))
       ORDER BY campaign.id
       LIMIT $1`,
      [limit],
    );
    return rows.map((row) => ({
      campaignId: row.global_id,
      stored: row.operation_stage,
      endTime: row.end_time,
      distribution:
        row.starts_at && row.ends_at
          ? { startsAt: row.starts_at, endsAt: row.ends_at }
          : null,
    }));
  }

  // ── Đơn vị liên quan ───────────────────────────────────────────────────

  public async listParties(campaignId: string): Promise<ICharityParty[]> {
    const rows = await this.manager.query<IPartyRow[]>(
      `SELECT global_id, role, name, address, phone, email, hotline, pic_name, pic_phone,
              pic_user_id, beneficiary_kind, is_appeal_subject, evidence_urls, updated_at
       FROM campaign_parties WHERE campaign_id = $1
       ORDER BY role, sort_order, id`,
      [campaignId],
    );
    return rows.map(toParty);
  }

  public async replaceParties(params: {
    campaignId: string;
    actorId: string;
    parties: ICharityPartyInput[];
  }): Promise<ICharityParty[]> {
    await this.manager.transaction(async (manager) => {
      const keep = params.parties
        .map((party) => party.partyId)
        .filter((id): id is string => Boolean(id));
      // Dòng người thụ hưởng của kêu gọi cá nhân KHÔNG bao giờ bị xoá ở đây — nó đi đường
      // riêng (đồng ý, xác minh) và là dữ liệu riêng tư.
      await manager.query(
        `DELETE FROM campaign_parties
         WHERE campaign_id = $1 AND NOT is_appeal_subject
           AND NOT (global_id = ANY($2::uuid[]))`,
        [params.campaignId, keep],
      );
      for (const [index, party] of params.parties.entries()) {
        const values = [
          params.campaignId,
          party.role,
          party.name,
          party.address,
          party.phone,
          party.email,
          party.hotline,
          party.picName,
          party.picPhone,
          party.picUserId,
          party.beneficiaryKind,
          JSON.stringify(party.evidenceUrls),
          index,
          params.actorId,
        ];
        if (party.partyId) {
          const updated = await updateReturning<{ global_id: string }>(
            manager,
            `UPDATE campaign_parties
             SET role = $2, name = $3, address = $4, phone = $5, email = $6, hotline = $7,
                 pic_name = $8, pic_phone = $9, pic_user_id = $10, beneficiary_kind = $11,
                 evidence_urls = $12::jsonb, sort_order = $13, updated_by = $14,
                 updated_at = now()
             WHERE campaign_id = $1 AND global_id = $15 AND NOT is_appeal_subject
             RETURNING global_id`,
            [...values, party.partyId],
          );
          if (updated.length > 0) continue;
        }
        await manager.query(
          `INSERT INTO campaign_parties
             (campaign_id, role, name, address, phone, email, hotline, pic_name, pic_phone,
              pic_user_id, beneficiary_kind, evidence_urls, sort_order, updated_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13, $14)`,
          values,
        );
      }
    });
    return this.listParties(params.campaignId);
  }

  // ── Tài khoản ngân hàng ────────────────────────────────────────────────

  public async listBankAccounts(
    campaignId: string,
  ): Promise<ICharityBankAccount[]> {
    const rows = await this.manager.query<IBankRow[]>(
      `SELECT global_id, label, bank_name, account_no, account_name, valid_from, valid_to,
              close_reason
       FROM campaign_bank_accounts WHERE campaign_id = $1
       ORDER BY (valid_to IS NULL) DESC, valid_from DESC, id DESC`,
      [campaignId],
    );
    return rows.map(toBank);
  }

  public async addBankAccount(params: {
    campaignId: string;
    actorId: string;
    account: ICharityBankAccountInput;
    replacesAccountId: string | null;
    replaceReason: string | null;
    limit: number;
  }): Promise<AddCharityBankAccountOutcome> {
    return this.manager.transaction(async (manager) => {
      // Khoá HÀNG DỰ ÁN rồi mới đếm: hai lượt thêm song song không cùng lọt giới hạn.
      await manager.query(
        `SELECT 1 FROM campaigns WHERE global_id = $1 FOR UPDATE`,
        [params.campaignId],
      );
      if (params.replacesAccountId) {
        const closed = await updateReturning<{ global_id: string }>(
          manager,
          `UPDATE campaign_bank_accounts
           SET valid_to = now(), close_reason = $3, closed_by = $4
           WHERE campaign_id = $1 AND global_id = $2 AND valid_to IS NULL
           RETURNING global_id`,
          [
            params.campaignId,
            params.replacesAccountId,
            params.replaceReason ?? 'Thay bằng tài khoản mới',
            params.actorId,
          ],
        );
        if (closed.length === 0) return { status: 'REPLACED_NOT_FOUND' };
      }
      const [{ live }] = await manager.query<{ live: number }[]>(
        `SELECT count(*)::int AS live FROM campaign_bank_accounts
         WHERE campaign_id = $1 AND valid_to IS NULL`,
        [params.campaignId],
      );
      if (live >= params.limit)
        return { status: 'LIMIT_REACHED', limit: params.limit };
      const [row] = await manager.query<IBankRow[]>(
        `INSERT INTO campaign_bank_accounts
           (campaign_id, label, bank_name, account_no, account_name, created_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING global_id, label, bank_name, account_no, account_name, valid_from,
                   valid_to, close_reason`,
        [
          params.campaignId,
          params.account.label,
          params.account.bankName,
          params.account.accountNo,
          params.account.accountName,
          params.actorId,
        ],
      );
      return { status: 'CREATED', account: toBank(row) };
    });
  }

  public async closeBankAccount(params: {
    campaignId: string;
    accountId: string;
    actorId: string;
    reason: string;
  }): Promise<boolean> {
    const rows = await updateReturning<{ global_id: string }>(
      this.manager,
      `UPDATE campaign_bank_accounts
       SET valid_to = now(), close_reason = $3, closed_by = $4
       WHERE campaign_id = $1 AND global_id = $2 AND valid_to IS NULL
       RETURNING global_id`,
      [params.campaignId, params.accountId, params.reason, params.actorId],
    );
    return rows.length > 0;
  }

  // ── Ban tổ chức ────────────────────────────────────────────────────────

  public async listTeam(campaignId: string): Promise<ICharityTeamMember[]> {
    const rows = await this.manager.query<
      {
        global_id: string;
        role: CharityTeamRole;
        display_name: string;
        address: string | null;
        phone: string | null;
        email: string | null;
        position: string | null;
        user_id: string | null;
        username: string | null;
        bank_account_id: string | null;
      }[]
    >(
      `SELECT member.global_id, member.role, member.display_name, member.address,
              member.phone, member.email, member.position, member.user_id,
              account.username, member.bank_account_id
       FROM campaign_team_members member
       LEFT JOIN users account ON account.global_id = member.user_id
       WHERE member.campaign_id = $1
       ORDER BY member.role, member.sort_order, member.id`,
      [campaignId],
    );
    return rows.map((row) => ({
      memberId: row.global_id,
      role: row.role,
      displayName: row.display_name,
      address: row.address,
      phone: row.phone,
      email: row.email,
      position: row.position,
      userId: row.user_id,
      username: row.username,
      bankAccountId: row.bank_account_id,
    }));
  }

  public async replaceTeam(params: {
    campaignId: string;
    actorId: string;
    members: ICharityTeamMemberInput[];
  }): Promise<ICharityTeamMember[]> {
    await this.manager.transaction(async (manager) => {
      const keep = params.members
        .map((member) => member.memberId)
        .filter((id): id is string => Boolean(id));
      await manager.query(
        `DELETE FROM campaign_team_members
         WHERE campaign_id = $1 AND NOT (global_id = ANY($2::uuid[]))`,
        [params.campaignId, keep],
      );
      for (const [index, member] of params.members.entries()) {
        const values = [
          params.campaignId,
          member.role,
          member.displayName,
          member.address,
          member.phone,
          member.email,
          member.position,
          member.userId,
          member.bankAccountId,
          index,
          params.actorId,
        ];
        if (member.memberId) {
          const updated = await updateReturning<{ global_id: string }>(
            manager,
            `UPDATE campaign_team_members
             SET role = $2, display_name = $3, address = $4, phone = $5, email = $6,
                 position = $7, user_id = $8, bank_account_id = $9, sort_order = $10,
                 updated_by = $11, updated_at = now()
             WHERE campaign_id = $1 AND global_id = $12
             RETURNING global_id`,
            [...values, member.memberId],
          );
          if (updated.length > 0) continue;
        }
        await manager.query(
          `INSERT INTO campaign_team_members
             (campaign_id, role, display_name, address, phone, email, position, user_id,
              bank_account_id, sort_order, updated_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          values,
        );
      }
    });
    return this.listTeam(params.campaignId);
  }

  // ── Tiến độ 4 bước ─────────────────────────────────────────────────────

  public async listPhases(campaignId: string): Promise<ICharityPhase[]> {
    const rows = await this.manager.query<
      {
        phase: CharityPhaseKey;
        starts_at: Date;
        ends_at: Date;
        pic_name: string | null;
        pic_user_id: string | null;
        hotline: string | null;
        delivery_method: CharityDeliveryMethod | null;
        report_mode: CharityReportMode | null;
      }[]
    >(
      `SELECT phase, starts_at, ends_at, pic_name, pic_user_id, hotline, delivery_method,
              report_mode
       FROM campaign_phases WHERE campaign_id = $1
       ORDER BY array_position(ARRAY['PLANNING', 'PREPARATION', 'DISTRIBUTION', 'REPORTING'], phase::text)`,
      [campaignId],
    );
    return rows.map((row) => ({
      phase: row.phase,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      picName: row.pic_name,
      picUserId: row.pic_user_id,
      hotline: row.hotline,
      deliveryMethod: row.delivery_method,
      reportMode: row.report_mode,
    }));
  }

  public async replacePhases(params: {
    campaignId: string;
    actorId: string;
    phases: ICharityPhase[];
  }): Promise<ICharityPhase[]> {
    await this.manager.transaction(async (manager) => {
      await manager.query(
        `DELETE FROM campaign_phases WHERE campaign_id = $1`,
        [params.campaignId],
      );
      for (const phase of params.phases)
        await manager.query(
          `INSERT INTO campaign_phases
             (campaign_id, phase, starts_at, ends_at, pic_name, pic_user_id, hotline,
              delivery_method, report_mode, updated_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            params.campaignId,
            phase.phase,
            phase.startsAt,
            phase.endsAt,
            phase.picName,
            phase.picUserId,
            phase.hotline,
            phase.deliveryMethod,
            phase.reportMode,
            params.actorId,
          ],
        );
    });
    return this.listPhases(params.campaignId);
  }

  // ── Hiện vật ───────────────────────────────────────────────────────────

  public async listItemNeeds(campaignId: string): Promise<ICharityItemNeed[]> {
    const rows = await this.manager.query<
      {
        global_id: string;
        item_name: string;
        unit: string;
        target_quantity: number;
        accepted_quantity: number;
        received_quantity: number;
        is_active: boolean;
        unit_price: string | null;
        estimated_value: string | null;
        item_condition: CharityItemCondition | null;
        condition_note: string | null;
        supply_source: CharitySupplySource | null;
        intake_deadline: Date | null;
        dropoff_address: string | null;
        delivery_instruction: string | null;
        receiver_name: string | null;
        receiver_phone: string | null;
        intake_status: CharityOpenClosedStatus;
        pending_quantity: string | number;
        external_quantity: string | number;
      }[]
    >(
      `SELECT need.global_id, need.item_name, need.unit, need.target_quantity,
              need.accepted_quantity, need.received_quantity, need.is_active,
              need.unit_price, need.estimated_value, need.item_condition,
              need.condition_note, need.supply_source, need.intake_deadline,
              need.dropoff_address, need.delivery_instruction, need.receiver_name,
              need.receiver_phone, need.intake_status,
              COALESCE((SELECT SUM(item.offered_quantity)
                FROM campaign_contribution_items item
                JOIN campaign_contributions contribution
                  ON contribution.global_id = item.contribution_id
                WHERE item.need_item_id = need.global_id
                  AND contribution.status = 'PENDING_REVIEW'), 0) AS pending_quantity,
              COALESCE((SELECT SUM(external.quantity)
                FROM campaign_external_contributions external
                WHERE external.need_item_id = need.global_id
                  AND external.status = 'ACTIVE'), 0) AS external_quantity
       FROM campaign_need_items need
       WHERE need.campaign_id = $1
       ORDER BY need.sort_order, need.id`,
      [campaignId],
    );
    return rows.map((row) => {
      const targetQuantity = num(row.target_quantity);
      const approvedQuantity = num(row.accepted_quantity);
      const received = num(row.received_quantity);
      // `received_quantity` gộp cả nhận trong app lẫn nhập ngoài app.
      const receivedExternalQuantity = num(row.external_quantity);
      return {
        needItemId: row.global_id,
        itemName: row.item_name,
        unit: row.unit,
        targetQuantity,
        registeredQuantity: num(row.pending_quantity),
        approvedQuantity,
        receivedInAppQuantity: Math.max(0, received - receivedExternalQuantity),
        receivedExternalQuantity,
        remainingQuantity: Math.max(
          0,
          targetQuantity - approvedQuantity - received,
        ),
        isActive: row.is_active,
        unitPrice: row.unit_price === null ? null : num(row.unit_price),
        estimatedValue:
          row.estimated_value === null ? null : num(row.estimated_value),
        itemCondition: row.item_condition,
        conditionNote: row.condition_note,
        supplySource: row.supply_source,
        intakeDeadline: row.intake_deadline,
        dropoffAddress: row.dropoff_address,
        deliveryInstruction: row.delivery_instruction,
        receiverName: row.receiver_name,
        receiverPhone: row.receiver_phone,
        intakeStatus: row.intake_status,
      };
    });
  }

  public async updateItemNeedProfile(params: {
    campaignId: string;
    needItemId: string;
    profile: ICharityNeedItemProfileInput;
  }): Promise<boolean> {
    const profile = params.profile;
    const rows = await updateReturning<{ global_id: string }>(
      this.manager,
      `UPDATE campaign_need_items
       SET unit_price = $3, estimated_value = $4, item_condition = $5, condition_note = $6,
           supply_source = $7, intake_deadline = $8, dropoff_address = $9,
           delivery_instruction = $10, receiver_name = $11, receiver_phone = $12,
           intake_status = $13, updated_at = now()
       WHERE campaign_id = $1 AND global_id = $2
       RETURNING global_id`,
      [
        params.campaignId,
        params.needItemId,
        profile.unitPrice,
        profile.estimatedValue,
        profile.itemCondition,
        profile.conditionNote,
        profile.supplySource,
        profile.intakeDeadline,
        profile.dropoffAddress,
        profile.deliveryInstruction,
        profile.receiverName,
        profile.receiverPhone,
        profile.intakeStatus,
      ],
    );
    return rows.length > 0;
  }

  // ── Tiền ───────────────────────────────────────────────────────────────

  public async listFundingNeeds(
    campaignId: string,
  ): Promise<ICharityFundingNeed[]> {
    const rows = await this.manager.query<IFundingRow[]>(
      `SELECT ${FundingColumns} FROM campaign_funding_needs funding
       WHERE funding.campaign_id = $1 ORDER BY funding.sort_order, funding.id`,
      [campaignId],
    );
    return rows.map(toFunding);
  }

  public async createFundingNeed(params: {
    campaignId: string;
    actorId: string;
    need: ICharityFundingNeedInput;
  }): Promise<ICharityFundingNeed> {
    const need = params.need;
    const [row] = await this.manager.query<IFundingRow[]>(
      `INSERT INTO campaign_funding_needs AS funding
         (campaign_id, title, description, beneficiary_party_id, receiving_unit,
          bank_account_id, target_amount, deadline, sort_order, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING ${FundingColumns}`,
      [
        params.campaignId,
        need.title,
        need.description,
        need.beneficiaryPartyId,
        need.receivingUnit,
        need.bankAccountId,
        need.targetAmount,
        need.deadline,
        need.sortOrder,
        params.actorId,
      ],
    );
    return toFunding(row);
  }

  public async updateFundingNeed(params: {
    campaignId: string;
    fundingNeedId: string;
    actorId: string;
    need: ICharityFundingNeedInput;
    confirmedAmount: number;
    externalAmount: number;
    status: CharityOpenClosedStatus;
  }): Promise<ICharityFundingNeed | null> {
    const need = params.need;
    const rows = await updateReturning<IFundingRow>(
      this.manager,
      `UPDATE campaign_funding_needs AS funding
       SET title = $3, description = $4, beneficiary_party_id = $5, receiving_unit = $6,
           bank_account_id = $7, target_amount = $8, deadline = $9, sort_order = $10,
           confirmed_amount = $11, external_amount = $12, status = $13,
           updated_by = $14, updated_at = now()
       WHERE funding.campaign_id = $1 AND funding.global_id = $2
       RETURNING ${FundingColumns}`,
      [
        params.campaignId,
        params.fundingNeedId,
        need.title,
        need.description,
        need.beneficiaryPartyId,
        need.receivingUnit,
        need.bankAccountId,
        need.targetAmount,
        need.deadline,
        need.sortOrder,
        params.confirmedAmount,
        params.externalAmount,
        params.status,
        params.actorId,
      ],
    );
    return rows.length > 0 ? toFunding(rows[0]) : null;
  }

  // ── Nhân lực ───────────────────────────────────────────────────────────

  public async listVolunteerNeeds(
    campaignId: string,
  ): Promise<ICharityVolunteerNeed[]> {
    const rows = await this.manager.query<IVolunteerRow[]>(
      `SELECT ${VolunteerColumns} FROM campaign_volunteer_needs volunteer
       WHERE volunteer.campaign_id = $1 ORDER BY volunteer.sort_order, volunteer.id`,
      [campaignId],
    );
    return rows.map(toVolunteer);
  }

  private async readVolunteer(
    manager: EntityManager,
    volunteerNeedId: string,
  ): Promise<ICharityVolunteerNeed> {
    const [row] = await manager.query<IVolunteerRow[]>(
      `SELECT ${VolunteerColumns} FROM campaign_volunteer_needs volunteer
       WHERE volunteer.global_id = $1`,
      [volunteerNeedId],
    );
    return toVolunteer(row);
  }

  public async createVolunteerNeed(params: {
    campaignId: string;
    actorId: string;
    need: ICharityVolunteerNeedInput;
  }): Promise<ICharityVolunteerNeed> {
    const need = params.need;
    const [row] = await this.manager.query<{ global_id: string }[]>(
      `INSERT INTO campaign_volunteer_needs
         (campaign_id, title, description, requirements, needed_count, starts_at, ends_at,
          location_label, sort_order, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING global_id`,
      [
        params.campaignId,
        need.title,
        need.description,
        need.requirements,
        need.neededCount,
        need.startsAt,
        need.endsAt,
        need.locationLabel,
        need.sortOrder,
        params.actorId,
      ],
    );
    return this.readVolunteer(this.manager, row.global_id);
  }

  public async updateVolunteerNeed(params: {
    campaignId: string;
    volunteerNeedId: string;
    actorId: string;
    need: ICharityVolunteerNeedInput;
    status: CharityVolunteerNeedStatus;
  }): Promise<ICharityVolunteerNeed | null> {
    const need = params.need;
    const rows = await updateReturning<{ global_id: string }>(
      this.manager,
      `UPDATE campaign_volunteer_needs
       SET title = $3, description = $4, requirements = $5, needed_count = $6,
           starts_at = $7, ends_at = $8, location_label = $9, sort_order = $10,
           status = $11, updated_by = $12, updated_at = now()
       WHERE campaign_id = $1 AND global_id = $2
       RETURNING global_id`,
      [
        params.campaignId,
        params.volunteerNeedId,
        need.title,
        need.description,
        need.requirements,
        need.neededCount,
        need.startsAt,
        need.endsAt,
        need.locationLabel,
        need.sortOrder,
        params.status,
        params.actorId,
      ],
    );
    return rows.length > 0
      ? this.readVolunteer(this.manager, params.volunteerNeedId)
      : null;
  }

  public async registerVolunteer(params: {
    campaignId: string;
    volunteerNeedId: string;
    userId: string;
    note: string | null;
  }): Promise<RegisterCharityVolunteerOutcome> {
    return this.manager.transaction(async (manager) => {
      // Khoá HÀNG VỊ TRÍ: hai người đăng ký suất cuối cùng lúc thì người sau thấy FULL.
      const [need] = await manager.query<
        { status: string; needed_count: number }[]
      >(
        `SELECT status, needed_count FROM campaign_volunteer_needs
         WHERE campaign_id = $1 AND global_id = $2 FOR UPDATE`,
        [params.campaignId, params.volunteerNeedId],
      );
      if (!need) return 'NOT_FOUND';
      if (need.status !== 'OPEN') return 'CLOSED';

      const [existing] = await manager.query<unknown[]>(
        `SELECT 1 FROM campaign_volunteer_registrations
         WHERE volunteer_need_id = $1 AND user_id = $2 AND status <> 'CANCELLED'`,
        [params.volunteerNeedId, params.userId],
      );
      if (existing) return 'ALREADY_REGISTERED';

      // "Chỉ người có ít nhất một hỗ trợ hợp lệ/được xác nhận" (§3.11): một đóng góp của
      // chính dự án này đã được ban tổ chức chấp nhận (toàn phần hay một phần).
      const [eligible] = await manager.query<unknown[]>(
        `SELECT 1 FROM campaign_contributions
         WHERE campaign_id = $1 AND contributor_id = $2
           AND status IN ('ACCEPTED', 'PARTIALLY_ACCEPTED')
         LIMIT 1`,
        [params.campaignId, params.userId],
      );
      if (!eligible) return 'NOT_ELIGIBLE';

      const [{ taken }] = await manager.query<{ taken: number }[]>(
        `SELECT count(*)::int AS taken FROM campaign_volunteer_registrations
         WHERE volunteer_need_id = $1 AND status <> 'CANCELLED'`,
        [params.volunteerNeedId],
      );
      if (taken >= need.needed_count) return 'FULL';

      await manager.query(
        `INSERT INTO campaign_volunteer_registrations (volunteer_need_id, user_id, note)
         VALUES ($1, $2, $3)`,
        [params.volunteerNeedId, params.userId, params.note],
      );
      return 'REGISTERED';
    });
  }

  public async cancelVolunteer(params: {
    campaignId: string;
    volunteerNeedId: string;
    userId: string;
  }): Promise<boolean> {
    // Huỷ được cả khi sự kiện đang diễn ra (§3.11).
    const rows = await updateReturning<{ id: string }>(
      this.manager,
      `UPDATE campaign_volunteer_registrations registration
       SET status = 'CANCELLED', cancelled_at = now(), confirmed_at = NULL
       FROM campaign_volunteer_needs need
       WHERE need.global_id = registration.volunteer_need_id
         AND need.campaign_id = $1 AND registration.volunteer_need_id = $2
         AND registration.user_id = $3 AND registration.status <> 'CANCELLED'
       RETURNING registration.id`,
      [params.campaignId, params.volunteerNeedId, params.userId],
    );
    return rows.length > 0;
  }

  public async confirmVolunteer(params: {
    campaignId: string;
    volunteerNeedId: string;
    userId: string;
    actorId: string;
  }): Promise<boolean> {
    const rows = await updateReturning<{ id: string }>(
      this.manager,
      `UPDATE campaign_volunteer_registrations registration
       SET status = 'CONFIRMED', confirmed_at = now(), confirmed_by = $4
       FROM campaign_volunteer_needs need
       WHERE need.global_id = registration.volunteer_need_id
         AND need.campaign_id = $1 AND registration.volunteer_need_id = $2
         AND registration.user_id = $3 AND registration.status = 'REGISTERED'
       RETURNING registration.id`,
      [
        params.campaignId,
        params.volunteerNeedId,
        params.userId,
        params.actorId,
      ],
    );
    return rows.length > 0;
  }

  private async listRegistrations(
    campaignId: string,
    userId: string | null,
  ): Promise<ICharityVolunteerRegistration[]> {
    const rows = await this.manager.query<
      {
        volunteer_need_id: string;
        user_id: string;
        username: string;
        status: CharityVolunteerRegistrationStatus;
        note: string | null;
        created_at: Date;
      }[]
    >(
      `SELECT registration.volunteer_need_id, registration.user_id, account.username,
              registration.status, registration.note, registration.created_at
       FROM campaign_volunteer_registrations registration
       JOIN campaign_volunteer_needs need ON need.global_id = registration.volunteer_need_id
       JOIN users account ON account.global_id = registration.user_id
       WHERE need.campaign_id = $1 AND ($2::uuid IS NULL OR registration.user_id = $2::uuid)
       ORDER BY registration.created_at, registration.id`,
      [campaignId, userId],
    );
    return rows.map((row) => ({
      volunteerNeedId: row.volunteer_need_id,
      userId: row.user_id,
      username: row.username,
      status: row.status,
      note: row.note,
      createdAt: row.created_at,
    }));
  }

  public listVolunteerRegistrations(
    campaignId: string,
  ): Promise<ICharityVolunteerRegistration[]> {
    return this.listRegistrations(campaignId, null);
  }

  public findMyVolunteerRegistrations(
    campaignId: string,
    userId: string,
  ): Promise<ICharityVolunteerRegistration[]> {
    return this.listRegistrations(campaignId, userId);
  }

  // ── Trạng thái mục + form mở ──────────────────────────────────────────

  public async listSectionStates(
    campaignId: string,
  ): Promise<ICharitySectionState[]> {
    const rows = await this.manager.query<
      {
        section_key: CharityOperationStage;
        saved_at: Date | null;
        published_at: Date | null;
        published_snapshot: unknown;
        updated_by: string | null;
      }[]
    >(
      `SELECT section_key, saved_at, published_at, published_snapshot, updated_by
       FROM campaign_section_states WHERE campaign_id = $1`,
      [campaignId],
    );
    return rows.map((row) => ({
      sectionKey: row.section_key,
      savedAt: row.saved_at,
      publishedAt: row.published_at,
      publishedSnapshot: row.published_snapshot,
      updatedBy: row.updated_by,
    }));
  }

  public async saveSection(params: {
    campaignId: string;
    sectionKey: CharityOperationStage;
    actorId: string;
  }): Promise<void> {
    await this.manager.query(
      `INSERT INTO campaign_section_states (campaign_id, section_key, saved_at, updated_by)
       VALUES ($1, $2, now(), $3)
       ON CONFLICT (campaign_id, section_key)
       DO UPDATE SET saved_at = now(), updated_by = EXCLUDED.updated_by`,
      [params.campaignId, params.sectionKey, params.actorId],
    );
  }

  public async publishSection(params: {
    campaignId: string;
    sectionKey: CharityOperationStage;
    actorId: string;
    snapshot: unknown;
  }): Promise<void> {
    await this.manager.query(
      `INSERT INTO campaign_section_states
         (campaign_id, section_key, saved_at, published_at, published_snapshot, updated_by)
       VALUES ($1, $2, now(), now(), $3::jsonb, $4)
       ON CONFLICT (campaign_id, section_key)
       DO UPDATE SET saved_at = now(), published_at = now(),
                     published_snapshot = EXCLUDED.published_snapshot,
                     updated_by = EXCLUDED.updated_by`,
      [
        params.campaignId,
        params.sectionKey,
        JSON.stringify(params.snapshot),
        params.actorId,
      ],
    );
  }

  public async listCustomSections(
    campaignId: string,
  ): Promise<ICharityCustomSection[]> {
    const rows = await this.manager.query<
      {
        global_id: string;
        parent_section: CharityOperationStage;
        title: string;
        visibility: CharityFieldVisibility;
        updated_at: Date;
        fields: {
          customFieldId: string;
          label: string;
          fieldType: CharityCustomFieldType;
          visibility: CharityFieldVisibility;
          required: boolean;
          options: string[];
          value: unknown;
        }[];
      }[]
    >(
      `SELECT section.global_id, section.parent_section, section.title, section.visibility,
              section.updated_at,
              COALESCE((SELECT json_agg(json_build_object(
                  'customFieldId', field.global_id, 'label', field.label,
                  'fieldType', field.field_type, 'visibility', field.visibility,
                  'required', field.required, 'options', field.options, 'value', field.value
                ) ORDER BY field.sort_order, field.id)
                FROM campaign_custom_fields field
                WHERE field.custom_section_id = section.global_id), '[]'::json) AS fields
       FROM campaign_custom_sections section
       WHERE section.campaign_id = $1
       ORDER BY section.parent_section, section.sort_order, section.id`,
      [campaignId],
    );
    return rows.map((row) => ({
      customSectionId: row.global_id,
      parentSection: row.parent_section,
      title: row.title,
      visibility: row.visibility,
      updatedAt: row.updated_at,
      fields: row.fields,
    }));
  }

  public async replaceCustomSections(params: {
    campaignId: string;
    actorId: string;
    sections: ICharityCustomSectionInput[];
  }): Promise<ICharityCustomSection[]> {
    await this.manager.transaction(async (manager) => {
      await manager.query(
        `DELETE FROM campaign_custom_sections WHERE campaign_id = $1`,
        [params.campaignId],
      );
      for (const [sectionIndex, section] of params.sections.entries()) {
        const [created] = await manager.query<{ global_id: string }[]>(
          `INSERT INTO campaign_custom_sections
             (campaign_id, parent_section, title, visibility, sort_order, updated_by)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING global_id`,
          [
            params.campaignId,
            section.parentSection,
            section.title,
            section.visibility,
            sectionIndex,
            params.actorId,
          ],
        );
        for (const [fieldIndex, field] of section.fields.entries())
          await manager.query(
            `INSERT INTO campaign_custom_fields
               (custom_section_id, label, field_type, visibility, required, options, value,
                sort_order, updated_by)
             VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9)`,
            [
              created.global_id,
              field.label,
              field.fieldType,
              field.visibility,
              field.required,
              JSON.stringify(field.options),
              field.value === undefined ? null : JSON.stringify(field.value),
              fieldIndex,
              params.actorId,
            ],
          );
      }
    });
    return this.listCustomSections(params.campaignId);
  }
}
