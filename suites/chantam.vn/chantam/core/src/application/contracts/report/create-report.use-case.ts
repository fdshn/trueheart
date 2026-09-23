import {
  ICreateReportBodyDto,
  ICreateReportResponseDto,
} from '@chantam.vn/chantam.core-lib/dto';
import { IUseCase } from '@chantam/service.common-lib';

export interface ICreateReportCommand extends ICreateReportBodyDto {
  reporterUserId: string;
}

export interface ICreateReportResult extends ICreateReportResponseDto {}

export interface ICreateReportUseCase extends IUseCase<
  ICreateReportCommand,
  ICreateReportResult
> {}

export const ICreateReportUseCase = Symbol('ICreateReportUseCase');
