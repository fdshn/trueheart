import { PostTypes } from '@chantam.vn/chantam.core-lib/consts';
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
export interface IGetCategoryTreeCommand {
  /** Bỏ trống thì trả cả cây, giữ nguyên hành vi cũ của client hiện tại. */
  postType?: PostTypes;
  includeInactive?: boolean;
  actorUserId?: string;
}
export interface IGetCategoryTreeUseCase extends IUseCase<
  IGetCategoryTreeCommand,
  IGetCategoryTreeResponseDto
> {}
export const ICreateCategoryUseCase = Symbol('ICreateCategoryUseCase');
export const IGetCategoryTreeUseCase = Symbol('IGetCategoryTreeUseCase');
