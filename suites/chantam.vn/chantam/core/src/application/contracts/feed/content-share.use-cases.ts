import { ContentSubjectTypes } from '@chantam.vn/chantam.core-lib/consts';
import { IRecordShareResponseDto } from '@chantam.vn/chantam.core-lib/dto';
import { IUseCase } from '@chantam/service.common-lib';

export interface IRecordContentShareCommand {
  userId: string;
  subjectType: ContentSubjectTypes;
  subjectId: string;
  /** Kênh người dùng chọn. Bỏ trống thì lưu `null`. */
  channel?: string;
}

export type IRecordContentShareResult = IRecordShareResponseDto;

export interface IRecordContentShareUseCase extends IUseCase<
  IRecordContentShareCommand,
  IRecordContentShareResult
> {}

export const IRecordContentShareUseCase = Symbol('IRecordContentShareUseCase');
