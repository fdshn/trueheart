import { S3Client } from '@aws-sdk/client-s3';
import { IObjectStorage, IPostMediaUploadRequest, IStorageUploadRequest, IStorageUploadResult, ITransactionEvidenceUploadRequest } from '../contracts';
import { IStorageModuleOptions } from './storage-options';
export declare function assertAvatarUploadPolicy(request: IStorageUploadRequest): void;
export declare function assertPostMediaUploadPolicy(request: IPostMediaUploadRequest): void;
export declare function assertTransactionEvidenceUploadPolicy(request: ITransactionEvidenceUploadRequest): void;
export declare class StorageService implements IObjectStorage {
    private readonly client;
    private readonly options;
    constructor(client: S3Client, options: IStorageModuleOptions);
    confirmAvatarUpload(userId: string, key: string): Promise<string>;
    confirmPostMediaUpload(userId: string, postId: string, key: string): Promise<void>;
    confirmTransactionEvidenceUpload(userId: string, transactionId: string, key: string): Promise<void>;
    createTransactionEvidenceUpload(request: ITransactionEvidenceUploadRequest): Promise<IStorageUploadResult>;
    createPostMediaUpload(request: IPostMediaUploadRequest): Promise<IStorageUploadResult>;
    createAvatarUpload(request: IStorageUploadRequest): Promise<IStorageUploadResult>;
}
//# sourceMappingURL=storage.service.d.ts.map