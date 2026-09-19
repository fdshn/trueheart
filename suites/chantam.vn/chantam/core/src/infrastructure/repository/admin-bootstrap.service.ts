import { IConfig } from '@/domain/ports/config';
import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';

@Injectable()
export class AdminBootstrapService implements OnModuleInit {
  private readonly logger = new Logger(AdminBootstrapService.name);

  public constructor(
    @Inject(IConfig) private readonly config: IConfig,
    @InjectEntityManager() private readonly manager: EntityManager,
  ) {}

  public async onModuleInit(): Promise<void> {
    for (const username of this.config.adminBootstrap.usernames) {
      await this.manager.query(
        `
          INSERT INTO admin_user_roles (user_id, role_id)
          SELECT user_account.global_id, role.id
          FROM users user_account
          CROSS JOIN admin_roles role
          WHERE LOWER(user_account.username) = $1
            AND user_account.status = 'ACTIVE'
            AND role.code = 'SUPER_ADMIN'
            AND user_account.deleted_at IS NULL
          ON CONFLICT (user_id, role_id) DO NOTHING
        `,
        [username],
      );
    }

    if (this.config.adminBootstrap.usernames.length > 0)
      this.logger.warn(
        'ADMIN_BOOTSTRAP_USERNAMES chỉ dùng để khởi tạo SUPER_ADMIN; hãy xoá biến này sau khi gán role thành công.',
      );
  }
}
