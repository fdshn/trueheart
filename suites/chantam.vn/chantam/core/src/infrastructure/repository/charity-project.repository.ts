import {
  AddCharityBankAccountOutcome,
  CharityPartyConsentStatus,
  ICharityBankAccount,
  ICharityBankAccountInput,
  ICharityCustomSection,
  ICharityCustomSectionInput,
  ICharityDistributionSettlement,
  ICharityFundingNeed,
  ICharityFundingNeedInput,
  ICharityItemNeed,
  ICharityNeedItemProfileInput,
  ICharityParty,
  ICharityPartyInput,
  ICharityPhase,
  ICharityProjectProfile,
  ICharityProjectRepository,
  ICharityRehearsal,
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
  AddCharityBeneficiaryBankAccountOutcome,
  CharityBeneficiaryKind,
  CharityCallToAction,
  CharityContributionType,
  CharityCustomFieldType,
  CharityDeliveryMethod,
  CharityDistributionMethod,
  CharityFieldVisibility,
  CharityItemCondition,
  CharityOpenClosedStatus,
  CharityOperationStage,
  CharityOrganizerReminderReason,
  CharityPartyRole,
  CharityPhaseKey,
  CharityRehearsalOutcome,
  CharityReportMode,
  CharityRevisionEntity,
  CharitySupplySource,
  CharityTeamRole,
  CharityVolunteerNeedStatus,
  CharityVolunteerRegistrationStatus,
  diffCharityRevisions,
  ICharityBeneficiaryBankAccount,
  ICharityBeneficiaryBankAccountInput,
  ICharityIntakeCounts,
  ICharityRehearsalChecklistItem,
  ICharityRevisionRow,
  minimumQuantityFor,
  normalizeRehearsalChecklist,
  stageRank,
} from '@chantam.vn/chantam.core-lib/models';
import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import {
  CampaignDistributionEvidenceOkSql,
  CampaignDistributionSettledSql,
  CampaignRehearsalReadySql,
} from './charity-distribution.sql';
import { recordCharityRevisions } from './charity-revision.writer';
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
  estimated_portions: number;
  estimated_amount: string | number;
  lat: number | null;
  lng: number | null;
  distribution_at: Date | null;
  consent_status: CharityPartyConsentStatus | null;
}

const PartyColumns = `global_id, role, name, address, phone, email, hotline, pic_name, pic_phone,
  pic_user_id, beneficiary_kind, is_appeal_subject, evidence_urls, updated_at,
  estimated_portions, estimated_amount,
  ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng,
  distribution_at, consent_status`;

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
  estimatedPortions: Number(row.estimated_portions),
  // bigint về đây là CHUỖI.
  estimatedAmount: num(row.estimated_amount),
  lat: row.lat,
  lng: row.lng,
  location:
    row.lat !== null && row.lng !== null
      ? { lat: row.lat, lng: row.lng }
      : null,
  distributionAt: row.distribution_at,
  consentStatus: row.consent_status,
});

interface IBankRow {
  global_id: string;
  label: string | null;
  bank_name: string;
  bank_bin: string | null;
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
  bankBin: row.bank_bin,
  accountNo: row.account_no,
  accountName: row.account_name,
  validFrom: row.valid_from,
  validTo: row.valid_to,
  closeReason: row.close_reason,
});

interface IBeneficiaryBankRow {
  global_id: string;
  holder_type: ICharityBeneficiaryBankAccount['holderType'];
  party_id: string | null;
  bank_name: string;
  account_no: string;
  account_name: string;
  valid_from: Date;
  valid_to: Date | null;
  close_reason: string | null;
  verified_at: Date | null;
  verified_by: string | null;
}

const BeneficiaryBankColumns = `global_id, holder_type, party_id, bank_name, account_no,
  account_name, valid_from, valid_to, close_reason, verified_at, verified_by`;

const toBeneficiaryBank = (
  row: IBeneficiaryBankRow,
): ICharityBeneficiaryBankAccount => ({
  accountId: row.global_id,
  holderType: row.holder_type,
  partyId: row.party_id,
  bankName: row.bank_name,
  accountNo: row.account_no,
  accountName: row.account_name,
  validFrom: row.valid_from,
  validTo: row.valid_to,
  closeReason: row.close_reason,
  verifiedAt: row.verified_at,
  verifiedBy: row.verified_by,
});

const FundingColumns = `funding.global_id, funding.title, funding.description,
  funding.beneficiary_party_id, funding.bank_account_id,
  funding.target_amount, funding.confirmed_amount, funding.external_amount, funding.deadline,
  funding.status, funding.sort_order, funding.updated_at`;

