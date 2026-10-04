import {
  ICompleteRecitationUseCase,
  ICreateDharmaContentUseCase,
  IDeleteDharmaContentUseCase,
  IGetDharmaContentUseCase,
  IGetDharmaHubUseCase,
  IListAdminDharmaContentsUseCase,
  IListOwnRecitationsUseCase,
  IListPublicDharmaContentsUseCase,
  IStartRecitationUseCase,
  IUpdateDharmaContentUseCase,
} from '@/application/contracts/dharma';
import { Global, Module } from '@nestjs/common';
import {
  CompleteRecitationUseCase,
  CreateDharmaContentUseCase,
  DeleteDharmaContentUseCase,
  GetDharmaContentUseCase,
  GetDharmaHubUseCase,
  ListAdminDharmaContentsUseCase,
  ListOwnRecitationsUseCase,
  ListPublicDharmaContentsUseCase,
  StartRecitationUseCase,
  UpdateDharmaContentUseCase,
} from './dharma.use-cases';

/**
 * `@Global()` như mọi feature module khác của tầng application.
 *
 * `ApplicationModule` KHÔNG `@Global()`, nên controller chỉ thấy use case khi module khai nó
 * là global. Thiếu dòng này thì Nest ném `can't resolve dependencies` ngay lúc boot, và KHÔNG
 * một unit test nào bắt được — mọi spec dựng use case bằng `new`.
 */
@Global()
@Module({
  providers: [
    { provide: IGetDharmaHubUseCase, useClass: GetDharmaHubUseCase },
    {
      provide: ICreateDharmaContentUseCase,
      useClass: CreateDharmaContentUseCase,
    },
    {
      provide: IUpdateDharmaContentUseCase,
      useClass: UpdateDharmaContentUseCase,
    },
    {
      provide: IListPublicDharmaContentsUseCase,
      useClass: ListPublicDharmaContentsUseCase,
    },
    {
      provide: IListAdminDharmaContentsUseCase,
      useClass: ListAdminDharmaContentsUseCase,
    },
    { provide: IGetDharmaContentUseCase, useClass: GetDharmaContentUseCase },
    {
      provide: IDeleteDharmaContentUseCase,
      useClass: DeleteDharmaContentUseCase,
    },
    { provide: IStartRecitationUseCase, useClass: StartRecitationUseCase },
    {
      provide: ICompleteRecitationUseCase,
      useClass: CompleteRecitationUseCase,
    },
    {
      provide: IListOwnRecitationsUseCase,
      useClass: ListOwnRecitationsUseCase,
    },
  ],
  exports: [
    IGetDharmaHubUseCase,
    ICreateDharmaContentUseCase,
    IUpdateDharmaContentUseCase,
    IListPublicDharmaContentsUseCase,
    IListAdminDharmaContentsUseCase,
    IGetDharmaContentUseCase,
    IDeleteDharmaContentUseCase,
    IStartRecitationUseCase,
    ICompleteRecitationUseCase,
    IListOwnRecitationsUseCase,
  ],
})
export class DharmaUseCaseModule {}
