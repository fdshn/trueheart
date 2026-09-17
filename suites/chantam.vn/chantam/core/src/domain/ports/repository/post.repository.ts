import { PostTypes } from '@chantam.vn/chantam.core-lib/consts';
import { IPostEntity } from '@chantam.vn/chantam.core-lib/entities';
import { IGeoPoint } from '@chantam/service.persistency-lib/geo';
import { Repository } from 'typeorm';

export interface IFindPostMapMarkersParams {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
  origin?: IGeoPoint;
  postType?: PostTypes;
  categoryId?: string;
}

export interface IPostMapMarker {
  globalId: string;
  postType: PostTypes;
  categoryId: string;
  areaLabel: string;
  location: IGeoPoint;
  distanceMeters?: number;
}

export interface IPostRepository extends Repository<IPostEntity> {
  createOfferWithinQuota(
    authorId: string,
    quota: number,
    post: Omit<IPostEntity, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<boolean>;
  transitionPendingReview(
    postId: string,
    status: 'PUBLISHED' | 'REJECTED',
    expiresAt: Date | null,
  ): Promise<IPostEntity | null>;
  findMapMarkers(params: IFindPostMapMarkersParams): Promise<IPostMapMarker[]>;
  findPublicByGlobalId(globalId: string): Promise<IPostEntity | null>;
}

export const IPostRepository = Symbol('IPostRepository');
