import { IHomeLayoutCache } from '@/domain/ports/cache';
import {
  HomeLayoutCacheKey,
  HomeLayoutCacheTtlSeconds,
  IHomeLayout,
} from '@chantam.vn/chantam.core-lib/models';
import { Inject, Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { IRedisClient } from '../redis/redis.module';

/**
 * Đệm bố cục Home trên Redis.
 *
 * Khoá và TTL lấy đúng tên UC-ADM-03 bước 5 và §7.2.6 đặt: `cache:home_layout_config`,
 * một giờ.
 *
 * Mọi phép đều bắt lỗi tại chỗ. `redis.module` cấu hình `enableOfflineQueue: false` nên
 * khi mất kết nối, lệnh **ném ngay** thay vì xếp hàng chờ — nếu không bắt thì một lượt
 * Redis chập sẽ thành 500 ở màn hình đầu tiên của app.
 */
@Injectable()
export class HomeLayoutCache implements IHomeLayoutCache {
  private readonly logger = new Logger(HomeLayoutCache.name);

  public constructor(@Inject(IRedisClient) private readonly redis: Redis) {}

  public async read(): Promise<IHomeLayout | null> {
    try {
      const raw = await this.redis.get(HomeLayoutCacheKey);
      if (!raw) return null;

      // Giá trị trong đệm có thể do một bản mã CŨ ghi, với hình dạng khác. Parse hỏng
      // thì coi như chưa có đệm và đọc lại từ database — không ném, và cũng không trả
      // một object thiếu trường cho client.
      return JSON.parse(raw) as IHomeLayout;
    } catch (error) {
      this.logger.warn(`Không đọc được đệm bố cục Home: ${String(error)}`);
      return null;
    }
  }

  public async write(layout: IHomeLayout): Promise<void> {
    try {
      await this.redis.set(
        HomeLayoutCacheKey,
        JSON.stringify(layout),
        'EX',
        HomeLayoutCacheTtlSeconds,
      );
    } catch (error) {
      // Ghi đệm thất bại chỉ có nghĩa là lượt sau lại phải hỏi database. Không đáng
      // một lỗi trả về client.
      this.logger.warn(`Không ghi được đệm bố cục Home: ${String(error)}`);
    }
  }

  public async invalidate(): Promise<boolean> {
    try {
      await this.redis.del(HomeLayoutCacheKey);
      return true;
    } catch (error) {
      // Khác hai phép trên: hỏng ở đây nghĩa là bố cục CŨ còn phục vụ tới một giờ. Trả
      // `false` để use case đưa tín hiệu đó lên response, chứ không để Admin tin là đã
      // đổi xong.
      this.logger.warn(`Không xoá được đệm bố cục Home: ${String(error)}`);
      return false;
    }
  }
}
