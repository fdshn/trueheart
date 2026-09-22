import {
  IAcceptGiftRequestUseCase,
  ICancelGiftTransactionUseCase,
  ICompleteDueGiftDeliveriesUseCase,
  IConfirmGiftReceiptUseCase,
  IListOwnGiftTransactionsUseCase,
  IMarkGiftHandedOverUseCase,
  IReportShipUnpaidUseCase,
  IRequestGiftEvidenceUploadUseCase,
  IRequestGiftUseCase,
} from '@/application/contracts/transaction';
import { Global, Module } from '@nestjs/common';
import {
  MarkGiftHandedOverUseCase,
  RequestGiftEvidenceUploadUseCase,
} from './gift-evidence.use-cases';
import { ReportShipUnpaidUseCase } from './report-ship-unpaid.use-case';
import {
  AcceptGiftRequestUseCase,
  CancelGiftTransactionUseCase,
  CompleteDueGiftDeliveriesUseCase,
  ConfirmGiftReceiptUseCase,
  ListOwnGiftTransactionsUseCase,
  RequestGiftUseCase,
} from './transaction.use-cases';

@Global()
@Module({
  providers: [
    { provide: IReportShipUnpaidUseCase, useClass: ReportShipUnpaidUseCase },
    {
      provide: IMarkGiftHandedOverUseCase,
      useClass: MarkGiftHandedOverUseCase,
    },
    {
      provide: IRequestGiftEvidenceUploadUseCase,
      useClass: RequestGiftEvidenceUploadUseCase,
    },

    { provide: IRequestGiftUseCase, useClass: RequestGiftUseCase },
    { provide: IAcceptGiftRequestUseCase, useClass: AcceptGiftRequestUseCase },
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
    IReportShipUnpaidUseCase,
    IMarkGiftHandedOverUseCase,
    IRequestGiftEvidenceUploadUseCase,

    IRequestGiftUseCase,
    IAcceptGiftRequestUseCase,
    IConfirmGiftReceiptUseCase,
    ICancelGiftTransactionUseCase,
    IListOwnGiftTransactionsUseCase,
    ICompleteDueGiftDeliveriesUseCase,
  ],
})
export class TransactionModule {}
