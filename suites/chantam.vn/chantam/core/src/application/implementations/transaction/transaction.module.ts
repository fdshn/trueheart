import {
  ICancelGiftTransactionUseCase,
  ICompleteDueGiftDeliveriesUseCase,
  IConfirmGiftReceiptUseCase,
  IGetGiftTransactionUseCase,
  IListOwnGiftTransactionsUseCase,
  IMarkGiftHandedOverUseCase,
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

@Global()
@Module({
  providers: [
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
