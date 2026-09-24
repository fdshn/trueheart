import {
  IConfirmPhoneVerificationUseCase,
  IGetOwnProfileUseCase,
  IGetPublicProfileUseCase,
  IRequestAvatarUploadUseCase,
  IRequestPhoneVerificationUseCase,
  IUpdateOwnProfileUseCase,
} from '@/application/contracts/profile';
import { Global, Module } from '@nestjs/common';
import { ConfirmPhoneVerificationUseCase } from './confirm-phone-verification.use-case';
import { GetOwnProfileUseCase } from './get-own-profile.use-case';
import { GetPublicProfileUseCase } from './get-public-profile.use-case';
import { RequestAvatarUploadUseCase } from './request-avatar-upload.use-case';
import { RequestPhoneVerificationUseCase } from './request-phone-verification.use-case';
import { UpdateOwnProfileUseCase } from './update-own-profile.use-case';

@Global()
@Module({
  providers: [
    {
      provide: IRequestAvatarUploadUseCase,
      useClass: RequestAvatarUploadUseCase,
    },
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
    IRequestAvatarUploadUseCase,
    IRequestPhoneVerificationUseCase,
    IConfirmPhoneVerificationUseCase,
    IGetOwnProfileUseCase,
    IGetPublicProfileUseCase,
    IUpdateOwnProfileUseCase,
  ],
})
export class ProfileModule {}
