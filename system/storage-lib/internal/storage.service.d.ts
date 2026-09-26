import { S3Client } from '@aws-sdk/client-s3';
import { IChatMediaUploadRequest, ICommentMediaUploadRequest, IObjectStorage, IPostMediaUploadRequest, IStorageUploadRequest, IStorageUploadResult, ITransactionEvidenceUploadRequest } from '../contracts';
import { IStorageModuleOptions } from './storage-options';
export declare const MediaSizeLimits: {
    readonly avatar: number;
    readonly postMedia: number;
    readonly transactionEvidence: number;
    readonly chatMedia: number;
    readonly commentMedia: number;
};
export declare function assertAvatarUploadPolicy(request: IStorageUploadRequest): void;
export declare function assertPostMediaUploadPolicy(request: IPostMediaUploadRequest): void;
export declare function assertTransactionEvidenceUploadPolicy(request: ITransactionEvidenceUploadRequest): void;
export declare class StorageService implements IObjectStorage {
    private readonly client;
    private readonly options;
    constructor(client: S3Client, options: IStorageModuleOptions);
    private verifyObject;
    confirmAvatarUpload(userId: string, key: string): Promise<string>;
    confirmPostMediaUpload(userId: string, postId: string, key: string): Promise<void>;
    confirmTransactionEvidenceUpload(userId: string, transactionId: string, key: string): Promise<void>;
    confirmCommentMediaUpload(userId: string, subjectType: string, subjectId: string, key: string): Promise<void>;
    confirmChatMediaUpload(userId: string, roomId: string, key: string): Promise<void>;
    createCommentMediaUpload(request: ICommentMediaUploadRequest): Promise<IStorageUploadResult>;
    createTransactionEvidenceUpload(request: ITransactionEvidenceUploadRequest): Promise<IStorageUploadResult>;
    createPostMediaUpload(request: IPostMediaUploadRequest): Promise<IStorageUploadResult>;
    createAvatarUpload(request: IStorageUploadRequest): Promise<IStorageUploadResult>;
    createChatMediaUpload(request: IChatMediaUploadRequest): Promise<IStorageUploadResult>;
    deleteObjects(keys: readonly string[]): Promise<number>;
    listObjects(params: {
        prefix: string;
        cursor?: string;
        limit?: number;
    }): Promise<{
        objects: {
            key: string;
            lastModified: Date | null;
            size: number;
        }[];
        nextCursor: string | null;
    }>;
}
//# sourceMappingURL=storage.service.d.ts.map