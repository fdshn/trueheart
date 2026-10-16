import { IMediaAsset, IMediaAssetRepository } from '@/domain/ports/repository';
import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';

interface IRow {
  global_id: string;
  storage_key: string;
  public_url: string;
  content_type: string;
  file_name: string | null;
  uploaded_by: string | null;
  uploaded_by_username: string | null;
  created_at: Date;
}

const Select = `
  SELECT asset.global_id, asset.storage_key, asset.public_url,
         asset.content_type, asset.file_name, asset.uploaded_by,
         uploader.username AS uploaded_by_username, asset.created_at
  FROM media_assets asset
  LEFT JOIN users uploader ON uploader.global_id = asset.uploaded_by
`;

function toAsset(row: IRow): IMediaAsset {
  return {
    globalId: row.global_id,
    storageKey: row.storage_key,
    publicUrl: row.public_url,
    contentType: row.content_type,
    fileName: row.file_name,
    uploadedBy: row.uploaded_by,
    uploadedByUsername: row.uploaded_by_username,
    createdAt: row.created_at,
  };
}

@Injectable()
export class MediaAssetRepository implements IMediaAssetRepository {
  public constructor(
    @InjectEntityManager() private readonly manager: EntityManager,
  ) {}

  public async register(params: {
    storageKey: string;
    publicUrl: string;
    contentType: string;
    fileName: string | null;
    uploadedBy: string;
  }): Promise<IMediaAsset> {
    // DO NOTHING rồi đọc lại, không DO UPDATE: lượt xác nhận thứ hai không được đổi
    // tên tệp hay người tải của dòng đã có.
    await this.manager.query(
      `INSERT INTO media_assets
         (storage_key, public_url, content_type, file_name, uploaded_by)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (storage_key) DO NOTHING`,
      [
        params.storageKey,
        params.publicUrl,
        params.contentType,
        params.fileName,
        params.uploadedBy,
      ],
    );
    const [row] = await this.manager.query<IRow[]>(
      `${Select} WHERE asset.storage_key = $1`,
      [params.storageKey],
    );
    return toAsset(row);
  }

  public async list(params: {
    keyword: string | null;
    skip: number;
    take: number;
  }): Promise<{ items: IMediaAsset[]; total: number }> {
    const filter = `
      ($1::text IS NULL
        OR asset.file_name ILIKE '%' || $1::text || '%'
        OR uploader.username ILIKE '%' || $1::text || '%')
    `;
    const [counted] = await this.manager.query<{ total: string }[]>(
      `SELECT COUNT(*)::text AS total
       FROM media_assets asset
       LEFT JOIN users uploader ON uploader.global_id = asset.uploaded_by
       WHERE ${filter}`,
      [params.keyword],
    );
    const rows = await this.manager.query<IRow[]>(
      `${Select}
       WHERE ${filter}
       ORDER BY asset.created_at DESC, asset.id DESC
       LIMIT $2 OFFSET $3`,
      [params.keyword, params.take, params.skip],
    );

    return {
      items: rows.map(toAsset),
      total: Number(counted?.total ?? 0),
    };
  }
}
