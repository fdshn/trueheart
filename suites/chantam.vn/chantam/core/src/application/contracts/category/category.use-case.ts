import {
  ICreateCategoryBodyDto,
  ICreateCategoryResponseDto,
  IGetCategoryTreeResponseDto,
} from '@chantam.vn/chantam.core-lib/dto';
import { IUseCase } from '@chantam/service.common-lib';
export interface ICreateCategoryCommand extends ICreateCategoryBodyDto {
  userId: string;
  username: string;
}
export interface ICreateCategoryUseCase extends IUseCase<
  ICreateCategoryCommand,
  ICreateCategoryResponseDto
> {}
export interface IGetCategoryTreeUseCase extends IUseCase<
  Record<string, never>,
  IGetCategoryTreeResponseDto
> {}
export const ICreateCategoryUseCase = Symbol('ICreateCategoryUseCase');
export const IGetCategoryTreeUseCase = Symbol('IGetCategoryTreeUseCase');
