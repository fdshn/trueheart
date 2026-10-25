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
 * Một heartbeat, nguyên tử.
 *
 * KEYS[1] = hash session của người dùng (`sessionId` → `<chỉ số surface>|<ms>`),
 * KEYS[2..] = sorted set của TỪNG surface, member là userId, score là heartbeat mới nhất.
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

for s = 1, #KEYS - 1 do
  if latest[s] then
    redis.call('ZADD', KEYS[s + 1], latest[s], user)
    redis.call('PEXPIRE', KEYS[s + 1], ttl)
  else
    redis.call('ZREM', KEYS[s + 1], user)
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
  }): Promise<boolean | null> {
    try {
      const written = await this.redis.eval(
        HeartbeatScript,
        1 + Surfaces.length,
        sessionsKey(params.userId),
        ...Surfaces.map(surfaceKey),
        params.sessionId,
        Surfaces.indexOf(params.surface) + 1,
        params.nowMs,
        TtlMs,
        SameSurfaceIntervalMs,
        params.userId,
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
}
