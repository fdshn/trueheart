import { IGeoPoint } from '@chantam/service.persistency-lib/geo';
import { GiftPostConditions, GiftPostStatuses } from '../../consts';
import { IPostEntity } from '../../entities';

export interface ICreatePostDto {
  title: string;
  description: string;
  categoryId: string;
  condition: GiftPostConditions;
  estimatedValue: number;
  location: IGeoPoint;
  areaLabel: string;
  totalQuantity?: number;
}

export interface ICreatePostBodyDto {
  post: ICreatePostDto;
}

export interface ICreatePostResponseDto {
  post: IPostEntity;
}

export interface IGetPostParamsDto {
  postId: string;
}

export interface IGetPostResponseDto {
  post: IPostEntity;
  isLocationApproximate: boolean;
}

export interface IModeratePostParamsDto {
  postId: string;
}

export interface IModeratePostDto {
  status: GiftPostStatuses.PUBLISHED | GiftPostStatuses.REJECTED;
}

export interface IModeratePostBodyDto {
  post: IModeratePostDto;
}

export interface IModeratePostResponseDto {
  post: IPostEntity;
}
