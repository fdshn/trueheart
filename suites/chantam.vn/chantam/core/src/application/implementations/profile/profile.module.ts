import {
  IConfirmPhoneVerificationUseCase,
  IGetOwnProfileUseCase,
  IGetPublicProfileUseCase,
  IRequestPhoneVerificationUseCase,
  IUpdateOwnProfileUseCase,
} from '@/application/contracts/profile';
import { Global, Module } from '@nestjs/common';
import { ConfirmPhoneVerificationUseCase } from './confirm-phone-verification.use-case';
import { GetOwnProfileUseCase } from './get-own-profile.use-case';
import { GetPublicProfileUseCase } from './get-public-profile.use-case';
import { RequestPhoneVerificationUseCase } from './request-phone-verification.use-case';
import { UpdateOwnProfileUseCase } from './update-own-profile.use-case';

@Global()
@Module({
  providers: [
    {
      provide: IRequestPhoneVerificationUseCase,
      useClass: RequestPhoneVerificationUseCase,
    },
    {
      provide: IConfirmPhoneVerificationUseCase,
      useClass: ConfirmPhoneVerificationUseCase,
    },
    { provide: IGetOwnProfileUseCase, useClass: GetOwnProfileUseCase },
    { provide: IGetPublicProfileUseCase, useClass: GetPublicProfileUseCase },
    { provide: IUpdateOwnProfileUseCase, useClass: UpdateOwnProfileUseCase },
  ],
  exports: [
    IRequestPhoneVerificationUseCase,
    IConfirmPhoneVerificationUseCase,
    IConfirmPhoneVerificationUseCase,
    IGetOwnProfileUseCase,
    IRequestPhoneVerificationUseCase,
    IGetPublicProfileUseCase,
    IUpdateOwnProfileUseCase,
  ],
})
export class ProfileModule {}
