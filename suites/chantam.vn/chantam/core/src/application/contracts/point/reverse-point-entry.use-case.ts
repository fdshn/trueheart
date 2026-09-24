import {
  IReversePointEntryBodyDto,
  IReversePointEntryResponseDto,
} from '@chantam.vn/chantam.core-lib/dto';
import { IUseCase } from '@chantam/service.common-lib';

export interface IReversePointEntryCommand extends IReversePointEntryBodyDto {
  actorUserId: string;
  entryId: number;
}

export type IReversePointEntryResult = IReversePointEntryResponseDto;

export interface IReversePointEntryUseCase extends IUseCase<
  IReversePointEntryCommand,
  IReversePointEntryResult
> {}

export const IReversePointEntryUseCase = Symbol('IReversePointEntryUseCase');
