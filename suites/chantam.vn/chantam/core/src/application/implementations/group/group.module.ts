import {
  ICreateGroupUseCase,
  IGetOwnGroupUseCase,
} from '@/application/contracts/group';
import { Global, Module } from '@nestjs/common';
import { CreateGroupUseCase, GetOwnGroupUseCase } from './group.use-cases';

@Global()
@Module({
  providers: [
    { provide: ICreateGroupUseCase, useClass: CreateGroupUseCase },
    { provide: IGetOwnGroupUseCase, useClass: GetOwnGroupUseCase },
  ],
  exports: [ICreateGroupUseCase, IGetOwnGroupUseCase],
})
export class GroupModule {}
