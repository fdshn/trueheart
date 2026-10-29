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
    /** Người này đã bật `showOnlineStatus` — có thì vào thêm tập hiện danh tính. */
    visible: boolean;
  }): Promise<boolean | null>;

  /** Số người (đã gộp session) còn heartbeat trong TTL. */
  countOnline(surface: PresenceSurfaces, nowMs: number): Promise<number | null>;

  /**
   * Tối đa `count` userId đã bật `showOnlineStatus` còn heartbeat trong TTL, gần nhất trước.
   * Chỉ là ứng viên — bên gọi lọc lại ở database (cờ còn bật, tài khoản còn hoạt động).
   */
  listVisible(
    surface: PresenceSurfaces,
    nowMs: number,
    count: number,
  ): Promise<string[] | null>;

  /**
   * Xoá NGAY mọi session của người này khỏi mọi surface (PR #46 §10.5 — tắt hiện trạng thái
   * online phải có hiệu lực ngay). `false` khi Redis không trả lời.
   */
  clearUser(userId: string): Promise<boolean>;
}

export const IPresenceStore = Symbol('IPresenceStore');
