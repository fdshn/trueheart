import {
  IOpenDirectUserRoomDto,
  IOpenDirectUserRoomResponseDto,
} from '@chantam.vn/chantam.core-lib/dto';
import { IUseCase } from '@chantam/service.common-lib';

export interface IOpenDirectUserRoomCommand {
  /** Người bấm "Nhắn tin". */
  userId: string;
  target: IOpenDirectUserRoomDto;
}

export interface IOpenDirectUserRoomUseCase extends IUseCase<
  IOpenDirectUserRoomCommand,
  IOpenDirectUserRoomResponseDto
> {}

export const IOpenDirectUserRoomUseCase = Symbol('IOpenDirectUserRoomUseCase');
