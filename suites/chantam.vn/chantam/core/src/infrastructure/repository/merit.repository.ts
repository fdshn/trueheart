import {
  ICreateMeritUnitParams,
  IMeritDeclaration,
  IMeritLedgerEntry,
  IMeritRepository,
  IMeritUnit,
  IMeritUnitPage,
  IWriteMeritUnitParams,
} from '@/domain/ports/repository';
import {
  AnonymousMeritDonorLabel,
  MeritDeclarationStatus,
  MeritUnitType,
} from '@chantam.vn/chantam.core-lib/models';
import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { updateReturning } from './update-returning';

interface IUnitRow {
  global_id: string;
  name: string;
  slug: string;
  unit_type: string;
  purpose: string;
  description: string | null;
  cover_url: string | null;
  address_label: string | null;
  lat: string | number | null;
  lng: string | number | null;
  bank_bin: string;
  bank_account_number: string;
  bank_account_name: string;
  bank_name: string | null;
  display_order: string | number;
  is_active: boolean;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
}

interface IDeclarationRow {
  global_id: string;
  unit_id: string;
  user_id: string;
  declared_amount: string | number;
  status: string;
  is_anonymous: boolean;
  note: string | null;
  declared_at: Date;
  completed_at: Date | null;
}

/**
 * `location` là `geography`, phải bóc bằng `ST_Y`/`ST_X`.
 *
 * `ST_Y` là VĨ ĐỘ (lat), `ST_X` là KINH ĐỘ (lng). Đổi chỗ hai cái là dời một ngôi chùa ở Sài
 * Gòn ra ngoài khơi Somalia, và không câu truy vấn nào báo lỗi.
 */
const UnitColumns = `global_id, name, slug, unit_type, purpose, description, cover_url,
       address_label,
       ST_Y(location::geometry) AS lat,
       ST_X(location::geometry) AS lng,
       bank_bin, bank_account_number, bank_account_name, bank_name,
       display_order, is_active, created_by, created_at, updated_at`;

const DeclarationColumns = `global_id, unit_id, user_id, declared_amount, status,
       is_anonymous, note, declared_at, completed_at`;

/** Mảnh `location` dựng từ hai tham số, hoặc `NULL`. */
const LocationExpression = `CASE
  WHEN $9::float8 IS NULL THEN NULL
  ELSE ST_SetSRID(ST_MakePoint($10::float8, $9::float8), 4326)::geography
END`;

