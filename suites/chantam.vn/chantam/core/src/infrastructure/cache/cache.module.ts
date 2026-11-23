import {
  IHomeLayoutCache,
  IPointFeedCache,
  IPresenceStore,
} from '@/domain/ports/cache';
import { Global, Module } from '@nestjs/common';
import { HomeLayoutCache } from './home-layout-cache';
import { PointFeedCache } from './point-feed-cache';
import { PresenceStore } from './presence-store';

/**
 * Đệm nghiệp vụ trên Redis.
 *
 * Tách khỏi `SecurityModule` vì hai thứ khác bản chất: ở đó mất Redis là mất một lớp bảo
 * vệ, ở đây mất Redis là chậm thêm một truy vấn. Trộn chung thì sau này không ai biết
 * provider nào được phép hỏng im lặng.
 */
@Global()
@Module({
  providers: [
    { provide: IHomeLayoutCache, useClass: HomeLayoutCache },
    { provide: IPresenceStore, useClass: PresenceStore },
    { provide: IPointFeedCache, useClass: PointFeedCache },
  ],
  exports: [IHomeLayoutCache, IPresenceStore, IPointFeedCache],
})
export class CacheModule {}
