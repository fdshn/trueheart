import {
  ICreateUserWithReferralParams,
  ICreateUserWithReferralResult,
  IUserRepository,
} from '@/domain/ports/repository';
import { UserRanks, UserStatuses } from '@chantam.vn/chantam.core-lib/consts';
import { IUserEntity } from '@chantam.vn/chantam.core-lib/entities';
import { Inject, Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager, EntitySchema, Repository } from 'typeorm';

function makeReferralCode(globalId: string): string {
  return globalId.replaceAll('-', '').slice(0, 12).toUpperCase();
}

@Injectable()
export class UserRepository
  extends Repository<IUserEntity>
  implements IUserRepository
{
  public constructor(
    @Inject(IUserEntity)
    target: EntitySchema,
    @InjectEntityManager()
    manager: EntityManager,
  ) {
    super(target, manager);
  }

  public async createWithReferral(
    params: ICreateUserWithReferralParams,
  ): Promise<ICreateUserWithReferralResult> {
    return this.manager.transaction(async (manager) => {
      const referralCode = makeReferralCode(params.globalId);
      const inserted = await manager.query<{ global_id: string }[]>(
        `
          INSERT INTO users (
            global_id, username, password_hash, email, phone, full_name, avatar_url,
            rank, status, phone_verified_at, suspended_until, deleted_at, referral_code
          ) VALUES ($1, $2, $3, NULL, NULL, NULL, NULL, $4, $5, NULL, NULL, NULL, $6)
          ON CONFLICT DO NOTHING
          RETURNING global_id
        `,
        [
          params.globalId,
          params.username,
          params.passwordHash,
          UserRanks.VIEWER,
          UserStatuses.ACTIVE,
          referralCode,
        ],
      );
      if (inserted.length === 0) return { user: null, referralApplied: false };

      let referralApplied = false;
      if (params.referralCode) {
        const [referrer] = await manager.query<{ global_id: string }[]>(
          `
            SELECT global_id
            FROM users
            WHERE referral_code = $1
              AND status = 'ACTIVE'
              AND deleted_at IS NULL
          `,
          [params.referralCode],
        );
        if (referrer && referrer.global_id !== params.globalId) {
          const linked = await manager.query<{ id: string }[]>(
            `
              INSERT INTO referrals (referrer_id, referee_id, code)
              VALUES ($1, $2, $3)
              ON CONFLICT (referee_id) DO NOTHING
              RETURNING id
            `,
            [referrer.global_id, params.globalId, params.referralCode],
          );
          referralApplied = linked.length === 1;
        }
      }

      const [user] = await manager.query<IUserEntity[]>(
        `SELECT * FROM users WHERE global_id = $1`,
        [params.globalId],
      );

      return { user, referralApplied };
    });
  }

  public async findByIdentifier(
    identifier: string,
  ): Promise<IUserEntity | null> {
    const normalized = identifier.trim().toLowerCase();

    // LOWER() ở cả hai vế: người dùng gõ "Nguyen@Mail.com" vẫn phải đăng nhập
    // được. Username lưu nguyên dạng hiển thị nhưng so sánh không phân biệt hoa
    // thường, đúng như lúc kiểm trùng ở `isUsernameTaken`.
    return this.createQueryBuilder('user')
      .where('user.deletedAt IS NULL')
      .andWhere(
        '(LOWER(user.username) = :normalized OR LOWER(user.email) = :normalized OR user.phone = :raw)',
        { normalized, raw: identifier.trim() },
      )
      .getOne();
  }

  public async findActiveByUsername(
    username: string,
  ): Promise<IUserEntity | null> {
    return this.createQueryBuilder('user')
      .where('user.deletedAt IS NULL')
      .andWhere('user.status = :status', { status: 'ACTIVE' })
      .andWhere('LOWER(user.username) = :username', {
        username: username.trim().toLowerCase(),
      })
      .getOne();
  }

  public async isEmailTaken(
    email: string,
    exceptUserId: string,
  ): Promise<boolean> {
    return (
      (await this.createQueryBuilder('user')
        .where('LOWER(user.email) = :email', { email })
        .andWhere('user.globalId != :exceptUserId', { exceptUserId })
        .getCount()) > 0
    );
  }

  public async isPhoneTaken(
    phone: string,
    exceptUserId: string,
  ): Promise<boolean> {
    return (
      (await this.createQueryBuilder('user')
        .where('user.phone = :phone', { phone })
        .andWhere('user.globalId != :exceptUserId', { exceptUserId })
        .getCount()) > 0
    );
  }

  public async isUsernameTaken(username: string): Promise<boolean> {
    // Tính cả tài khoản đã xoá mềm: username không được tái sử dụng, nếu không
    // người mới sẽ thừa hưởng danh tiếng (hoặc tai tiếng) của người cũ.
    const count = await this.createQueryBuilder('user')
      .where('LOWER(user.username) = :username', {
        username: username.trim().toLowerCase(),
      })
      .getCount();

    return count > 0;
  }
}
