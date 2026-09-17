export interface IStorageModuleOptions {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicBaseUrl: string;
  uploadExpiresInSeconds?: number;
}

export const IStorageOptions = Symbol('IStorageOptions');
export const IS3Client = Symbol('IS3Client');