function toUnit(row: IUnitRow): IMeritUnit {
  return {
    globalId: row.global_id,
    name: row.name,
    slug: row.slug,
    unitType: row.unit_type as MeritUnitType,
    purpose: row.purpose,
    description: row.description,
    coverUrl: row.cover_url,
    addressLabel: row.address_label,
    lat: row.lat === null ? null : Number(row.lat),
    lng: row.lng === null ? null : Number(row.lng),
    bankBin: row.bank_bin,
    bankAccountNumber: row.bank_account_number,
    bankAccountName: row.bank_account_name,
    bankName: row.bank_name,
    displayOrder: Number(row.display_order),
    isActive: row.is_active,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toDeclaration(row: IDeclarationRow): IMeritDeclaration {
  return {
    globalId: row.global_id,
    unitId: row.unit_id,
    userId: row.user_id,
    // `bigint` về đây là CHUỖI. Trả thẳng ra API thì client nhận `"500000"`, và mọi phép
    // cộng ở đó thành nối chuỗi.
    declaredAmount: Number(row.declared_amount),
    status: row.status as MeritDeclarationStatus,
    isAnonymous: row.is_anonymous,
    note: row.note,
    declaredAt: row.declared_at,
    completedAt: row.completed_at,
  };
}

/** Khoá DTO -> cột, cho câu `UPDATE` dựng động. */
const UpdatableUnitColumns: Readonly<
  Record<keyof Omit<IWriteMeritUnitParams, 'lat' | 'lng'>, string>
> = {
  name: 'name',
  slug: 'slug',
  unitType: 'unit_type',
  purpose: 'purpose',
  description: 'description',
  coverUrl: 'cover_url',
  addressLabel: 'address_label',
  bankBin: 'bank_bin',
  bankAccountNumber: 'bank_account_number',
  bankAccountName: 'bank_account_name',
  bankName: 'bank_name',
  displayOrder: 'display_order',
};

@Injectable()
export class MeritRepository implements IMeritRepository {
  public constructor(
    @InjectEntityManager() private readonly manager: EntityManager,
  ) {}

  public async createUnit(params: ICreateMeritUnitParams): Promise<IMeritUnit> {
    // `INSERT … RETURNING` KHÔNG bị TypeORM bọc thành `[rows, affected]`.
    const [row] = await this.manager.query<IUnitRow[]>(
      `WITH inserted AS (
         INSERT INTO merit_units
           (name, slug, unit_type, purpose, description, cover_url, address_label,
            location, bank_bin, bank_account_number, bank_account_name, bank_name,
            display_order, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, ${LocationExpression},
                 $8, $11, $12, $13, $14, $15)
         RETURNING *
       )
       SELECT ${UnitColumns} FROM inserted`,
      [
        params.name,
        params.slug,
        params.unitType,
        params.purpose,
        params.description,
        params.coverUrl,
        params.addressLabel,
        params.bankBin,
        params.lat,
        params.lng,
        params.bankAccountNumber,
        params.bankAccountName,
        params.bankName,
        params.displayOrder,
        params.createdBy,
      ],
    );
    return toUnit(row);
  }

  public async slugTaken(
    slug: string,
    exceptGlobalId?: string,
  ): Promise<boolean> {
    // Tính cả hàng ĐÃ XOÁ MỀM: cột `UNIQUE` không biết `deleted_at`, nên một slug đã xoá
    // vẫn giữ chỗ. Bỏ qua nó ở đây là trả "slug còn trống" rồi để `UNIQUE` ném 500.
    const [row] = await this.manager.query<{ taken: boolean }[]>(
      `SELECT true AS taken FROM merit_units
        WHERE slug = $1 AND ($2::uuid IS NULL OR global_id <> $2::uuid)
        LIMIT 1`,
      [slug, exceptGlobalId ?? null],
    );
    return row?.taken === true;
  }

  public async findUnitByGlobalId(
    globalId: string,
  ): Promise<IMeritUnit | null> {
    const [row] = await this.manager.query<IUnitRow[]>(
      `SELECT ${UnitColumns} FROM merit_units
        WHERE global_id = $1 AND deleted_at IS NULL`,
      [globalId],
    );
    return row ? toUnit(row) : null;
  }

  public async findPublicUnitByIdOrSlug(
    idOrSlug: string,
  ): Promise<IMeritUnit | null> {
    // `global_id::text = $1` thay vì nhận dạng UUID ở tầng JS: slug có dạng
    // `^[a-z0-9]+(-[a-z0-9]+)*$` nên không chuỗi nào vừa là UUID hợp lệ vừa là slug hợp lệ,
    // và `::text` tránh lỗi `invalid input syntax for type uuid`.
    const [row] = await this.manager.query<IUnitRow[]>(
      `SELECT ${UnitColumns} FROM merit_units
        WHERE (global_id::text = $1 OR slug = $1)
          AND is_active AND deleted_at IS NULL`,
      [idOrSlug],
    );
    return row ? toUnit(row) : null;
  }

  public async listPublicUnits(query: {
    limit: number;
    offset: number;
  }): Promise<IMeritUnitPage> {
    const rows = await this.manager.query<IUnitRow[]>(
      `SELECT ${UnitColumns} FROM merit_units
        WHERE is_active AND deleted_at IS NULL
        ORDER BY display_order ASC, id ASC
        LIMIT $1 OFFSET $2`,
      [query.limit, query.offset],
    );
    const [counted] = await this.manager.query<{ total: string }[]>(
      `SELECT count(*)::text AS total FROM merit_units
        WHERE is_active AND deleted_at IS NULL`,
    );
    return {
      items: (rows ?? []).map(toUnit),
      total: Number(counted?.total ?? 0),
    };
  }

  public async listUnitsForAdmin(query: {
    limit: number;
    offset: number;
    includeInactive: boolean;
  }): Promise<IMeritUnitPage> {
    const filter = query.includeInactive
      ? 'deleted_at IS NULL'
      : 'is_active AND deleted_at IS NULL';

    const rows = await this.manager.query<IUnitRow[]>(
      `SELECT ${UnitColumns} FROM merit_units
        WHERE ${filter}
        ORDER BY display_order ASC, id ASC
        LIMIT $1 OFFSET $2`,
      [query.limit, query.offset],
    );
    const [counted] = await this.manager.query<{ total: string }[]>(
      `SELECT count(*)::text AS total FROM merit_units WHERE ${filter}`,
    );
    return {
      items: (rows ?? []).map(toUnit),
      total: Number(counted?.total ?? 0),
    };
  }

  public async updateUnit(params: {
    unitId: string;
    changes: Partial<IWriteMeritUnitParams>;
  }): Promise<IMeritUnit | null> {
    const assignments: string[] = [];
    const values: unknown[] = [params.unitId];

    for (const [key, column] of Object.entries(UpdatableUnitColumns)) {
      const value =
        params.changes[key as keyof Omit<IWriteMeritUnitParams, 'lat' | 'lng'>];
      if (value === undefined) continue;
      values.push(value);
      assignments.push(`${column} = $${values.length}`);
    }

    // Toạ độ đi cùng nhau hay không đi — `ST_MakePoint` với một `NULL` cho ra `NULL`, tức
    // đơn vị lặng lẽ mất vị trí trên bản đồ.
    if (params.changes.lat !== undefined && params.changes.lng !== undefined) {
      values.push(params.changes.lat, params.changes.lng);
      const latIndex = values.length - 1;
      const lngIndex = values.length;
      assignments.push(
        `location = CASE
           WHEN $${latIndex}::float8 IS NULL THEN NULL
           ELSE ST_SetSRID(ST_MakePoint($${lngIndex}::float8, $${latIndex}::float8), 4326)::geography
         END`,
      );
    }

    if (assignments.length === 0) return this.findUnitByGlobalId(params.unitId);

    const rows = await updateReturning<IUnitRow>(
      this.manager,
      `WITH updated AS (
         UPDATE merit_units
            SET ${assignments.join(', ')}, updated_at = now()
          WHERE global_id = $1 AND deleted_at IS NULL
          RETURNING *
       )
       SELECT ${UnitColumns} FROM updated`,
      values,
    );
    return rows.length > 0 ? toUnit(rows[0]) : null;
  }

  public async setUnitActive(params: {
    unitId: string;
    isActive: boolean;
  }): Promise<IMeritUnit | null> {
    const rows = await updateReturning<IUnitRow>(
      this.manager,
      `WITH updated AS (
         UPDATE merit_units
            SET is_active = $2, updated_at = now()
          WHERE global_id = $1 AND deleted_at IS NULL
          RETURNING *
       )
       SELECT ${UnitColumns} FROM updated`,
      [params.unitId, params.isActive],
    );
    return rows.length > 0 ? toUnit(rows[0]) : null;
  }

  public async softDeleteUnit(unitId: string): Promise<boolean> {
    const rows = await updateReturning<{ global_id: string }>(
      this.manager,
      `UPDATE merit_units
          SET deleted_at = now(), is_active = false, updated_at = now()
        WHERE global_id = $1 AND deleted_at IS NULL
        RETURNING global_id`,
      [unitId],
    );
    return rows.length > 0;
  }

  public async createDeclaration(params: {
    unitId: string;
    userId: string;
    declaredAmount: number;
    status: MeritDeclarationStatus;
    isAnonymous: boolean;
    note: string | null;
  }): Promise<IMeritDeclaration> {
    const [row] = await this.manager.query<IDeclarationRow[]>(
      `INSERT INTO merit_declarations
         (unit_id, user_id, declared_amount, status, is_anonymous, note, completed_at)
       VALUES ($1, $2, $3, $4, $5, $6,
               CASE WHEN $7 = 'COMPLETED' THEN now() ELSE NULL END)
       RETURNING ${DeclarationColumns}`,
      [
        params.unitId,
        params.userId,
        params.declaredAmount,
        params.status,
        params.isAnonymous,
        params.note,
        // `status` lần hai. Một tham số vừa ở vị trí VALUES (`varchar(20)`) vừa trong phép
        // so với hằng `text` làm Postgres ném "inconsistent types deduced for parameter".
        params.status,
      ],
    );
    return toDeclaration(row);
  }

  public async findDeclarationByGlobalId(
    globalId: string,
  ): Promise<IMeritDeclaration | null> {
    const [row] = await this.manager.query<IDeclarationRow[]>(
      `SELECT ${DeclarationColumns} FROM merit_declarations WHERE global_id = $1`,
      [globalId],
    );
    return row ? toDeclaration(row) : null;
  }

  public async markDeclarationCompleted(params: {
    declarationId: string;
    userId: string;
  }): Promise<IMeritDeclaration | null> {
    // `AND user_id = $2 AND status = 'INTENDED'` nằm trong WHERE của chính câu UPDATE: một
    // lượt đọc-rồi-kiểm-rồi-ghi để lọt hai request song song, và quan trọng hơn, để lọt
    // người KHÁC đánh dấu hộ lời khai của mình.
    const rows = await updateReturning<IDeclarationRow>(
      this.manager,
      `UPDATE merit_declarations
          SET status = 'COMPLETED', completed_at = now()
        WHERE global_id = $1 AND user_id = $2 AND status = 'INTENDED'
        RETURNING ${DeclarationColumns}`,
      [params.declarationId, params.userId],
    );
    return rows.length > 0 ? toDeclaration(rows[0]) : null;
  }

  public async listLedger(query: {
    unitId: string;
    limit: number;
    offset: number;
  }): Promise<{ items: IMeritLedgerEntry[]; total: number }> {
    // `LEFT JOIN` chứ không `INNER`: `ON DELETE CASCADE` gỡ hàng khi người dùng xoá tài
    // khoản, nhưng `LEFT` là lớp phòng xa cho bất kỳ hàng mồ côi nào lọt vào bằng SQL tay —
    // `INNER JOIN` sẽ làm hàng đó biến mất khỏi Sổ vàng mà tổng vẫn tính nó.
    //
    // CHỈ lấy `full_name`/`username` cho hàng KHÔNG ẩn danh. Kéo tên về rồi lọc ở TypeScript
    // là để tên người ẩn danh đi qua dây mạng — một lượt log response là lộ.
    const rows = await this.manager.query<
      {
        global_id: string;
        declared_amount: string;
        status: string;
        note: string | null;
        declared_at: Date;
        display_name: string | null;
      }[]
    >(
      `SELECT declaration.global_id, declaration.declared_amount, declaration.status,
              declaration.note, declaration.declared_at,
              CASE
                WHEN declaration.is_anonymous THEN NULL
                ELSE COALESCE(NULLIF(btrim(donor.full_name), ''), donor.username)
              END AS display_name
         FROM merit_declarations declaration
         LEFT JOIN users donor ON donor.global_id = declaration.user_id
        WHERE declaration.unit_id = $3
        ORDER BY declaration.declared_at DESC, declaration.id DESC
        LIMIT $1 OFFSET $2`,
      [query.limit, query.offset, query.unitId],
    );
    const [counted] = await this.manager.query<{ total: string }[]>(
      `SELECT count(*)::text AS total FROM merit_declarations WHERE unit_id = $1`,
      [query.unitId],
    );

    return {
      items: (rows ?? []).map((row) => ({
        globalId: row.global_id,
        // Ẩn danh được quyết ĐÚNG MỘT NƠI: mệnh đề `CASE WHEN is_anonymous THEN NULL` của
        // câu SQL ngay trên. Ở đây chỉ còn phần rơi về nhãn mặc định, dùng chung cho hai ca
        // — người chọn ẩn danh, và tài khoản đã xoá nên không còn tên.
        //
        // Bản đầu kiểm `is_anonymous` LẦN HAI ở đây. Nghe như phòng xa, thực ra là che lỗi:
        // `test:merit` phá mệnh đề SQL kia mà **không phép kiểm nào đỏ**, vì lớp thứ hai
        // lặng lẽ cứu. Một lớp bảo vệ không kiểm được thì không phải lớp bảo vệ — nó chỉ
        // làm lỗi của lớp kia thành vô hình. Một nơi quyết định, và nơi đó đo được.
        donorLabel: row.display_name?.trim() || AnonymousMeritDonorLabel,
        declaredAmount: Number(row.declared_amount),
        status: row.status as MeritDeclarationStatus,
        note: row.note,
        declaredAt: row.declared_at,
      })),
      total: Number(counted?.total ?? 0),
    };
  }

  public async listOwnDeclarations(query: {
    userId: string;
    limit: number;
    offset: number;
  }): Promise<{ items: IMeritDeclaration[]; total: number }> {
    const rows = await this.manager.query<IDeclarationRow[]>(
      `SELECT ${DeclarationColumns} FROM merit_declarations
        WHERE user_id = $3
        ORDER BY declared_at DESC, id DESC
        LIMIT $1 OFFSET $2`,
      [query.limit, query.offset, query.userId],
    );
    const [counted] = await this.manager.query<{ total: string }[]>(
      `SELECT count(*)::text AS total FROM merit_declarations WHERE user_id = $1`,
      [query.userId],
    );
    return {
      items: (rows ?? []).map(toDeclaration),
      total: Number(counted?.total ?? 0),
    };
  }

  public async getDeclaredTotals(unitId: string): Promise<{
    totalDeclaredAmount: number;
    completedCount: number;
  }> {
    // CHỈ hàng `COMPLETED`. `INTENDED` là dự định — cộng nó vào tổng là nói quá.
    //
    // `::text` trên cả hai giá trị rồi `Number()` ở JS: `SUM(bigint)` trả `numeric`, và
    // `numeric` qua node-pg về dạng chuỗi. Đọc thẳng là trả một chuỗi ra API.
    const [row] = await this.manager.query<
      { total: string; counted: string }[]
    >(
      `SELECT COALESCE(SUM(declared_amount), 0)::text AS total,
              count(*)::text AS counted
         FROM merit_declarations
        WHERE unit_id = $1 AND status = 'COMPLETED'`,
      [unitId],
    );
    return {
      totalDeclaredAmount: Number(row?.total ?? 0),
      completedCount: Number(row?.counted ?? 0),
    };
  }
}
