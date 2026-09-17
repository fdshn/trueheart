import { IGeoPoint } from '@chantam/service.persistency-lib/geo';
import { GiftPostConditions, GiftPostStatuses, PostTypes } from '../../consts';
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
