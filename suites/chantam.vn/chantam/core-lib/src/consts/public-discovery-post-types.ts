import { PostTypes } from './post-types';

export const PublicDiscoveryPostTypes = [
  PostTypes.OFFER,
  PostTypes.WANTED,
] as const;

export type PublicDiscoveryPostType = (typeof PublicDiscoveryPostTypes)[number];
