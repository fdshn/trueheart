import {
  IMeritDeclaration,
  IMeritLedgerEntry,
  IMeritUnit,
} from '@/domain/ports/repository';
import { IUseCase } from '@chantam/service.common-lib';

/**
 * Đơn vị Công đức kèm mã VietQR đã dựng sẵn.
 *
 * Mã dựng ở backend một lần thay vì để mỗi client tự ghép: thứ tự tham số và cách encode
 * phần nội dung chuyển khoản là chỗ dễ lệch, và hai client ghép khác nhau sẽ cho hai mã
 * khác nhau cho cùng một đơn vị.
 */
export interface IMeritUnitView extends IMeritUnit {
  readonly vietQrUrl: string;
  /**
   * Tổng số tiền ĐÃ KHAI và số lượt khai hoàn tất.
   *
   * Tên trường mang chữ `Declared` là bắt buộc: con số dựng từ lời khai không kiểm được
   * (UI-MERIT-01). Đổi tên nó thành `totalReceived` là biến một lời khai thành một khẳng
   * định kế toán mà Bên A không chứng minh được.
   */
  readonly totalDeclaredAmount: number;
  readonly completedCount: number;
}

export interface IWriteMeritUnitInput {
  readonly name: string;
  readonly slug?: string;
  readonly unitType: string;
  readonly purpose: string;
  readonly description?: string;
  readonly coverUrl?: string;
  readonly addressLabel?: string;
  readonly lat?: number;
  readonly lng?: number;
  readonly bankBin: string;
  readonly bankAccountNumber: string;
  readonly bankAccountName: string;
  readonly bankName?: string;
  readonly displayOrder?: number;
}

export interface ICreateMeritUnitCommand extends IWriteMeritUnitInput {
  readonly actorUserId: string;
}

export interface ICreateMeritUnitUseCase extends IUseCase<
  ICreateMeritUnitCommand,
  IMeritUnitView
> {}

export const ICreateMeritUnitUseCase = Symbol('ICreateMeritUnitUseCase');

export interface IUpdateMeritUnitCommand extends Partial<IWriteMeritUnitInput> {
  readonly actorUserId: string;
  readonly unitId: string;
}

export interface IUpdateMeritUnitUseCase extends IUseCase<
  IUpdateMeritUnitCommand,
  IMeritUnitView
> {}

export const IUpdateMeritUnitUseCase = Symbol('IUpdateMeritUnitUseCase');

export interface IMeritUnitPageResult {
  readonly items: IMeritUnitView[];
  readonly total: number;
}

export interface IListPublicMeritUnitsCommand {
  readonly limit: number;
  readonly offset: number;
}

export interface IListPublicMeritUnitsUseCase extends IUseCase<
  IListPublicMeritUnitsCommand,
  IMeritUnitPageResult
> {}

export const IListPublicMeritUnitsUseCase = Symbol(
  'IListPublicMeritUnitsUseCase',
);

export interface IListAdminMeritUnitsCommand {
  readonly actorUserId: string;
  readonly limit: number;
  readonly offset: number;
  readonly includeInactive: boolean;
}

export interface IListAdminMeritUnitsUseCase extends IUseCase<
  IListAdminMeritUnitsCommand,
  IMeritUnitPageResult
> {}

export const IListAdminMeritUnitsUseCase = Symbol(
  'IListAdminMeritUnitsUseCase',
);

export interface IGetMeritUnitCommand {
  readonly idOrSlug: string;
}

export interface IGetMeritUnitResult {
  readonly unit: IMeritUnitView;
  readonly ledger: IMeritLedgerEntry[];
  readonly ledgerTotal: number;
}

export interface IGetMeritUnitUseCase extends IUseCase<
  IGetMeritUnitCommand,
  IGetMeritUnitResult
> {}

export const IGetMeritUnitUseCase = Symbol('IGetMeritUnitUseCase');

export interface ISetMeritUnitActiveCommand {
  readonly actorUserId: string;
  readonly unitId: string;
  readonly isActive: boolean;
}

export interface ISetMeritUnitActiveUseCase extends IUseCase<
  ISetMeritUnitActiveCommand,
  IMeritUnitView
> {}

export const ISetMeritUnitActiveUseCase = Symbol('ISetMeritUnitActiveUseCase');

export interface IDeleteMeritUnitCommand {
  readonly actorUserId: string;
  readonly unitId: string;
}

export interface IDeleteMeritUnitResult {
  readonly deleted: true;
}

export interface IDeleteMeritUnitUseCase extends IUseCase<
  IDeleteMeritUnitCommand,
  IDeleteMeritUnitResult
> {}

export const IDeleteMeritUnitUseCase = Symbol('IDeleteMeritUnitUseCase');

export interface IDeclareMeritCommand {
  readonly actorUserId: string;
  readonly unitId: string;
  readonly declaredAmount: number;
  readonly status: string;
  readonly isAnonymous?: boolean;
  readonly note?: string;
}

export interface IDeclareMeritResult {
  readonly declaration: IMeritDeclaration;
  /**
   * Mã VietQR đã gắn đúng số tiền vừa khai.
   *
   * Đây là lý do lời khai đi TRƯỚC khi mở app ngân hàng: không có nó thì người dùng phải tự
   * nhập số tiền trong app, và con số trên Sổ vàng sẽ lệch với con số thật ngay từ bước đầu.
   */
  readonly vietQrUrl: string;
}

export interface IDeclareMeritUseCase extends IUseCase<
  IDeclareMeritCommand,
  IDeclareMeritResult
> {}

export const IDeclareMeritUseCase = Symbol('IDeclareMeritUseCase');

export interface ICompleteMeritDeclarationCommand {
  readonly actorUserId: string;
  readonly declarationId: string;
}

export interface ICompleteMeritDeclarationUseCase extends IUseCase<
  ICompleteMeritDeclarationCommand,
  IMeritDeclaration
> {}

export const ICompleteMeritDeclarationUseCase = Symbol(
  'ICompleteMeritDeclarationUseCase',
);

export interface IListOwnMeritDeclarationsCommand {
  readonly actorUserId: string;
  readonly limit: number;
  readonly offset: number;
}

export interface IListOwnMeritDeclarationsResult {
  readonly items: IMeritDeclaration[];
  readonly total: number;
}

export interface IListOwnMeritDeclarationsUseCase extends IUseCase<
  IListOwnMeritDeclarationsCommand,
  IListOwnMeritDeclarationsResult
> {}

export const IListOwnMeritDeclarationsUseCase = Symbol(
  'IListOwnMeritDeclarationsUseCase',
);
