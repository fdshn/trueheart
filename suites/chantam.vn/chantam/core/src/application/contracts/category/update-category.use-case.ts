import {
  IUpdateCategoryBodyDto,
  IUpdateCategoryResponseDto,
} from '@chantam.vn/chantam.core-lib/dto';
import { IUseCase } from '@chantam/service.common-lib';
export interface IUpdateCategoryCommand extends IUpdateCategoryBodyDto {
  categoryId: string;
  userId: string;
  username: string;
}
export interface IUpdateCategoryUseCase extends IUseCase<
  IUpdateCategoryCommand,
  IUpdateCategoryResponseDto
> {}
export const IUpdateCategoryUseCase = Symbol('IUpdateCategoryUseCase');
