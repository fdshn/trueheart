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
export interface IObjectStorage {
    createAvatarUpload(request: IStorageUploadRequest): Promise<IStorageUploadResult>;
    confirmAvatarUpload(userId: string, key: string): Promise<string>;
}
export declare const IObjectStorage: unique symbol;
//# sourceMappingURL=object-storage.d.ts.map