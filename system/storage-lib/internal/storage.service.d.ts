import { S3Client } from '@aws-sdk/client-s3';
import { IObjectStorage, IStorageUploadRequest, IStorageUploadResult } from '../contracts';
import { IStorageModuleOptions } from './storage-options';
export declare function assertAvatarUploadPolicy(request: IStorageUploadRequest): void;
export declare class StorageService implements IObjectStorage {
    private readonly client;
    private readonly options;
    constructor(client: S3Client, options: IStorageModuleOptions);
    createAvatarUpload(request: IStorageUploadRequest): Promise<IStorageUploadResult>;
}
//# sourceMappingURL=storage.service.d.ts.map