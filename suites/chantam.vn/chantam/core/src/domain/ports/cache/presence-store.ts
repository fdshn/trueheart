import { PresenceSurfaces } from '@chantam.vn/chantam.core-lib/consts';

/**
 * Presence theo tab trên Redis (PR #46 §10). Không ghi PostgreSQL, không giữ lịch sử: hết
 * TTL là dữ liệu tự biến mất.
 *
 * Hai phép **không được ném**: Redis chết không được làm hỏng màn hình chỉ để hiện một con
 * số. `null` nghĩa là Redis không trả lời — bên gọi tự chọn cách hiển thị.
 */
export interface IPresenceStore {
  /**
   * Ghi heartbeat của một session. `false` khi bỏ qua vì lặp cùng surface quá sớm.
   * Session đổi surface thì người đó rời surface cũ — trừ khi một session khác của chính
   * họ vẫn đang ở đó.
   */
  heartbeat(params: {
    userId: string;
    sessionId: string;
    surface: PresenceSurfaces;
    nowMs: number;
  }): Promise<boolean | null>;

  /** Số người (đã gộp session) còn heartbeat trong TTL. */
  countOnline(surface: PresenceSurfaces, nowMs: number): Promise<number | null>;
}

export const IPresenceStore = Symbol('IPresenceStore');
