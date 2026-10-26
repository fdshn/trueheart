import { PresenceSurfaces } from '@chantam.vn/chantam.core-lib/consts';
import {
  IPresenceHeartbeatResponseDto,
  ISurfacePresenceResponseDto,
} from '@chantam.vn/chantam.core-lib/dto';
import { IUseCase } from '@chantam/service.common-lib';

export interface IPresenceHeartbeatCommand {
  userId: string;
  sessionId: string;
  surface: PresenceSurfaces;
}

export interface IPresenceHeartbeatUseCase extends IUseCase<
  IPresenceHeartbeatCommand,
  IPresenceHeartbeatResponseDto
> {}

export const IPresenceHeartbeatUseCase = Symbol('IPresenceHeartbeatUseCase');

export interface IGetSurfacePresenceCommand {
  surface: PresenceSurfaces;
}

export interface IGetSurfacePresenceUseCase extends IUseCase<
  IGetSurfacePresenceCommand,
  ISurfacePresenceResponseDto
> {}

export const IGetSurfacePresenceUseCase = Symbol('IGetSurfacePresenceUseCase');
