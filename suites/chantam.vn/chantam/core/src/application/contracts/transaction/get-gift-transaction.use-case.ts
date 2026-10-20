import { GiftEvidenceKinds } from '@chantam.vn/chantam.core-lib/consts';
import { IGiftTransactionDto } from '@chantam.vn/chantam.core-lib/dto';
import { IUseCase } from '@chantam/service.common-lib';

export interface IGetGiftTransactionCommand {
  transactionId: string;
  /** Người gọi; phải là một trong hai bên của lượt trao. */
  userId: string;
}

/** Một ảnh bằng chứng, kèm URL mở được — cùng hình dạng cho hai bên và cho Admin. */
export interface IGiftEvidenceItem {
  readonly kind: GiftEvidenceKinds;
  readonly slot: number;
  readonly url: string;
  readonly uploadedBy: string;
  readonly createdAt: Date;
}

export interface IGetGiftTransactionResult {
  transaction: IGiftTransactionDto;
  /** Ảnh bàn giao / nhận / hàng quay về, theo mốc rồi theo slot. */
  evidence: IGiftEvidenceItem[];
}

export interface IGetGiftTransactionUseCase extends IUseCase<
  IGetGiftTransactionCommand,
  IGetGiftTransactionResult
> {}

export const IGetGiftTransactionUseCase = Symbol('IGetGiftTransactionUseCase');
