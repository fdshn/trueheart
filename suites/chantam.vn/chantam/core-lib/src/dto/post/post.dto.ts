import {
  IPaginationMetaDto,
  IPaginationQueryDto,
} from '@chantam/service.common-lib/dto';
import { IGeoPoint } from '@chantam/service.persistency-lib/geo';
import {
  GenericMvpPostType,
  GiftPostConditions,
  GiftPostStatuses,
  PostTypes,
  PublicDiscoveryPostType,
} from '../../consts';
import { IPostEntity, IPostMediaEntity } from '../../entities';

export interface ICreatePostCommonDto {
  postType: GenericMvpPostType;
  title: string;
  description: string;
  categoryId: string;
  location: IGeoPoint;
  areaLabel: string;
}

export interface ICreateOfferPostDto extends ICreatePostCommonDto {
  postType: PostTypes.OFFER;
  condition: GiftPostConditions;
  estimatedValue: number;
  totalQuantity?: number;
}

export interface ICreateGenericMvpPostDto extends ICreatePostCommonDto {
  postType:
    | PostTypes.WANTED
    | PostTypes.CHARITY
    | PostTypes.CLASSIFIED
    | PostTypes.MERIT;
}

export interface ICreatePostDto extends ICreatePostCommonDto {
  condition?: GiftPostConditions;
  estimatedValue?: number;
  totalQuantity?: number;
  /** Giá bán, chỉ dùng cho bài CLASSIFIED. Đơn vị VND, số nguyên. */
  price?: number;
  /** Có thương lượng giá hay không. Chỉ dùng cho bài CLASSIFIED. */
  negotiable?: boolean;
}

export interface ICreatePostBodyDto {
  post: ICreatePostDto;
}

export interface ICreatePostResponseDto {
  post: IPostEntity;
}

export interface IGetNearbyPostsQueryDto extends IPaginationQueryDto {
  lat: number;
  lng: number;
  radiusMeters: number;
  postType: PublicDiscoveryPostType;
  categoryId?: string;
}

export interface IGetMyPostsQueryDto extends IPaginationQueryDto {
  postType?: PostTypes;
  status?: GiftPostStatuses;
  categoryId?: string;
}

export interface IGetMyPostsResponseDto {
  posts: IPostEntity[];
  meta: IPaginationMetaDto;
}

export interface INearbyPostDto {
  post: IPostEntity;
  distanceMeters: number;
  isLocationApproximate: true;
}

export interface IGetNearbyPostsResponseDto {
  posts: INearbyPostDto[];
  meta: IPaginationMetaDto;
}

/** Vì sao một bài được gợi ý. Giao diện dịch các mã này ra tiếng Việt. */
export type SmartMatchReason = 'SAME_CATEGORY' | 'KEYWORD_MATCH' | 'NEARBY';

export interface ISmartMatchDto {
  post: IPostEntity;
  distanceMeters: number;
  isLocationApproximate: true;
  /** Độ khớp trong [0, 1], đọc được như phần trăm. */
  score: number;
  reasons: SmartMatchReason[];
}

export interface IGetSmartMatchesResponseDto {
  /** Bài được đem đi ghép. */
  sourcePostId: string;
  radiusMeters: number;
  matches: ISmartMatchDto[];
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
  condition?: GiftPostConditions;
  estimatedValue?: number;
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
