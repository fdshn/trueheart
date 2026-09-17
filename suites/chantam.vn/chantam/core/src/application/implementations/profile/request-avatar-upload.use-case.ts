import {
  IRequestAvatarUploadCommand,
  IRequestAvatarUploadUseCase,
} from '@/application/contracts/profile';
import { IObjectStorage } from '@chantam/service.storage-lib';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class RequestAvatarUploadUseCase implements IRequestAvatarUploadUseCase {
  public constructor(
    @Inject(IObjectStorage) private readonly storage: IObjectStorage,
  ) {}
  public async handle(command: IRequestAvatarUploadCommand) {
    return this.storage.createAvatarUpload(command);
  }
}
