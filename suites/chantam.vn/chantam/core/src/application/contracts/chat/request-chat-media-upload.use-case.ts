import { IRequestChatMediaUploadResponseDto } from '@chantam.vn/chantam.core-lib/dto';
import { IUseCase } from '@chantam/service.common-lib';

export interface IRequestChatMediaUploadCommand {
  userId: string;
  roomId: string;
  contentType: string;
  contentLength: number;
}

export type IRequestChatMediaUploadResult = IRequestChatMediaUploadResponseDto;

export interface IRequestChatMediaUploadUseCase extends IUseCase<
  IRequestChatMediaUploadCommand,
  IRequestChatMediaUploadResult
> {}

export const IRequestChatMediaUploadUseCase = Symbol(
  'IRequestChatMediaUploadUseCase',
);
