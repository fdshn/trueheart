import {
  INotificationTemplate,
  INotificationTemplateRepository,
  IUpdateNotificationTemplateParams,
} from '@/domain/ports/repository';
import { NotificationTypes } from '@chantam.vn/chantam.core-lib/consts';
import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { updateReturning } from './update-returning';

interface ITemplateRow {
  type: NotificationTypes;
  title: string;
  body: string;
  is_enabled: boolean;
  updated_by: string | null;
  updated_at: Date;
}

function toTemplate(row: ITemplateRow): INotificationTemplate {
  return {
    type: row.type,
    title: row.title,
    body: row.body,
    isEnabled: row.is_enabled,
    updatedBy: row.updated_by,
    updatedAt: row.updated_at,
  };
}

const Columns = 'type, title, body, is_enabled, updated_by, updated_at';

@Injectable()
export class NotificationTemplateRepository implements INotificationTemplateRepository {
  public constructor(
    @InjectEntityManager() private readonly manager: EntityManager,
  ) {}

  public async listAll(): Promise<INotificationTemplate[]> {
    const rows = await this.manager.query<ITemplateRow[]>(
      `SELECT ${Columns} FROM notification_templates ORDER BY type ASC`,
    );
    return rows.map(toTemplate);
  }

  public async findEnabled(
    type: NotificationTypes,
  ): Promise<INotificationTemplate | null> {
    const [row] = await this.manager.query<ITemplateRow[]>(
      `SELECT ${Columns} FROM notification_templates
       WHERE type = $1 AND is_enabled = true`,
      [type],
    );
    return row ? toTemplate(row) : null;
  }

  public async update(
    params: IUpdateNotificationTemplateParams,
  ): Promise<INotificationTemplate | null> {
    const rows = await updateReturning<ITemplateRow>(
      this.manager,
      `
        UPDATE notification_templates
        SET title = $2, body = $3, is_enabled = $4,
            updated_by = $5, updated_at = now()
        WHERE type = $1
        RETURNING ${Columns}
      `,
      [
        params.type,
        params.title,
        params.body,
        params.isEnabled,
        params.updatedBy,
      ],
    );
    return rows.length > 0 ? toTemplate(rows[0]) : null;
  }
}