interface IFundingRow {
  global_id: string;
  title: string;
  description: string | null;
  beneficiary_party_id: string | null;
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
interface IRehearsalRow {
  campaign_id: string;
  checklist: Partial<ICharityRehearsalChecklistItem>[] | null;
  outcome: CharityRehearsalOutcome | null;
  reason: string | null;
  note: string | null;
  decided_by: string | null;
  decided_at: Date | null;
  phase_starts_at: Date | null;
  phase_ends_at: Date | null;
  pic_name: string | null;
  pic_user_id: string | null;
}

const toRehearsal = (row: IRehearsalRow): ICharityRehearsal => ({
  campaignId: row.campaign_id,
  checklist: normalizeRehearsalChecklist(row.checklist),
  outcome: row.outcome,
  reason: row.reason,
  note: row.note,
  decidedBy: row.decided_by,
  decidedAt: row.decided_at,
  phase:
    row.phase_starts_at && row.phase_ends_at
      ? {
          startsAt: row.phase_starts_at,
          endsAt: row.phase_ends_at,
          picName: row.pic_name,
          picUserId: row.pic_user_id,
        }
      : null,
});

interface ISettlementRow {
  distribution_method: CharityDistributionMethod | null;
  distribution_evidence_urls: string[] | null;
  tracking_code: string | null;
  account_id: string | null;
  verified: boolean | null;
  live: boolean | null;
  same_campaign: boolean | null;
}

@Injectable()
export class CharityProjectRepository implements ICharityProjectRepository {
  /**
   * `true` trên bản sao gắn với transaction của `tracked` — hàm ghi chạy thẳng, không bọc lần
   * nữa. Không phải tham số constructor: Nest sẽ cố tiêm nó.
   */
  private untracked = false;

  public constructor(
    @InjectEntityManager() private readonly manager: EntityManager,
  ) {}

  /**
   * Bản ghi THẲNG trong transaction của bên gọi — KHÔNG tự ghi lịch sử sửa. Dành cho bên gọi tự
   * gom lịch sử của nhiều loại entity thành một lượt (áp bản sửa đã duyệt, CR 22/11/2026).
   */
  public static untrackedWithin(
    manager: EntityManager,
  ): CharityProjectRepository {
    const repository = new CharityProjectRepository(manager);
    repository.untracked = true;
    return repository;
  }

  /**
   * Bọc một lượt sửa kế hoạch để ghi lịch sử sửa (§3.3) trong CÙNG transaction.
   *
   * Khoá hàng dự án trước: hai lượt sửa song song không chen ảnh chụp của nhau. Dự án chưa
   * duyệt (nháp, chờ duyệt) thì không ghi gì — trước khi duyệt chưa có "bản đã công bố" để tô
   * đỏ phần khác. Hàm ghi chạy trên một bản sao gắn transaction này; `transaction` lồng bên
   * trong nó thành SAVEPOINT nên vẫn nguyên khối.
   */
  private async tracked<T>(
    entity: CharityRevisionEntity,
    campaignId: string,
    actorId: string,
    write: (repo: CharityProjectRepository) => Promise<T>,
    reason: string | null = null,
  ): Promise<T> {
    return this.manager.transaction(async (manager) => {
      const scoped = new CharityProjectRepository(manager);
      scoped.untracked = true;
      const [campaign] = await manager.query<{ approval_status: string }[]>(
        `SELECT approval_status FROM campaigns WHERE global_id = $1 FOR UPDATE`,
        [campaignId],
      );
      const track = campaign?.approval_status === 'APPROVED';
      const before = track ? await scoped.revisionRows(entity, campaignId) : [];
      const result = await write(scoped);
      if (track)
        await recordCharityRevisions(manager, {
          campaignId,
          actorId,
          reason,
          drafts: diffCharityRevisions(
            entity,
            before,
            await scoped.revisionRows(entity, campaignId),
          ),
        });
      return result;
    });
  }

  /** Ảnh chụp công khai cho bên gọi tự ghi lịch sử trong transaction của mình. */
  public revisionSnapshot(
    entity: CharityRevisionEntity,
    campaignId: string,
  ): Promise<ICharityRevisionRow[]> {
    return this.revisionRows(entity, campaignId);
  }

