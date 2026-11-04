import { ICharityRevisionDraft } from '@chantam.vn/chantam.core-lib/models';
import { EntityManager } from 'typeorm';

const jsonOrNull = (value: unknown): string | null =>
  value === null || value === undefined ? null : JSON.stringify(value);

/**
 * Ghi revision của một lượt sửa — gọi TRONG transaction của chính lượt sửa (§3.3).
 *
 * Có thay đổi quan trọng thì xếp luôn một thông báo `PLAN_CHANGED` vào outbox cùng
 * transaction: lượt sửa rollback thì thông báo cũng không còn. Payload chỉ mang TÊN field,
 * không mang giá trị — thông báo không phải đường lộ dữ liệu riêng tư.
 */
export async function recordCharityRevisions(
  manager: EntityManager,
  params: {
    campaignId: string;
    actorId: string | null;
    reason: string | null;
    drafts: readonly ICharityRevisionDraft[];
  },
): Promise<void> {
  if (params.drafts.length === 0) return;
  for (const draft of params.drafts)
    await manager.query(
      `INSERT INTO campaign_revisions
         (campaign_id, entity, entity_id, field, old_value, new_value, is_public,
          is_important, changed_by, reason)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8, $9, $10)`,
      [
        params.campaignId,
        draft.entity,
        draft.entityId,
        draft.field,
        jsonOrNull(draft.oldValue),
        jsonOrNull(draft.newValue),
        draft.isPublic,
        draft.isImportant,
        params.actorId,
        params.reason,
      ],
    );

  const important = params.drafts.filter((draft) => draft.isImportant);
  if (important.length === 0) return;
  const changes = [
    ...new Map(
      important.map((draft) => [
        `${draft.entity}.${draft.field}`,
        { entity: draft.entity, field: draft.field },
      ]),
    ).values(),
  ];
  await manager.query(
    `INSERT INTO campaign_announcements (campaign_id, kind, payload, actor_id)
     VALUES ($1, 'PLAN_CHANGED', $2::jsonb, $3)`,
    [params.campaignId, JSON.stringify({ changes }), params.actorId],
  );
}
