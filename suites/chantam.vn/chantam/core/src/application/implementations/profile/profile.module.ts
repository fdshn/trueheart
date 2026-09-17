import {
  IGetOwnProfileUseCase,
  IGetPublicProfileUseCase,
  IUpdateOwnProfileUseCase,
} from '@/application/contracts/profile';
import { Global, Module } from '@nestjs/common';
import { GetOwnProfileUseCase } from './get-own-profile.use-case';
import { GetPublicProfileUseCase } from './get-public-profile.use-case';
import { UpdateOwnProfileUseCase } from './update-own-profile.use-case';

@Global()
@Module({
  providers: [
    { provide: IGetOwnProfileUseCase, useClass: GetOwnProfileUseCase },
    { provide: IGetPublicProfileUseCase, useClass: GetPublicProfileUseCase },
    { provide: IUpdateOwnProfileUseCase, useClass: UpdateOwnProfileUseCase },
  ],
  exports: [
    IGetOwnProfileUseCase,
    IGetPublicProfileUseCase,
    IUpdateOwnProfileUseCase,
  ],
})
export class ProfileModule {}