  /** Ảnh chụp một loại entity để so (chính sách field ở `CharityRevisionPolicies`). */
  private async revisionRows(
    entity: CharityRevisionEntity,
    campaignId: string,
  ): Promise<ICharityRevisionRow[]> {
    const rows = <T extends object>(items: T[], id: (item: T) => string) =>
      items.map((item) => ({
        id: id(item),
        values: item as unknown as Record<string, unknown>,
      }));
    switch (entity) {
      case 'CAMPAIGN': {
        const profile = await this.getProfile(campaignId);
        return profile
          ? [
              {
                id: null,
                values: profile as unknown as Record<string, unknown>,
              },
            ]
          : [];
      }
      case 'PARTY':
        // Người thụ hưởng của kêu gọi cá nhân đi đường riêng và là dữ liệu riêng tư.
        return rows(
          (await this.listParties(campaignId)).filter(
            (party) => !party.isAppealSubject,
          ),
          (party) => party.partyId,
        );
      case 'TEAM':
        return rows(
          await this.listTeam(campaignId),
          (member) => member.memberId,
        );
      case 'PHASE':
        return rows(await this.listPhases(campaignId), (phase) => phase.phase);
      case 'NEED_ITEM':
        return rows(
          await this.listItemNeeds(campaignId),
          (need) => need.needItemId,
        );
      case 'BANK_ACCOUNT':
        return rows(
          await this.listBankAccounts(campaignId),
          (account) => account.accountId,
        );
      case 'FUNDING_NEED':
        return rows(
          await this.listFundingNeeds(campaignId),
          (need) => need.fundingNeedId,
        );
      case 'VOLUNTEER_NEED':
        return rows(
          await this.listVolunteerNeeds(campaignId),
          (need) => need.volunteerNeedId,
        );
      default:
        return [];
    }
  }

