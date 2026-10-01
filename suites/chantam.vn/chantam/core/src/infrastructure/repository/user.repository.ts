import {
  ICreateUserWithReferralParams,
  ICreateUserWithReferralResult,
  IUserRepository,
} from '@/domain/ports/repository';
import { UserRanks, UserStatuses } from '@chantam.vn/chantam.core-lib/consts';
import { IUserEntity } from '@chantam.vn/chantam.core-lib/entities';
import { referralCodeCandidates } from '@chantam.vn/chantam.core-lib/models';
import { Inject, Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager, EntitySchema, In, Repository } from 'typeorm';

/**
 * Đúng xung đột `UQ_users_referral_code`, không phải mọi lỗi unique.
 *
 * So theo TÊN RÀNG BUỘC chứ không theo mã `23505` chung: xung đột username hay email
 * cũng là `23505`, và thử lại với một mã giới thiệu khác thì không sửa được gì — chỉ
 * làm sáu lượt ghi vò ích rồi báo sai nguyên nhân.
 */
function isReferralCodeConflict(error: unknown): boolean {
  const candidate = error as { code?: string; constraint?: string } | null;

  return (
    candidate?.code === '23505' &&
    candidate?.constraint === 'UQ_users_referral_code'
  );
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

  public async findByGlobalIds(globalIds: string[]): Promise<IUserEntity[]> {
    // Mảng rỗng lọt xuống `In([])` sinh ra `IN ()` — cú pháp hỏng ở Postgres.
    if (globalIds.length === 0) return [];

    return this.find({ where: { globalId: In(globalIds) } });
  }

  public async createWithReferral(
    params: ICreateUserWithReferralParams,
  ): Promise<ICreateUserWithReferralResult> {
    return this.manager.transaction(async (manager) => {
      // `ON CONFLICT (global_id)` chứ không `ON CONFLICT DO NOTHING` trần: bản trần
      // nuốt luôn xung đột MÃ GIỚI THIỆU và trả về 0 dòng, làm lần đăng ký đó báo
      // "username đã có người dùng" cho một username còn trống. Nói rõ cột xung đột
      // thì xung đột mã nổi lên để vòng lặp dưới xử.
      const candidates = referralCodeCandidates(params.globalId);
      let inserted: { global_id: string }[] = [];
      let lastError: unknown;

      for (const referralCode of candidates) {
        try {
          inserted = await manager.query<{ global_id: string }[]>(
            `
              INSERT INTO users (
                global_id, username, password_hash, email, phone, full_name, avatar_url,
                rank, status, phone_verified_at, suspended_until, deleted_at, referral_code
              ) VALUES ($1, $2, $3, NULL, NULL, NULL, NULL, $4, $5, NULL, NULL, NULL, $6)
              ON CONFLICT (global_id) DO NOTHING
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
          lastError = undefined;
          break;
        } catch (error) {
          // Chỉ bắt đúng xung đột MÃ: mọi lỗi khác phải nổi lên nguyên vẹn, nếu không
          // thì một lỗi thật sẽ bị thử lại sáu lần rồi biến thành một thông điệp sai.
          if (!isReferralCodeConflict(error)) throw error;
          lastError = error;
        }
      }

      // Hết ứng viên mà vẫn xung đột: ném lỗi gốc chứ không im lặng trả null, vì
      // null ở đây được đọc thành "username đã có người dùng" — sai hẳn nguyên nhân.
      if (lastError !== undefined) throw lastError;
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
              INSERT INTO referrals (
                referrer_id, referee_id, code,
                signup_ip_hash, signup_device_hash
              )
              VALUES ($1, $2, $3, $4, $5)
              ON CONFLICT (referee_id) DO NOTHING
              RETURNING id
            `,
            [
              referrer.global_id,
              params.globalId,
              params.referralCode,
              params.signupIpHash ?? null,
              params.signupDeviceHash ?? null,
            ],
          );
          referralApplied = linked.length === 1;
        }
      }

      // Đọc lại qua TypeORM chứ KHÔNG `SELECT *`: hàng thô trả về tên cột
      // snake_case, nên `user.globalId` là undefined và phiên đăng nhập phát
      // ngay sau đây insert `user_id` NULL. Để TypeORM ánh xạ thì bảng `users`
      // thêm cột về sau cũng không phải sửa tay chỗ này.
      const user = await manager.findOneBy<IUserEntity>(this.target, {
        globalId: params.globalId,
      } as never);

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

  public async touchActivity(userId: string): Promise<void> {
    // UPDATE trần, không đọc trước: mốc này ghi ở mọi lần cấp phiên nên nó là
    // đường đi nóng nhất của hệ thống. Đọc rồi mới ghi là gấp đôi số lượt đi
    // database cho một cột không ai đọc lại trong cùng request.
    await this.createQueryBuilder()
      .update()
      .set({ lastActiveAt: () => 'now()' })
      .where('global_id = :userId', { userId })
      .execute();
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
