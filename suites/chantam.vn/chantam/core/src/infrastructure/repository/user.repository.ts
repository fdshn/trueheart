import { IUserRepository } from '@/domain/ports/repository';
import { IUserEntity } from '@chantam.vn/chantam.core-lib/entities';
import { Inject, Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager, EntitySchema, Repository } from 'typeorm';

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
