import {
  ICompleteRecitationUseCase,
  ICreateDedicationUseCase,
  ICreateDharmaContentUseCase,
  ICreateThreadUseCase,
  IDeleteDharmaContentUseCase,
  IGetDharmaContentUseCase,
  IGetDharmaHubUseCase,
  IGetThreadUseCase,
  IListAdminDharmaContentsUseCase,
  IListAdminThreadsUseCase,
  IListOwnDedicationsUseCase,
  IListOwnRecitationsUseCase,
  IListPublicDedicationsUseCase,
  IListPublicDharmaContentsUseCase,
  IListPublicThreadsUseCase,
  IModerateThreadUseCase,
  IStartRecitationUseCase,
  IUpdateDharmaContentUseCase,
} from '@/application/contracts/dharma';
import { Global, Module } from '@nestjs/common';
import {
  CreateDedicationUseCase,
  CreateThreadUseCase,
  GetThreadUseCase,
  ListAdminThreadsUseCase,
  ListOwnDedicationsUseCase,
  ListPublicDedicationsUseCase,
  ListPublicThreadsUseCase,
  ModerateThreadUseCase,
} from './dharma-forum.use-cases';
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
 *
 * ## Mười tám provider, và một lượt vá script đã suýt làm hỏng nó
 *
 * Bản F73 phần B thêm tám provider vào file này bằng một script Python. Lượt thay thế vào
 * mảng `providers` KHÔNG có `assert`, và nó âm thầm không khớp (prettier đã tách dòng neo
 * thành nhiều dòng từ lượt trước). Kết quả: tám `Symbol` nằm trong `exports` mà không có
 * trong `providers`, và Nest ném `UnknownExportException` ngay lúc boot.
 *
 * Hai điều rút ra, ghi ở đây vì đây là nơi lỗi hiện ra:
 *
 * - **Mọi lượt vá bằng script phải có `assert`.** Một lượt thay thế không khớp mà im lặng là
 *   một lượt sửa không xảy ra, và nó trông giống hệt một lượt sửa thành công.
 * - **Chỉ boot thật bắt được.** 164 suite và 1232 test đều xanh với lỗi này nằm trong file,
 *   vì mọi spec dựng use case bằng `new` chứ không qua DI container.
 */
@Global()
@Module({
  providers: [
    // -- Engine nội dung và tụng kinh (UC-DHARMA-01, UC-DHARMA-02) ------------
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

    // -- Diễn đàn và Hồi hướng (UC-DHARMA-03, UC-DHARMA-04) ------------------
    { provide: ICreateThreadUseCase, useClass: CreateThreadUseCase },
    { provide: IListPublicThreadsUseCase, useClass: ListPublicThreadsUseCase },
    { provide: IGetThreadUseCase, useClass: GetThreadUseCase },
    { provide: IListAdminThreadsUseCase, useClass: ListAdminThreadsUseCase },
    { provide: IModerateThreadUseCase, useClass: ModerateThreadUseCase },
    { provide: ICreateDedicationUseCase, useClass: CreateDedicationUseCase },
    {
      provide: IListPublicDedicationsUseCase,
      useClass: ListPublicDedicationsUseCase,
    },
    {
      provide: IListOwnDedicationsUseCase,
      useClass: ListOwnDedicationsUseCase,
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
    ICreateThreadUseCase,
    IListPublicThreadsUseCase,
    IGetThreadUseCase,
    IListAdminThreadsUseCase,
    IModerateThreadUseCase,
    ICreateDedicationUseCase,
    IListPublicDedicationsUseCase,
    IListOwnDedicationsUseCase,
  ],
})
export class DharmaUseCaseModule {}