  public async findVisibleCampaignId(idOrSlug: string): Promise<string | null> {
    // `::text` như `findPublicByIdOrSlug`: slug không bao giờ là UUID hợp lệ và ngược lại.
    const [row] = await this.manager.query<{ global_id: string }[]>(
      `SELECT global_id FROM campaigns
       WHERE (global_id::text = $1 OR slug = $1)
         AND approval_status = 'APPROVED'
         AND deleted_at IS NULL
         AND (is_active OR end_time <= now())`,
      [idOrSlug],
    );
    return row?.global_id ?? null;
  }

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
        accepted_contribution_types: CharityContributionType[];
        max_bank_accounts: number | null;
      }[]
    >(
      `SELECT appeal_purpose, appeal_audience, appeal_circumstance, call_to_actions, accepted_contribution_types,
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
          acceptedContributionTypes: row.accepted_contribution_types ?? [],
          maxBankAccounts: row.max_bank_accounts,
        }
      : null;
  }

  public async updateProfile(params: {
    campaignId: string;
    actorId: string;
    profile: Omit<ICharityProjectProfile, 'maxBankAccounts'>;
  }): Promise<void> {
    if (!this.untracked)
      return this.tracked(
        'CAMPAIGN',
        params.campaignId,
        params.actorId,
        (repo) => repo.updateProfile(params),
      );
    await this.manager.query(
      `UPDATE campaigns
       SET appeal_purpose = $2, appeal_audience = $3, appeal_circumstance = $4,
           call_to_actions = $5::text[], accepted_contribution_types = $6::text[], updated_at = now()
       WHERE global_id = $1 AND deleted_at IS NULL`,
      [
        params.campaignId,
        params.profile.appealPurpose,
        params.profile.appealAudience,
        params.profile.appealCircumstance,
        params.profile.callToActions,
        params.profile.acceptedContributionTypes,
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

  public async intakeCounts(campaignId: string): Promise<ICharityIntakeCounts> {
    const [row] = await this.manager.query<
      {
        open_material_needs: string | number;
        open_funding_needs: string | number;
        open_support_needs: string | number;
        live_bank_accounts: string | number;
      }[]
    >(
      `SELECT
         (SELECT count(*) FROM campaign_need_items
          WHERE campaign_id = $1 AND is_active AND intake_status = 'OPEN') AS open_material_needs,
         (SELECT count(*) FROM campaign_funding_needs
          WHERE campaign_id = $1 AND status = 'OPEN') AS open_funding_needs,
         (SELECT count(*) FROM campaign_other_support_needs
          WHERE campaign_id = $1 AND status = 'OPEN') AS open_support_needs,
         (SELECT count(*) FROM campaign_bank_accounts
          WHERE campaign_id = $1 AND valid_to IS NULL) AS live_bank_accounts`,
      [campaignId],
    );
    return {
      openMaterialNeeds: num(row?.open_material_needs),
      openFundingNeeds: num(row?.open_funding_needs),
      openSupportNeeds: num(row?.open_support_needs),
      liveBankAccounts: num(row?.live_bank_accounts),
    };
  }

  // ── Tổng duyệt (CR 22/11/2026 §8) ──────────────────────────────────────

  public async getRehearsal(
    campaignId: string,
  ): Promise<ICharityRehearsal | null> {
    const [row] = await this.manager.query<IRehearsalRow[]>(
      `SELECT rehearsal.campaign_id, rehearsal.checklist, rehearsal.outcome,
              rehearsal.reason, rehearsal.note, rehearsal.decided_by, rehearsal.decided_at,
              phase.starts_at AS phase_starts_at, phase.ends_at AS phase_ends_at,
              phase.pic_name, phase.pic_user_id
         FROM campaign_rehearsals rehearsal
         LEFT JOIN campaign_phases phase
           ON phase.campaign_id = rehearsal.campaign_id AND phase.phase = 'REHEARSAL'
        WHERE rehearsal.campaign_id = $1`,
      [campaignId],
    );
    return row ? toRehearsal(row) : null;
  }

  public async saveRehearsal(params: {
    campaignId: string;
    actorId: string;
    checklist: ICharityRehearsalChecklistItem[];
    outcome: CharityRehearsalOutcome | undefined;
    reason: string | null;
    note: string | null;
  }): Promise<ICharityRehearsal> {
    const decide = params.outcome !== undefined;
    await this.manager.query(
      `INSERT INTO campaign_rehearsals
         (campaign_id, checklist, outcome, reason, note, decided_by, decided_at,
          updated_by, updated_at)
       VALUES ($1, $2::jsonb, $3::varchar, $4, $5,
               CASE WHEN $7::boolean THEN $6::uuid END,
               CASE WHEN $7::boolean THEN now() END, $6::uuid, now())
       ON CONFLICT (campaign_id) DO UPDATE
         SET checklist = EXCLUDED.checklist,
             outcome = CASE WHEN $7::boolean THEN EXCLUDED.outcome
                            ELSE campaign_rehearsals.outcome END,
             reason = CASE WHEN $7::boolean THEN EXCLUDED.reason
                           ELSE campaign_rehearsals.reason END,
             note = EXCLUDED.note,
             decided_by = CASE WHEN $7::boolean THEN EXCLUDED.decided_by
                               ELSE campaign_rehearsals.decided_by END,
             decided_at = CASE WHEN $7::boolean THEN EXCLUDED.decided_at
                               ELSE campaign_rehearsals.decided_at END,
             updated_by = EXCLUDED.updated_by,
             updated_at = now()`,
      [
        params.campaignId,
        JSON.stringify(params.checklist),
        params.outcome ?? null,
        params.reason,
        params.note,
        params.actorId,
        decide,
      ],
    );
    return (await this.getRehearsal(params.campaignId)) as ICharityRehearsal;
  }

  public async distributionSettlement(
    campaignId: string,
  ): Promise<ICharityDistributionSettlement> {
    const [row] = await this.manager.query<ISettlementRow[]>(
      `SELECT campaign.distribution_method, campaign.distribution_evidence_urls,
              detail.tracking_code,
              account.global_id AS account_id,
              account.verified_at IS NOT NULL AS verified,
              account.valid_to IS NULL AS live,
              account.campaign_id = campaign.global_id AS same_campaign
         FROM campaigns campaign
         LEFT JOIN campaign_distribution_private_details detail
           ON detail.campaign_id = campaign.global_id
         LEFT JOIN campaign_beneficiary_bank_accounts account
           ON account.global_id = detail.beneficiary_bank_account_id
        WHERE campaign.global_id = $1`,
      [campaignId],
    );
    return {
      method: row?.distribution_method ?? null,
      evidenceUrls: row?.distribution_evidence_urls ?? [],
      trackingCode: row?.tracking_code ?? null,
      beneficiaryAccount: row?.account_id
        ? {
            verified: row.verified === true,
            live: row.live === true,
            sameCampaign: row.same_campaign === true,
          }
        : null,
    };
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
       ), announcement AS (
         -- Sang Sự kiện trao / Tổng kết thì báo người tham gia, người góp, người quan tâm
         -- (§3.10). Ban tổ chức chuyển tay (kể cả lùi) cũng báo, kèm lý do (§3.2, chốt 05/11).
         INSERT INTO campaign_announcements (campaign_id, kind, payload, actor_id)
         SELECT global_id, 'STAGE_CHANGED',
                jsonb_build_object('from', $8::text, 'to', $9::text, 'reason', $11::text),
                $6::uuid
         FROM updated WHERE $10::boolean
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
        params.from,
        params.to,
        params.actorId !== null ||
          (stageRank(params.to) > stageRank(params.from) &&
            (params.to === 'EVENT' || params.to === 'SUMMARY')),
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
      rehearsalReady: boolean;
      distributionSettled: boolean;
    }[]
  > {
    // Chỉ hàng QUA được cổng mới chiếm chỗ trong LIMIT — hàng bị giữ (chưa READY, thiếu bằng
    // chứng) không bao giờ chặn hàng khác (CR 22/11/2026 §3.17g).
    const rows = await this.manager.query<
      {
        global_id: string;
        operation_stage: CharityOperationStage;
        end_time: Date;
        starts_at: Date | null;
        ends_at: Date | null;
        rehearsal_ready: boolean;
        distribution_settled: boolean;
      }[]
    >(
      `SELECT campaign.global_id, campaign.operation_stage, campaign.end_time,
              phase.starts_at, phase.ends_at,
              ${CampaignRehearsalReadySql('campaign')} AS rehearsal_ready,
              ${CampaignDistributionSettledSql('campaign')} AS distribution_settled
       FROM campaigns campaign
       LEFT JOIN campaign_phases phase
         ON phase.campaign_id = campaign.global_id AND phase.phase = 'DISTRIBUTION'
       WHERE campaign.deleted_at IS NULL
         AND (
           (campaign.operation_stage = 'EXECUTION'
              AND COALESCE(phase.starts_at, campaign.end_time) <= now()
              AND ${CampaignRehearsalReadySql('campaign')})
           OR
           (campaign.operation_stage = 'EVENT'
              AND COALESCE(phase.ends_at, campaign.end_time) <= now()
              AND ${CampaignDistributionSettledSql('campaign')})
         )
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
      rehearsalReady: row.rehearsal_ready === true,
      distributionSettled: row.distribution_settled === true,
    }));
  }

  public async listOverdueSummaries(
    limit: number,
    dayKey: string,
  ): Promise<{ campaignId: string; ownerId: string }[]> {
    const rows = await this.manager.query<
      { global_id: string; created_by: string }[]
    >(
      `SELECT campaign.global_id, campaign.created_by
       FROM campaigns campaign
       WHERE campaign.deleted_at IS NULL
         AND campaign.approval_status = 'APPROVED'
         AND campaign.is_active
         AND campaign.end_time <= now()
         AND campaign.created_by IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM campaign_summaries summary
                          WHERE summary.campaign_id = campaign.global_id
                            AND summary.published_at IS NOT NULL)
         AND NOT EXISTS (SELECT 1 FROM notifications reminder
                          WHERE reminder.idempotency_key =
                            'CHARITY_ORGANIZER_REMINDER:' || campaign.global_id::text
                            || ':SUMMARY_OVERDUE:' || $2::text)
       ORDER BY campaign.id
       LIMIT $1`,
      [limit, dayKey],
    );
    return rows.map((row) => ({
      campaignId: row.global_id,
      ownerId: row.created_by,
    }));
  }

  public async listBlockedStageCampaigns(
    limit: number,
    dayKey: string,
  ): Promise<
    {
      campaignId: string;
      ownerId: string;
      reason: CharityOrganizerReminderReason;
    }[]
  > {
    const rows = await this.manager.query<
      {
        global_id: string;
        created_by: string;
        reason: CharityOrganizerReminderReason;
      }[]
    >(
      `SELECT blocked.global_id, blocked.created_by, blocked.reason FROM (
       SELECT campaign.id, campaign.global_id, campaign.created_by,
              CASE
                WHEN campaign.operation_stage = 'EXECUTION' THEN 'REHEARSAL_NOT_READY'
                WHEN NOT ${CampaignDistributionEvidenceOkSql('campaign')}
                  THEN 'DISTRIBUTION_EVIDENCE_MISSING'
                ELSE 'BENEFICIARY_ACCOUNT_NOT_VERIFIED'
              END AS reason
       FROM campaigns campaign
       LEFT JOIN campaign_phases phase
         ON phase.campaign_id = campaign.global_id AND phase.phase = 'DISTRIBUTION'
       WHERE campaign.deleted_at IS NULL
         AND campaign.is_active
         AND campaign.created_by IS NOT NULL
         AND (
           (campaign.operation_stage = 'EXECUTION'
              AND COALESCE(phase.starts_at, campaign.end_time) <= now()
              AND NOT ${CampaignRehearsalReadySql('campaign')})
           OR
           (campaign.operation_stage = 'EVENT'
              AND COALESCE(phase.ends_at, campaign.end_time) <= now()
              AND NOT ${CampaignDistributionSettledSql('campaign')})
         )
       ) blocked
       -- Đã nhắc hôm nay (cùng khoá chống trùng của thông báo) thì nhường chỗ cho chiến dịch
       -- sau — không thì các hàng id nhỏ chiếm LIMIT mãi (review M5).
       WHERE NOT EXISTS (SELECT 1 FROM notifications reminder
                          WHERE reminder.idempotency_key =
                            'CHARITY_ORGANIZER_REMINDER:' || blocked.global_id::text
                            || ':' || blocked.reason || ':' || $2::text)
       ORDER BY blocked.id
       LIMIT $1`,
      [limit, dayKey],
    );
    return rows.map((row) => ({
      campaignId: row.global_id,
      ownerId: row.created_by,
      reason: row.reason,
    }));
  }

  // ── Đơn vị liên quan ───────────────────────────────────────────────────

  public async listParties(campaignId: string): Promise<ICharityParty[]> {
    const rows = await this.manager.query<IPartyRow[]>(
      `SELECT ${PartyColumns}
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
    if (!this.untracked)
      return this.tracked('PARTY', params.campaignId, params.actorId, (repo) =>
        repo.replaceParties(params),
      );
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
          // $15…$23: kế hoạch trao — `undefined` giữ giá trị đang lưu (app cũ không gửi).
          party.estimatedPortions ?? null,
          party.estimatedAmount ?? null,
          party.distributionAt !== undefined,
          party.distributionAt ?? null,
          party.lat !== undefined || party.lng !== undefined,
          party.lat ?? null,
          party.lng ?? null,
          party.consentStatus !== undefined,
          party.consentStatus ?? null,
        ];
        if (party.partyId) {
          const updated = await updateReturning<{ global_id: string }>(
            manager,
            `UPDATE campaign_parties
             SET role = $2, name = $3, address = $4, phone = $5, email = $6, hotline = $7,
                 pic_name = $8, pic_phone = $9, pic_user_id = $10, beneficiary_kind = $11,
                 evidence_urls = $12::jsonb, sort_order = $13, updated_by = $14,
                 estimated_portions = COALESCE($15::int, estimated_portions),
                 estimated_amount = COALESCE($16::bigint, estimated_amount),
                 distribution_at = CASE WHEN $17::boolean THEN $18::timestamptz
                                        ELSE distribution_at END,
                 location = CASE WHEN $19::boolean THEN
                              CASE WHEN $20::float8 IS NULL OR $21::float8 IS NULL THEN NULL
                                   ELSE ST_SetSRID(ST_MakePoint($21::float8, $20::float8), 4326)::geography END
                            ELSE location END,
                 consent_status = CASE WHEN $22::boolean THEN $23::varchar
                                       ELSE consent_status END,
                 updated_at = now()
             WHERE campaign_id = $1 AND global_id = $24 AND NOT is_appeal_subject
             RETURNING global_id`,
            [...values, party.partyId],
          );
          if (updated.length > 0) continue;
        }
        await manager.query(
          `INSERT INTO campaign_parties
             (campaign_id, role, name, address, phone, email, hotline, pic_name, pic_phone,
              pic_user_id, beneficiary_kind, evidence_urls, sort_order, updated_by,
              estimated_portions, estimated_amount, distribution_at, location, consent_status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13, $14,
                   COALESCE($15::int, 0), COALESCE($16::bigint, 0),
                   CASE WHEN $17::boolean THEN $18::timestamptz END,
                   CASE WHEN $19::boolean AND $20::float8 IS NOT NULL AND $21::float8 IS NOT NULL
                        THEN ST_SetSRID(ST_MakePoint($21::float8, $20::float8), 4326)::geography END,
                   CASE WHEN $22::boolean THEN $23::varchar END)`,
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
      `SELECT global_id, label, bank_name, bank_bin, account_no, account_name, valid_from,
              valid_to, close_reason
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
    if (!this.untracked)
      return this.tracked(
        'BANK_ACCOUNT',
        params.campaignId,
        params.actorId,
        (repo) => repo.addBankAccount(params),
      );
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
           (campaign_id, label, bank_name, account_no, account_name, created_by, bank_bin)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING global_id, label, bank_name, bank_bin, account_no, account_name,
                   valid_from, valid_to, close_reason`,
        [
          params.campaignId,
          params.account.label,
          params.account.bankName,
          params.account.accountNo,
          params.account.accountName,
          params.actorId,
          params.account.bankBin,
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
    if (!this.untracked)
      return this.tracked(
        'BANK_ACCOUNT',
        params.campaignId,
        params.actorId,
        (repo) => repo.closeBankAccount(params),
      );
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

  // ── Tài khoản thụ hưởng ─────────────────────────────────────────────────

  public async listBeneficiaryBankAccounts(
    campaignId: string,
  ): Promise<ICharityBeneficiaryBankAccount[]> {
    const rows = await this.manager.query<IBeneficiaryBankRow[]>(
      `SELECT ${BeneficiaryBankColumns} FROM campaign_beneficiary_bank_accounts
       WHERE campaign_id = $1
       ORDER BY (valid_to IS NULL) DESC, valid_from DESC, id DESC`,
      [campaignId],
    );
    return rows.map(toBeneficiaryBank);
  }

  public async addBeneficiaryBankAccount(params: {
    campaignId: string;
    actorId: string;
    account: ICharityBeneficiaryBankAccountInput;
    replacesAccountId: string | null;
    replaceReason: string | null;
  }): Promise<AddCharityBeneficiaryBankAccountOutcome> {
    return this.manager.transaction(async (manager) => {
      if (params.replacesAccountId) {
        const closed = await updateReturning<{ global_id: string }>(
          manager,
          `UPDATE campaign_beneficiary_bank_accounts
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
      const [row] = await manager.query<IBeneficiaryBankRow[]>(
        `INSERT INTO campaign_beneficiary_bank_accounts
           (campaign_id, holder_type, party_id, bank_name, account_no, account_name, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING ${BeneficiaryBankColumns}`,
        [
          params.campaignId,
          params.account.holderType,
          params.account.partyId,
          params.account.bankName,
          params.account.accountNo,
          params.account.accountName,
          params.actorId,
        ],
      );
      return { status: 'CREATED', account: toBeneficiaryBank(row) };
    });
  }

  public async closeBeneficiaryBankAccount(params: {
    campaignId: string;
    accountId: string;
    actorId: string;
    reason: string;
  }): Promise<boolean> {
    const rows = await updateReturning<{ global_id: string }>(
      this.manager,
      `UPDATE campaign_beneficiary_bank_accounts
       SET valid_to = now(), close_reason = $3, closed_by = $4
       WHERE campaign_id = $1 AND global_id = $2 AND valid_to IS NULL
       RETURNING global_id`,
      [params.campaignId, params.accountId, params.reason, params.actorId],
    );
    return rows.length > 0;
  }

  public async verifyBeneficiaryBankAccount(params: {
    campaignId: string;
    accountId: string;
    actorId: string;
  }): Promise<ICharityBeneficiaryBankAccount | null> {
    const rows = await updateReturning<IBeneficiaryBankRow>(
      this.manager,
      `UPDATE campaign_beneficiary_bank_accounts
       SET verified_at = COALESCE(verified_at, now()),
           verified_by = CASE WHEN verified_at IS NULL THEN $3 ELSE verified_by END
       WHERE campaign_id = $1 AND global_id = $2 AND valid_to IS NULL
       RETURNING ${BeneficiaryBankColumns}`,
      [params.campaignId, params.accountId, params.actorId],
    );
    return rows.length > 0 ? toBeneficiaryBank(rows[0]) : null;
  }

  public async findOwnerFullName(campaignId: string): Promise<string | null> {
    const [row] = await this.manager.query<{ full_name: string | null }[]>(
      `SELECT account.full_name FROM campaigns campaign
       JOIN users account ON account.global_id = campaign.created_by
       WHERE campaign.global_id = $1`,
      [campaignId],
    );
    return row?.full_name ?? null;
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
    if (!this.untracked)
      return this.tracked('TEAM', params.campaignId, params.actorId, (repo) =>
        repo.replaceTeam(params),
      );
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
       ORDER BY array_position(ARRAY['PLANNING', 'PREPARATION', 'REHEARSAL', 'DISTRIBUTION', 'REPORTING'], phase::text)`,
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
    /** Lý do ghi vào lịch sử sửa (hoãn bước trao — §3.2). */
    reason?: string | null;
  }): Promise<ICharityPhase[]> {
    if (!this.untracked)
      return this.tracked(
        'PHASE',
        params.campaignId,
        params.actorId,
        (repo) => repo.replacePhases(params),
        params.reason ?? null,
      );
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
        surplus_explanation: string | null;
        quantity_per_portion: number;
        total_portions: string | number;
        pending_quantity: string | number;
        external_quantity: string | number;
      }[]
    >(
      `SELECT need.global_id, need.item_name, need.unit, need.target_quantity,
              need.accepted_quantity, need.received_quantity, need.is_active,
              need.unit_price, need.estimated_value, need.item_condition,
              need.condition_note, need.supply_source, need.intake_deadline,
              need.dropoff_address, need.delivery_instruction, need.receiver_name,
              need.receiver_phone, need.intake_status, need.surplus_explanation,
              need.quantity_per_portion,
              (SELECT COALESCE(SUM(party.estimated_portions), 0) FROM campaign_parties party
                WHERE party.campaign_id = need.campaign_id
                  AND party.role = 'BENEFICIARY') AS total_portions,
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
        surplusExplanation: row.surplus_explanation,
        quantityPerPortion: Number(row.quantity_per_portion),
        minimumQuantity: minimumQuantityFor(
          num(row.total_portions),
          Number(row.quantity_per_portion),
        ),
      };
    });
  }

  public async updateItemNeedProfile(params: {
    campaignId: string;
    needItemId: string;
    actorId: string;
    profile: ICharityNeedItemProfileInput;
    targetQuantity?: number;
    quantityPerPortion?: number;
    surplusExplanation?: string | null;
  }): Promise<boolean> {
    if (!this.untracked)
      return this.tracked(
        'NEED_ITEM',
        params.campaignId,
        params.actorId,
        (repo) => repo.updateItemNeedProfile(params),
      );
    const profile = params.profile;
    const rows = await updateReturning<{ global_id: string }>(
      this.manager,
      `UPDATE campaign_need_items
       SET unit_price = $3, estimated_value = $4, item_condition = $5, condition_note = $6,
           supply_source = $7, intake_deadline = $8, dropoff_address = $9,
           delivery_instruction = $10, receiver_name = $11, receiver_phone = $12,
           intake_status = $13,
           target_quantity = COALESCE($14::int, target_quantity),
           surplus_explanation = CASE WHEN $15::boolean THEN $16 ELSE surplus_explanation END,
           quantity_per_portion = COALESCE($17::int, quantity_per_portion),
           updated_at = now()
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
        params.targetQuantity ?? null,
        params.surplusExplanation !== undefined,
        params.surplusExplanation ?? null,
        params.quantityPerPortion ?? null,
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
    if (!this.untracked)
      return this.tracked(
        'FUNDING_NEED',
        params.campaignId,
        params.actorId,
        (repo) => repo.createFundingNeed(params),
      );
    const need = params.need;
    const [row] = await this.manager.query<IFundingRow[]>(
      `INSERT INTO campaign_funding_needs AS funding
         (campaign_id, title, description, beneficiary_party_id,
          bank_account_id, target_amount, deadline, sort_order, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING ${FundingColumns}`,
      [
        params.campaignId,
        need.title,
        need.description,
        need.beneficiaryPartyId,
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
    if (!this.untracked)
      return this.tracked(
        'FUNDING_NEED',
        params.campaignId,
        params.actorId,
        (repo) => repo.updateFundingNeed(params),
      );
    const need = params.need;
    const rows = await updateReturning<IFundingRow>(
      this.manager,
      `UPDATE campaign_funding_needs AS funding
       SET title = $3, description = $4, beneficiary_party_id = $5,
           bank_account_id = $6, target_amount = $7, deadline = $8, sort_order = $9,
           confirmed_amount = $10, external_amount = $11, status = $12,
           updated_by = $13, updated_at = now()
       WHERE funding.campaign_id = $1 AND funding.global_id = $2
       RETURNING ${FundingColumns}`,
      [
        params.campaignId,
        params.fundingNeedId,
        need.title,
        need.description,
        need.beneficiaryPartyId,
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
    if (!this.untracked)
      return this.tracked(
        'VOLUNTEER_NEED',
        params.campaignId,
        params.actorId,
        (repo) => repo.createVolunteerNeed(params),
      );
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
    if (!this.untracked)
      return this.tracked(
        'VOLUNTEER_NEED',
        params.campaignId,
        params.actorId,
        (repo) => repo.updateVolunteerNeed(params),
      );
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
      // Một vòng đời participant chung (chốt 05/11): nhận vị trí là đăng ký tham gia dự án —
      // tạo lượt tham gia chờ duyệt, hoặc hồi lại lượt đã huỷ. Lượt đang có thì giữ nguyên.
      await manager.query(
        `INSERT INTO campaign_participations (campaign_id, user_id, status, registered_at)
         VALUES ($1, $2, 'REGISTERED', now())
         ON CONFLICT (campaign_id, user_id) DO UPDATE
           SET status = 'REGISTERED', registered_at = now(), cancelled_at = NULL,
               status_changed_at = now(), status_changed_by = NULL, status_reason = NULL
           WHERE campaign_participations.status = 'CANCELLED'`,
        [params.campaignId, params.userId],
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
    return this.manager.transaction(async (manager) => {
      if (!(await this.confirmVolunteerRow(manager, params))) return false;
      // Xác nhận vị trí là xác nhận người đó tham gia dự án (vòng đời chung, chốt 05/11).
      await manager.query(
        `UPDATE campaign_participations
            SET status = 'CONFIRMED', status_changed_at = now(), status_changed_by = $3,
                status_reason = NULL
          WHERE campaign_id = $1 AND user_id = $2 AND status IN ('REGISTERED', 'WAITLISTED')`,
        [params.campaignId, params.userId, params.actorId],
      );
      return true;
    });
  }

  private async confirmVolunteerRow(
    manager: EntityManager,
    params: {
      campaignId: string;
      volunteerNeedId: string;
      userId: string;
      actorId: string;
    },
  ): Promise<boolean> {
    const rows = await updateReturning<{ id: string }>(
      manager,
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
