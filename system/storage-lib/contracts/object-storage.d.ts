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
}
export declare const IObjectStorage: unique symbol;
//# sourceMappingURL=object-storage.d.ts.map