import {
  IBlockUserUseCase,
  IListBlockedUsersUseCase,
  IUnblockUserUseCase,
} from '@/application/contracts/user-block';
import { Global, Module } from '@nestjs/common';
import {
  BlockUserUseCase,
  ListBlockedUsersUseCase,
  UnblockUserUseCase,
} from './user-block.use-cases';

/** `@Global()` như mọi feature module của tầng application — xem `DharmaModule`. */
@Global()
@Module({
  providers: [
    { provide: IBlockUserUseCase, useClass: BlockUserUseCase },
    { provide: IUnblockUserUseCase, useClass: UnblockUserUseCase },
    { provide: IListBlockedUsersUseCase, useClass: ListBlockedUsersUseCase },
  ],
  exports: [IBlockUserUseCase, IUnblockUserUseCase, IListBlockedUsersUseCase],
})
export class UserBlockModule {}
