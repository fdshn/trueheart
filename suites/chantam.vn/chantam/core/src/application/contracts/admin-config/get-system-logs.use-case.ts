import { ISystemLogEntry, SystemLogTypes } from '@/domain/ports/repository';
import { IUseCase } from '@chantam/service.common-lib';
import { IPaginationMetaDto } from '@chantam/service.common-lib/dto';

export interface IGetSystemLogsCommand {
  actorUserId: string;
  logType: SystemLogTypes;
  userId?: string;
  action?: string;
  from?: Date;
  to?: Date;
  page: number;
  pageSize: number;
}

export interface IGetSystemLogsResult {
  entries: ISystemLogEntry[];
  meta: IPaginationMetaDto;
}

export interface IGetSystemLogsUseCase extends IUseCase<
  IGetSystemLogsCommand,
  IGetSystemLogsResult
> {}

export const IGetSystemLogsUseCase = Symbol('IGetSystemLogsUseCase');
