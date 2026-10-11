import {
  ICancelGiftTransactionUseCase,
  ICompleteDueGiftDeliveriesUseCase,
  IConfirmGiftReceiptUseCase,
  IGetGiftTransactionUseCase,
  IListOwnGiftTransactionsUseCase,
  IMarkGiftHandedOverUseCase,
  IReopenGiftTransactionUseCase,
  IReportShipUnpaidUseCase,
  IRequestGiftEvidenceUploadUseCase,
} from '@/application/contracts/transaction';
import { Global, Module } from '@nestjs/common';
import {
  MarkGiftHandedOverUseCase,
  RequestGiftEvidenceUploadUseCase,
} from './gift-evidence.use-cases';
import { ReportShipUnpaidUseCase } from './report-ship-unpaid.use-case';
import {
  CancelGiftTransactionUseCase,
  CompleteDueGiftDeliveriesUseCase,
  ConfirmGiftReceiptUseCase,
  GetGiftTransactionUseCase,
  ListOwnGiftTransactionsUseCase,
} from './transaction.use-cases';

import { ReopenGiftTransactionUseCase } from './reopen-gift-transaction.use-case';

import { RefundRedemptionOnCloseService } from './refund-redemption-on-close.service';

@Global()
@Module({
  providers: [
    // Hoàn điểm khi lượt trao đổi-bằng-điểm bị huỷ (CHỐT-13). Dùng chung bởi cả
    // hai đường đóng lượt trao, nên nó là provider chứ không phải một hàm chép
    // vào từng use case.
    RefundRedemptionOnCloseService,
    {
      provide: IReopenGiftTransactionUseCase,
      useClass: ReopenGiftTransactionUseCase,
    },
    {
      provide: IGetGiftTransactionUseCase,
      useClass: GetGiftTransactionUseCase,
    },
    { provide: IReportShipUnpaidUseCase, useClass: ReportShipUnpaidUseCase },
    {
      provide: IMarkGiftHandedOverUseCase,
      useClass: MarkGiftHandedOverUseCase,
    },
    {
      provide: IRequestGiftEvidenceUploadUseCase,
      useClass: RequestGiftEvidenceUploadUseCase,
    },

    {
      provide: IConfirmGiftReceiptUseCase,
      useClass: ConfirmGiftReceiptUseCase,
    },
    {
      provide: ICancelGiftTransactionUseCase,
      useClass: CancelGiftTransactionUseCase,
    },
    {
      provide: IListOwnGiftTransactionsUseCase,
      useClass: ListOwnGiftTransactionsUseCase,
    },
    {
      provide: ICompleteDueGiftDeliveriesUseCase,
      useClass: CompleteDueGiftDeliveriesUseCase,
    },
  ],
  exports: [
    IReopenGiftTransactionUseCase,
    IGetGiftTransactionUseCase,
    IReportShipUnpaidUseCase,
    IMarkGiftHandedOverUseCase,
    IRequestGiftEvidenceUploadUseCase,

    IConfirmGiftReceiptUseCase,
    ICancelGiftTransactionUseCase,
    IListOwnGiftTransactionsUseCase,
    ICompleteDueGiftDeliveriesUseCase,
  ],
})
export class TransactionModule {}
