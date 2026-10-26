import { IOpenDirectPostRoomResponseDto } from '@chantam.vn/chantam.core-lib/dto';
import { IUseCase } from '@chantam/service.common-lib';

export interface IOpenDirectPostRoomCommand {
  userId: string;
  postId: string;
}

export interface IOpenDirectPostRoomUseCase extends IUseCase<
  IOpenDirectPostRoomCommand,
  IOpenDirectPostRoomResponseDto
> {}

export const IOpenDirectPostRoomUseCase = Symbol('IOpenDirectPostRoomUseCase');
