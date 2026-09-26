import { IConfig } from '@/domain/ports/config';
import {
  ClaimPhoneOutcome,
  IVerifiedPhoneHolder,
  IVerifiedPhoneRepository,
  ReleasePhoneOutcome,
} from '@/domain/ports/repository';
import { Inject, Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { createHash, createHmac } from 'node:crypto';
import { EntityManager } from 'typeorm';

@Injectable()
export class VerifiedPhoneRepository implements IVerifiedPhoneRepository {
  public constructor(
    @InjectEntityManager() private readonly manager: EntityManager,
    @Inject(IConfig) private readonly config: IConfig,
  ) {}

  /**
   * Băm số điện thoại. Có khoá thì HMAC, không có thì SHA-256 trơn.
   *
   * Không ném khi thiếu khoá: chống trùng là việc phải chạy được ở máy dev và ở
   * staging chưa cắm gì. Thiếu khoá chỉ làm băm dò ngược được, không làm sai
   * kết quả so trùng.
   */
  private hash(phone: string): string {
    const pepper = this.config.security.phoneHashPepper;
    const normalized = phone.trim();

    return pepper
      ? createHmac('sha256', pepper).update(normalized).digest('hex')
      : createHash('sha256').update(normalized).digest('hex');
  }

  public async claim(params: {
    phone: string;
    userId: string;
  }): Promise<ClaimPhoneOutcome> {
    const phoneHash = this.hash(params.phone);

    // `ON CONFLICT DO NOTHING` trên index UNIQUE một phần: hai request song
    // song cùng vượt qua phép đọc rồi cùng ghi thì đúng một cái thắng, và cái
    // thua nhận `rows.length === 0` chứ không phải một ngoại lệ khó đọc.
    const inserted = await this.manager.query<{ user_id: string }[]>(
      `
        INSERT INTO verified_phones (phone_hash, user_id)
        VALUES ($1, $2)
        ON CONFLICT ("phone_hash") WHERE released_at IS NULL DO NOTHING
        RETURNING user_id
      `,
      [phoneHash, params.userId],
    );

    if (inserted.length > 0) return 'CLAIMED';

    const [owner] = await this.manager.query<{ user_id: string }[]>(
      `
        SELECT user_id FROM verified_phones
        WHERE phone_hash = $1 AND released_at IS NULL
      `,
      [phoneHash],
    );

    // Xác minh lại số của CHÍNH mình là bình thái: đổi máy, cài lại app, hoặc
    // bấm nhầm hai lần.
    return owner?.user_id === params.userId ? 'ALREADY_OWN' : 'TAKEN';
  }

  public async release(params: {
    phone: string;
    actorUserId: string;
    reason: string;
  }): Promise<ReleasePhoneOutcome> {
    const phoneHash = this.hash(params.phone);

    return this.manager.transaction(async (manager) => {
      // Khoá hàng ngay từ đầu: hai Admin cùng bấm giải phóng thì người thứ hai
      // phải thấy trạng thái sau khi người thứ nhất ghi, không phải trạng thái
      // lúc cả hai mở màn hình.
      const [row] = await manager.query<
        {
          id: number;
          user_id: string;
          username: string;
          verified_at: Date;
          holder_deleted: boolean;
          still_verified: boolean;
        }[]
      >(
        `
          SELECT record.id, record.user_id, holder.username, record.verified_at,
                 (holder.deleted_at IS NOT NULL) AS holder_deleted,
                 (holder.phone_verified_at IS NOT NULL) AS still_verified
          FROM verified_phones record
          INNER JOIN users holder ON holder.global_id = record.user_id
          WHERE record.phone_hash = $1 AND record.released_at IS NULL
          FOR UPDATE OF record
        `,
        [phoneHash],
      );

      if (!row) return { status: 'NOT_FOUND' };

      const holder: IVerifiedPhoneHolder = {
        userId: row.user_id,
        username: row.username,
        verifiedAt: row.verified_at,
        holderDeleted: row.holder_deleted === true,
        stillVerified: row.still_verified === true,
      };

      // Người giữ còn sống VÀ vẫn đang mang dấu xác minh: đây là tranh chấp
      // giữa hai người thật, không phải dọn rác. Admin phải xử lý tài khoản kia
      // trước, nếu không hệ thống có hai tài khoản cùng "đã xác minh" một SIM.
      if (!holder.holderDeleted && holder.stillVerified)
        return { status: 'IN_USE', holder };

      await manager.query(
        `
          UPDATE verified_phones
          SET released_at = now(), released_by = $2, release_reason = $3
          WHERE id = $1
        `,
        [row.id, params.actorUserId, params.reason],
      );

      // Ghi audit vào CÙNG transaction. Tách ra thì có đường số được giải phóng
      // mà không dòng nào nói ai làm và vì sao — trong khi đây đúng là loại
      // thao tác sẽ bị hỏi lại.
      await manager.query(
        `
          INSERT INTO admin_audit_logs
            (actor_user_id, action, resource_type, resource_id, before_json, after_json, reason)
          VALUES ($1, 'RELEASE_VERIFIED_PHONE', 'USER', $2, $3::jsonb, $4::jsonb, $5)
        `,
        [
          params.actorUserId,
          row.user_id,
          JSON.stringify({ verifiedPhoneId: row.id, released: false }),
          JSON.stringify({ verifiedPhoneId: row.id, released: true }),
          params.reason,
        ],
      );

      return { status: 'RELEASED', holder };
    });
  }
}
