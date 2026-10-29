import { IPresenceStore } from '@/domain/ports/cache';
import {
  PresenceSameSurfaceIntervalSeconds,
  PresenceSurfaces,
  PresenceTtlSeconds,
} from '@chantam.vn/chantam.core-lib/consts';
import { Inject, Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { IRedisClient } from '../redis/redis.module';

/** Thứ tự CỐ ĐỊNH — script Lua nhận surface bằng chỉ số trong mảng này. */
const Surfaces = Object.values(PresenceSurfaces);
const TtlMs = PresenceTtlSeconds * 1_000;
const SameSurfaceIntervalMs = PresenceSameSurfaceIntervalSeconds * 1_000;

export const PresenceKeyPrefix = 'presence:';
const sessionsKey = (userId: string) =>
  `${PresenceKeyPrefix}sessions:${userId}`;
const surfaceKey = (surface: PresenceSurfaces) =>
  `${PresenceKeyPrefix}surface:${surface}`;
/**
 * Cùng hình dạng với tập đếm, nhưng CHỈ người đã bật `showOnlineStatus` (PR #46 §10.5). Tách
 * tập riêng để đọc danh sách không phải lọc qua cả nghìn người không muốn bị thấy.
 */
const visibleKey = (surface: PresenceSurfaces) =>
  `${PresenceKeyPrefix}visible:${surface}`;

/**
 * Một heartbeat, nguyên tử.
 *
 * KEYS[1] = hash session của người dùng (`sessionId` → `<chỉ số surface>|<ms>`),
 * KEYS[2..9] = sorted set đếm của TỪNG surface, member là userId, score là heartbeat mới nhất,
 * KEYS[10..17] = sorted set hiện danh tính, cùng thứ tự surface — chỉ có người khi ARGV[7] = 1.
 *
 * Sau khi ghi session, script tính lại TỪ ĐẦU người này đang ở surface nào, dựa trên mọi
 * session còn sống của họ, rồi đặt/gỡ member ở cả tám sorted set. Tính lại chứ không "gỡ
 * khỏi surface cũ": hai thiết bị ở hai tab, một cái đổi tab, thì người đó vẫn phải còn ở tab
 * của thiết bị kia. Allow-list chỉ có tám surface nên khai hết key trước được.
 */
const HeartbeatScript = `
local sessions = KEYS[1]
local sessionId = ARGV[1]
local target = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local ttl = tonumber(ARGV[4])
local minInterval = tonumber(ARGV[5])
local user = ARGV[6]
local visible = ARGV[7] == '1'
local surfaces = (#KEYS - 1) / 2

local previous = redis.call('HGET', sessions, sessionId)
if previous then
  local ps, pt = string.match(previous, '^(%d+)|(%d+)$')
  if ps and tonumber(ps) == target then
    local elapsed = now - tonumber(pt)
    if elapsed >= 0 and elapsed < minInterval then return 0 end
  end
end

redis.call('HSET', sessions, sessionId, target .. '|' .. now)
redis.call('PEXPIRE', sessions, ttl)

local latest = {}
local all = redis.call('HGETALL', sessions)
for i = 1, #all, 2 do
  local s, t = string.match(all[i + 1], '^(%d+)|(%d+)$')
  if s then
    s = tonumber(s)
    t = tonumber(t)
    if now - t >= ttl then
      redis.call('HDEL', sessions, all[i])
    elseif latest[s] == nil or t > latest[s] then
      latest[s] = t
    end
  end
end

for s = 1, surfaces do
  local counted = KEYS[s + 1]
  local shown = KEYS[s + 1 + surfaces]
  if latest[s] then
    redis.call('ZADD', counted, latest[s], user)
    redis.call('PEXPIRE', counted, ttl)
    if visible then
      redis.call('ZADD', shown, latest[s], user)
      redis.call('PEXPIRE', shown, ttl)
    else
      redis.call('ZREM', shown, user)
    end
  else
    redis.call('ZREM', counted, user)
    redis.call('ZREM', shown, user)
  end
end
return 1
`;

/**
 * Presence theo tab trên Redis (PR #46 §10). Không ghi PostgreSQL; TTL 120 giây trên cả hash
 * session lẫn sorted set, nên người ngừng heartbeat tự biến mất mà không cần job dọn.
 *
 * Mọi phép bắt lỗi tại chỗ — `redis.module` đặt `enableOfflineQueue: false`, mất kết nối là
 * lệnh ném ngay.
 */
@Injectable()
export class PresenceStore implements IPresenceStore {
  private readonly logger = new Logger(PresenceStore.name);

  public constructor(@Inject(IRedisClient) private readonly redis: Redis) {}

  public async heartbeat(params: {
    userId: string;
    sessionId: string;
    surface: PresenceSurfaces;
    nowMs: number;
    visible: boolean;
  }): Promise<boolean | null> {
    try {
      const written = await this.redis.eval(
        HeartbeatScript,
        1 + Surfaces.length * 2,
        sessionsKey(params.userId),
        ...Surfaces.map(surfaceKey),
        ...Surfaces.map(visibleKey),
        params.sessionId,
        Surfaces.indexOf(params.surface) + 1,
        params.nowMs,
        TtlMs,
        SameSurfaceIntervalMs,
        params.userId,
        params.visible ? '1' : '0',
      );
      return written === 1;
    } catch (error) {
      this.logger.warn(`Không ghi được presence: ${String(error)}`);
      return null;
    }
  }

  public async countOnline(
    surface: PresenceSurfaces,
    nowMs: number,
  ): Promise<number | null> {
    try {
      const key = surfaceKey(surface);
      // Cắt người quá TTL lúc đọc: score là heartbeat mới nhất, nên ai dưới mốc là đã đi.
      const result = await this.redis
        .multi()
        .zremrangebyscore(key, '-inf', nowMs - TtlMs)
        .zcard(key)
        .exec();
      const [, [cardError, count]] = result as [
        [Error | null, unknown],
        [Error | null, unknown],
      ];
      if (cardError) throw cardError;
      return Number(count);
    } catch (error) {
      this.logger.warn(`Không đọc được presence: ${String(error)}`);
      return null;
    }
  }

  public async listVisible(
    surface: PresenceSurfaces,
    nowMs: number,
    count: number,
  ): Promise<string[] | null> {
    try {
      const key = visibleKey(surface);
      const result = await this.redis
        .multi()
        .zremrangebyscore(key, '-inf', nowMs - TtlMs)
        .zrevrange(key, 0, count - 1)
        .exec();
      const [, [rangeError, members]] = result as [
        [Error | null, unknown],
        [Error | null, unknown],
      ];
      if (rangeError) throw rangeError;
      return (members as string[]) ?? [];
    } catch (error) {
      this.logger.warn(`Không đọc được danh sách online: ${String(error)}`);
      return null;
    }
  }

  public async clearUser(userId: string): Promise<boolean> {
    try {
      // Một MULTI: tắt hiện trạng thái mà còn sót người này ở một tab nào đó là lộ đúng thứ
      // họ vừa yêu cầu ẩn.
      const pipeline = this.redis.multi().del(sessionsKey(userId));
      for (const surface of Surfaces)
        pipeline
          .zrem(surfaceKey(surface), userId)
          .zrem(visibleKey(surface), userId);
      await pipeline.exec();
      return true;
    } catch (error) {
      this.logger.warn(
        `Không xoá được presence của người dùng: ${String(error)}`,
      );
      return false;
    }
  }
}
