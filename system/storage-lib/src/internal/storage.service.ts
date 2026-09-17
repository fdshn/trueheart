import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  IObjectStorage,
  IStorageUploadRequest,
  IStorageUploadResult,
} from '../contracts';
import {
  IS3Client,
  IStorageModuleOptions,
  IStorageOptions,
} from './storage-options';

const AllowedContentTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MaxAvatarBytes = 5 * 1024 * 1024;

export function assertAvatarUploadPolicy(request: IStorageUploadRequest): void {
  if (!AllowedContentTypes.has(request.contentType))
    throw new Error('Avatar chỉ nhận image/jpeg, image/png hoặc image/webp.');
  if (request.contentLength < 1 || request.contentLength > MaxAvatarBytes)
    throw new Error('Avatar phải lớn hơn 0 và không quá 5 MB.');
}

@Injectable()
export class StorageService implements IObjectStorage {
  public constructor(
    @Inject(IS3Client) private readonly client: S3Client,
    @Inject(IStorageOptions) private readonly options: IStorageModuleOptions,
  ) {}

  public async createAvatarUpload(
    request: IStorageUploadRequest,
  ): Promise<IStorageUploadResult> {
    assertAvatarUploadPolicy(request);

    const extension = request.contentType.split('/')[1];
    const key = `users/${request.userId}/avatars/${randomUUID()}.${extension}`;
    const expiresInSeconds = this.options.uploadExpiresInSeconds ?? 300;
    const uploadUrl = await getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: this.options.bucket,
        Key: key,
        ContentType: request.contentType,
        ContentLength: request.contentLength,
      }),
      { expiresIn: expiresInSeconds },
    );

    return {
      key,
      uploadUrl,
      expiresInSeconds,
      publicUrl: `${this.options.publicBaseUrl.replace(/\/$/, '')}/${key}`,
    };
  }
}
