import {
  PostTypes,
  PublicDiscoveryPostType,
} from '@chantam.vn/chantam.core-lib/consts';
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

export interface IFindNearbyPostsParams {
  origin: IGeoPoint;
  radiusMeters: number;
  postType: PublicDiscoveryPostType;
  categoryId?: string;
  skip: number;
  take: number;
}

export interface INearbyPost {
  post: IPostEntity;
  distanceMeters: number;
}

export interface IFindNearbyPostsResult {
  items: INearbyPost[];
  total: number;
}

export interface IPostRepository extends Repository<IPostEntity> {
  createPostWithinQuota(
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
  findNearbyPosts(
    params: IFindNearbyPostsParams,
  ): Promise<IFindNearbyPostsResult>;
  findPublicByGlobalId(globalId: string): Promise<IPostEntity | null>;
  countPublishedByAuthor(authorId: string): Promise<number>;
}

export const IPostRepository = Symbol('IPostRepository');
