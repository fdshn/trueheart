export interface IStorageUploadRequest {
    userId: string;
    contentType: string;
    contentLength: number;
}
export interface IStorageUploadResult {
    key: string;
    uploadUrl: string;
    expiresInSeconds: number;
    publicUrl: string;
}
export interface IPostMediaUploadRequest extends IStorageUploadRequest {
    postId: string;
}
export interface ITransactionEvidenceUploadRequest extends IStorageUploadRequest {
    transactionId: string;
}
export interface ICommentMediaUploadRequest extends IStorageUploadRequest {
    subjectType: string;
    subjectId: string;
}
export interface IObjectStorage {
    createAvatarUpload(request: IStorageUploadRequest): Promise<IStorageUploadResult>;
    createPostMediaUpload(request: IPostMediaUploadRequest): Promise<IStorageUploadResult>;
    confirmAvatarUpload(userId: string, key: string): Promise<string>;
    confirmPostMediaUpload(userId: string, postId: string, key: string): Promise<void>;
    createTransactionEvidenceUpload(request: ITransactionEvidenceUploadRequest): Promise<IStorageUploadResult>;
    confirmTransactionEvidenceUpload(userId: string, transactionId: string, key: string): Promise<void>;
    createCommentMediaUpload(request: ICommentMediaUploadRequest): Promise<IStorageUploadResult>;
    confirmCommentMediaUpload(userId: string, subjectType: string, subjectId: string, key: string): Promise<void>;
}
export declare const IObjectStorage: unique symbol;
//# sourceMappingURL=object-storage.d.ts.map