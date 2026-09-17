export interface IStorageModuleOptions {
    endpoint: string;
    region: string;
    bucket: string;
    accessKeyId: string;
    secretAccessKey: string;
    publicBaseUrl: string;
    uploadExpiresInSeconds?: number;
}
export declare const IStorageOptions: unique symbol;
export declare const IS3Client: unique symbol;
//# sourceMappingURL=storage-options.d.ts.map