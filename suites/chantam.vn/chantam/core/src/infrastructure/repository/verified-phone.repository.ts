import { IConfig } from '@/domain/ports/config';
import {
  ClaimPhoneOutcome,
  IVerifiedPhoneRepository,
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
}
