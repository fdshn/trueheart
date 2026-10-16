import {
  ICompleteMeritDeclarationUseCase,
  ICreateMeritUnitUseCase,
  IDeclareMeritUseCase,
  IDeleteMeritUnitUseCase,
  IGetAdminMeritUnitUseCase,
  IGetMeritUnitUseCase,
  IListAdminMeritDeclarationsUseCase,
  IListAdminMeritUnitsUseCase,
  IListOwnMeritDeclarationsUseCase,
  IListPublicMeritUnitsUseCase,
  ISetMeritUnitActiveUseCase,
  IUpdateMeritUnitUseCase,
} from '@/application/contracts/merit';
import { Global, Module } from '@nestjs/common';
import {
  CompleteMeritDeclarationUseCase,
  CreateMeritUnitUseCase,
  DeclareMeritUseCase,
  DeleteMeritUnitUseCase,
  GetAdminMeritUnitUseCase,
  GetMeritUnitUseCase,
  ListAdminMeritDeclarationsUseCase,
  ListAdminMeritUnitsUseCase,
  ListOwnMeritDeclarationsUseCase,
  ListPublicMeritUnitsUseCase,
  SetMeritUnitActiveUseCase,
  UpdateMeritUnitUseCase,
} from './merit.use-cases';

/**
 * `@Global()` như mọi feature module khác của tầng application.
 *
 * `ApplicationModule` KHÔNG `@Global()`, nên controller chỉ thấy use case khi module khai nó
 * là global. Thiếu dòng này thì Nest ném `can't resolve dependencies` ngay lúc boot, và
 * KHÔNG một unit test nào bắt được.
 */
@Global()
@Module({
  providers: [
    { provide: ICreateMeritUnitUseCase, useClass: CreateMeritUnitUseCase },
    { provide: IUpdateMeritUnitUseCase, useClass: UpdateMeritUnitUseCase },
    {
      provide: IListPublicMeritUnitsUseCase,
      useClass: ListPublicMeritUnitsUseCase,
    },
    {
      provide: IListAdminMeritUnitsUseCase,
      useClass: ListAdminMeritUnitsUseCase,
    },
    { provide: IGetAdminMeritUnitUseCase, useClass: GetAdminMeritUnitUseCase },
    {
      provide: IListAdminMeritDeclarationsUseCase,
      useClass: ListAdminMeritDeclarationsUseCase,
    },
    { provide: IGetMeritUnitUseCase, useClass: GetMeritUnitUseCase },
    {
      provide: ISetMeritUnitActiveUseCase,
      useClass: SetMeritUnitActiveUseCase,
    },
    { provide: IDeleteMeritUnitUseCase, useClass: DeleteMeritUnitUseCase },
    { provide: IDeclareMeritUseCase, useClass: DeclareMeritUseCase },
    {
      provide: ICompleteMeritDeclarationUseCase,
      useClass: CompleteMeritDeclarationUseCase,
    },
    {
      provide: IListOwnMeritDeclarationsUseCase,
      useClass: ListOwnMeritDeclarationsUseCase,
    },
  ],
  exports: [
    ICreateMeritUnitUseCase,
    IUpdateMeritUnitUseCase,
    IListPublicMeritUnitsUseCase,
    IListAdminMeritUnitsUseCase,
    IGetAdminMeritUnitUseCase,
    IListAdminMeritDeclarationsUseCase,
    IGetMeritUnitUseCase,
    ISetMeritUnitActiveUseCase,
    IDeleteMeritUnitUseCase,
    IDeclareMeritUseCase,
    ICompleteMeritDeclarationUseCase,
    IListOwnMeritDeclarationsUseCase,
  ],
})
export class MeritUseCaseModule {}
