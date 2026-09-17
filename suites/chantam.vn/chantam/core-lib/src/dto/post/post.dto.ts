import { IGeoPoint } from '@chantam/service.persistency-lib/geo';
import { GiftPostConditions, GiftPostStatuses, PostTypes } from '../../consts';
import { IPostEntity, IPostMediaEntity } from '../../entities';

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

export interface ICreateWantedPostDto {
  title: string;
  description: string;
  categoryId: string;
  location: IGeoPoint;
  areaLabel: string;
}

export interface ICreateWantedPostBodyDto {
  post: ICreateWantedPostDto;
}

export interface ICreateWantedPostResponseDto {
  post: IPostEntity;
}

export interface IGetPostParamsDto {
  postId: string;
}

export interface IPublicPostMediaDto {
  id: number;
  url: string;
  sortOrder: number;
}

export interface IGetPostResponseDto {
  post: IPostEntity;
  media: IPublicPostMediaDto[];
  isLocationApproximate: boolean;
}

export interface IGetPostMapQueryDto {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
  originLat?: number;
  originLng?: number;
  postType?: PostTypes;
  categoryId?: string;
}

export interface IPostMapMarkerDto {
  postId: string;
  postType: PostTypes;
  categoryId: string;
  areaLabel: string;
  location: IGeoPoint;
  distanceMeters?: number;
  isLocationApproximate: true;
}

export interface IGetPostMapResponseDto {
  markers: IPostMapMarkerDto[];
}

export interface IUpdatePostDto {
  title?: string;
  description?: string;
  areaLabel?: string;
}

export interface IUpdatePostParamsDto {
  postId: string;
}

export interface IUpdatePostBodyDto {
  post: IUpdatePostDto;
}

export interface IUpdatePostResponseDto {
  post: IPostEntity;
}

export interface IAttachPostMediaDto {
  key: string;
}

export interface IAttachPostMediaBodyDto {
  media: IAttachPostMediaDto;
}

export interface IAttachPostMediaResponseDto {
  media: IPostMediaEntity;
}

export interface IReorderPostMediaDto {
  mediaIds: number[];
}

export interface IReorderPostMediaBodyDto {
  media: IReorderPostMediaDto;
}

export interface IReorderPostMediaResponseDto {
  media: IPostMediaEntity[];
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
