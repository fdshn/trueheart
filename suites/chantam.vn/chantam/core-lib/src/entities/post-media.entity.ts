import { IBaseEntity } from '@chantam/service.persistency-lib/entities';
import { IPostMedia } from '../models/post-media';

export interface IPostMediaEntity extends IBaseEntity, IPostMedia {}

export const IPostMediaEntity = Symbol('IPostMediaEntity');
