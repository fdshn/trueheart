import { PublicDiscoveryPostType } from '../../consts';

export interface IDiscoveryConfigResponseDto {
  minRadiusMeters: number;
  maxRadiusMeters: number;
  defaultPageSize: number;
  maxPageSize: number;
  supportedPostTypes: PublicDiscoveryPostType[];
}
