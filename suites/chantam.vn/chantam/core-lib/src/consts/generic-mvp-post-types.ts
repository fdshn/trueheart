import { PostTypes } from './post-types';

export const GenericMvpPostTypes = [
  PostTypes.OFFER,
  PostTypes.WANTED,
  PostTypes.CHARITY,
  PostTypes.CLASSIFIED,
  PostTypes.MERIT,
] as const;

export type GenericMvpPostType = (typeof GenericMvpPostTypes)[number];
