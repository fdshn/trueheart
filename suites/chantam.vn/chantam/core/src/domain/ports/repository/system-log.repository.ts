/**
 * Loại nhật ký, mỗi loại đọc từ một nguồn có thật trong hệ thống.
 *
 * Cố ý KHÔNG dựng một bảng log gộp riêng: dữ liệu đã nằm ở nguồn có ràng buộc
 * bất biến của nó (ledger append-only, rank_transitions bất biến, audit log có
 * trigger chặn sửa). Chép sang bảng thứ hai là tạo ra hai sự thật lệch nhau.
 */
export type SystemLogTypes = 'ADMIN' | 'POINT' | 'RANK' | 'TRANSACTION';

export const SystemLogTypeValues: SystemLogTypes[] = [
  'ADMIN',
  'POINT',
  'RANK',
  'TRANSACTION',
];

/** Một dòng nhật ký đã chuẩn hoá về cùng một hình dạng. */
export interface ISystemLogEntry {
  readonly logType: SystemLogTypes;
  readonly occurredAt: Date;
  /** Người gây ra hành động; `null` khi do hệ thống tự chạy. */
  readonly actorUserId: string | null;
  /** Người bị ảnh hưởng. Với log admin thì thường là null. */
  readonly subjectUserId: string | null;
  readonly action: string;
  readonly resourceType: string;
  readonly resourceId: string | null;
  readonly detail: string | null;
}

export interface ISystemLogQuery {
  readonly logType: SystemLogTypes;
  readonly userId?: string;
  readonly action?: string;
  readonly from?: Date;
  readonly to?: Date;
  readonly skip: number;
  readonly take: number;
}

export interface ISystemLogPage {
  readonly entries: ISystemLogEntry[];
  readonly total: number;
}

export interface ISystemLogRepository {
  query(query: ISystemLogQuery): Promise<ISystemLogPage>;
}

export const ISystemLogRepository = Symbol('ISystemLogRepository');
