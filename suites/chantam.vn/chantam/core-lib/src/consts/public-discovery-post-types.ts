import { GenericMvpPostTypes } from './generic-mvp-post-types';

export const PublicDiscoveryPostTypes = GenericMvpPostTypes;

export type PublicDiscoveryPostType = (typeof PublicDiscoveryPostTypes)[number];
