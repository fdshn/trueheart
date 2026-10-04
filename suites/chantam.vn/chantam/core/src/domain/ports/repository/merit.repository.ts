import {
  MeritDeclarationStatus,
  MeritUnitType,
} from '@chantam.vn/chantam.core-lib/models';

export interface IMeritUnit {
  readonly globalId: string;
  readonly name: string;
  readonly slug: string;
  readonly unitType: MeritUnitType;
  readonly purpose: string;
  readonly description: string | null;
  readonly coverUrl: string | null;
  readonly addressLabel: string | null;
  readonly lat: number | null;
  readonly lng: number | null;
  readonly bankBin: string;
  readonly bankAccountNumber: string;
  readonly bankAccountName: string;
  readonly bankName: string | null;
  readonly displayOrder: number;
  readonly isActive: boolean;
  readonly createdBy: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface IMeritDeclaration {
  readonly globalId: string;
  readonly unitId: string;
  readonly userId: string;
  /**
   * Số tiền người dùng TỰ KHAI, đơn vị VNĐ.
   *
   * KHÔNG phải một giao dịch đã xác minh — hệ thống không có đường nào đối chiếu với ngân
   * hàng (UI-MERIT-01). Mọi chỗ trình bày con số này phải nói rõ nó là lời khai.
   */
  readonly declaredAmount: number;
  readonly status: MeritDeclarationStatus;
  readonly isAnonymous: boolean;
  readonly note: string | null;
  readonly declaredAt: Date;
  readonly completedAt: Date | null;
}

/** Một hàng Sổ vàng — đã bỏ tên khi người khai chọn ẩn danh. */
export interface IMeritLedgerEntry {
  readonly globalId: string;
  readonly donorLabel: string;
  readonly declaredAmount: number;
  readonly status: MeritDeclarationStatus;
  readonly note: string | null;
  readonly declaredAt: Date;
}

export interface IWriteMeritUnitParams {
  readonly name: string;
  readonly slug: string;
  readonly unitType: MeritUnitType;
  readonly purpose: string;
  readonly description: string | null;
  readonly coverUrl: string | null;
  readonly addressLabel: string | null;
  readonly lat: number | null;
  readonly lng: number | null;
  readonly bankBin: string;
  readonly bankAccountNumber: string;
  readonly bankAccountName: string;
  readonly bankName: string | null;
  readonly displayOrder: number;
}

export interface ICreateMeritUnitParams extends IWriteMeritUnitParams {
  readonly createdBy: string;
}

export interface IMeritUnitPage {
  readonly items: IMeritUnit[];
  readonly total: number;
}

export interface IMeritRepository {
  createUnit(params: ICreateMeritUnitParams): Promise<IMeritUnit>;

  slugTaken(slug: string, exceptGlobalId?: string): Promise<boolean>;

  findUnitByGlobalId(globalId: string): Promise<IMeritUnit | null>;

  /** Đường công khai: chỉ đơn vị còn bật, chưa xoá. Nhận cả id lẫn slug. */
  findPublicUnitByIdOrSlug(idOrSlug: string): Promise<IMeritUnit | null>;

  listPublicUnits(query: {
    readonly limit: number;
    readonly offset: number;
  }): Promise<IMeritUnitPage>;

  listUnitsForAdmin(query: {
    readonly limit: number;
    readonly offset: number;
    readonly includeInactive: boolean;
  }): Promise<IMeritUnitPage>;

  updateUnit(params: {
    readonly unitId: string;
    readonly changes: Partial<IWriteMeritUnitParams>;
  }): Promise<IMeritUnit | null>;

  setUnitActive(params: {
    readonly unitId: string;
    readonly isActive: boolean;
  }): Promise<IMeritUnit | null>;

  softDeleteUnit(unitId: string): Promise<boolean>;

  createDeclaration(params: {
    readonly unitId: string;
    readonly userId: string;
    readonly declaredAmount: number;
    readonly status: MeritDeclarationStatus;
    readonly isAnonymous: boolean;
    readonly note: string | null;
  }): Promise<IMeritDeclaration>;

  findDeclarationByGlobalId(
    globalId: string,
  ): Promise<IMeritDeclaration | null>;

  /**
   * Đổi `INTENDED` sang `COMPLETED`.
   *
   * Chỉ người khai đổi được, và chỉ một chiều. `COMPLETED` quay về `INTENDED` là sửa lại
   * một lời khai đã công bố trên Sổ vàng — muốn vậy thì xoá hàng, không lùi trạng thái.
   *
   * Trả `null` khi hàng không còn `INTENDED` hoặc không thuộc người gọi.
   */
  markDeclarationCompleted(params: {
    readonly declarationId: string;
    readonly userId: string;
  }): Promise<IMeritDeclaration | null>;

  /**
   * Sổ vàng công khai của một đơn vị.
   *
   * Tên người khai do repository xử lý: hàng ẩn danh KHÔNG mang tên ra khỏi đây, nên không
   * đường đọc nào ở trên có cơ hội làm lộ. Ẩn ở tầng gần dữ liệu nhất là cách duy nhất để
   * một endpoint mới thêm sau này không tự tạo một lối rò.
   */
  listLedger(query: {
    readonly unitId: string;
    readonly limit: number;
    readonly offset: number;
  }): Promise<{ readonly items: IMeritLedgerEntry[]; readonly total: number }>;

  /** Lời khai của chính người gọi — KHÔNG ẩn danh, vì họ xem lịch sử của mình. */
  listOwnDeclarations(query: {
    readonly userId: string;
    readonly limit: number;
    readonly offset: number;
  }): Promise<{ readonly items: IMeritDeclaration[]; readonly total: number }>;

  /**
   * Tổng số tiền ĐÃ KHAI của một đơn vị, kèm số lượt khai.
   *
   * Tên hàm mang chữ `Declared` là bắt buộc, không phải trang trí: con số này dựng từ lời
   * khai không kiểm được. Một hàm tên `getTotalReceived` sẽ bị dùng để in "Chùa X đã nhận
   * 500 triệu" lên trang công khai, và Bên A sẽ bị hỏi con số đó rồi không trả lời được.
   *
   * Chỉ đếm hàng `COMPLETED` — `INTENDED` là dự định, cộng nó vào tổng là nói quá.
   */
  getDeclaredTotals(unitId: string): Promise<{
    readonly totalDeclaredAmount: number;
    readonly completedCount: number;
  }>;
}

export const IMeritRepository = Symbol('IMeritRepository');
