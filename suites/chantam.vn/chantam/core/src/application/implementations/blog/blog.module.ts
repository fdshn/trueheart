import {
  ICreateBlogUseCase,
  IDeleteBlogUseCase,
  IGetPublicBlogUseCase,
  IListAdminBlogsUseCase,
  IListPublicBlogsUseCase,
  IUpdateBlogUseCase,
} from '@/application/contracts/blog';
import { Global, Module } from '@nestjs/common';
import {
  CreateBlogUseCase,
  DeleteBlogUseCase,
  GetPublicBlogUseCase,
  ListAdminBlogsUseCase,
  ListPublicBlogsUseCase,
  UpdateBlogUseCase,
} from './blog.use-cases';

/**
 * `@Global()` như mọi feature module khác của tầng application.
 *
 * `ApplicationModule` KHÔNG `@Global()`, nên controller chỉ thấy use case khi module khai
 * nó là global. Thiếu dòng này thì Nest ném `can't resolve dependencies` ngay lúc boot, và
 * không một unit test nào bắt được — mọi spec dựng use case bằng `new`.
 */
@Global()
@Module({
  providers: [
    { provide: IListAdminBlogsUseCase, useClass: ListAdminBlogsUseCase },
    { provide: ICreateBlogUseCase, useClass: CreateBlogUseCase },
    { provide: IUpdateBlogUseCase, useClass: UpdateBlogUseCase },
    { provide: IDeleteBlogUseCase, useClass: DeleteBlogUseCase },
    { provide: IListPublicBlogsUseCase, useClass: ListPublicBlogsUseCase },
    { provide: IGetPublicBlogUseCase, useClass: GetPublicBlogUseCase },
  ],
  exports: [
    IListAdminBlogsUseCase,
    ICreateBlogUseCase,
    IUpdateBlogUseCase,
    IDeleteBlogUseCase,
    IListPublicBlogsUseCase,
    IGetPublicBlogUseCase,
  ],
})
export class BlogUseCaseModule {}
