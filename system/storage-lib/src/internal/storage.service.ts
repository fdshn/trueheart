import {
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  ICommentMediaUploadRequest,
  IObjectStorage,
  IPostMediaUploadRequest,
  IStorageUploadRequest,
  IStorageUploadResult,
  ITransactionEvidenceUploadRequest,
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

export function assertPostMediaUploadPolicy(
  request: IPostMediaUploadRequest,
): void {
  if (!AllowedContentTypes.has(request.contentType))
    throw new Error(
      'Media bài đăng chỉ nhận image/jpeg, image/png hoặc image/webp.',
    );
  if (request.contentLength < 1 || request.contentLength > MaxAvatarBytes)
    throw new Error('Media bài đăng phải lớn hơn 0 và không quá 5 MB.');
}

export function assertTransactionEvidenceUploadPolicy(
  request: ITransactionEvidenceUploadRequest,
): void {
  if (!AllowedContentTypes.has(request.contentType))
    throw new Error(
      'Ảnh bằng chứng chỉ nhận image/jpeg, image/png hoặc image/webp.',
    );
  if (request.contentLength < 1 || request.contentLength > MaxAvatarBytes)
    throw new Error('Ảnh bằng chứng phải lớn hơn 0 và không quá 5 MB.');
}

@Injectable()
export class StorageService implements IObjectStorage {
  public constructor(
    @Inject(IS3Client) private readonly client: S3Client,
    @Inject(IStorageOptions) private readonly options: IStorageModuleOptions,
  ) {}

  public async confirmAvatarUpload(
    userId: string,
    key: string,
  ): Promise<string> {
    if (!key.startsWith(`users/${userId}/avatars/`))
      throw new Error('Avatar key không thuộc tài khoản hiện tại.');

    const object = await this.client.send(
      new HeadObjectCommand({ Bucket: this.options.bucket, Key: key }),
    );
    if (!object.ContentType || !AllowedContentTypes.has(object.ContentType))
      throw new Error('Object avatar không có content type ảnh hợp lệ.');
    if (!object.ContentLength || object.ContentLength > MaxAvatarBytes)
      throw new Error('Object avatar không có kích thước hợp lệ.');

    return `${this.options.publicBaseUrl.replace(/\/$/, '')}/${key}`;
  }

  public async confirmPostMediaUpload(
    userId: string,
    postId: string,
    key: string,
  ): Promise<void> {
    if (!key.startsWith(`users/${userId}/posts/${postId}/media/`))
      throw new Error('Media key không thuộc bài đăng hiện tại.');

    const object = await this.client.send(
      new HeadObjectCommand({ Bucket: this.options.bucket, Key: key }),
    );
    if (!object.ContentType || !AllowedContentTypes.has(object.ContentType))
      throw new Error('Object media không có content type ảnh hợp lệ.');
    if (!object.ContentLength || object.ContentLength > MaxAvatarBytes)
      throw new Error('Object media không có kích thước hợp lệ.');
  }

  public async confirmTransactionEvidenceUpload(
    userId: string,
    transactionId: string,
    key: string,
  ): Promise<void> {
    if (
      !key.startsWith(`users/${userId}/transactions/${transactionId}/evidence/`)
    )
      throw new Error('Key ảnh bằng chứng không thuộc lượt trao hiện tại.');

    const object = await this.client.send(
      new HeadObjectCommand({ Bucket: this.options.bucket, Key: key }),
    );
    if (!object.ContentType || !AllowedContentTypes.has(object.ContentType))
      throw new Error('Object bằng chứng không có content type ảnh hợp lệ.');
    if (!object.ContentLength || object.ContentLength > MaxAvatarBytes)
      throw new Error('Object bằng chứng không có kích thước hợp lệ.');
  }

  public async confirmCommentMediaUpload(
    userId: string,
    subjectType: string,
    subjectId: string,
    key: string,
  ): Promise<void> {
    const prefix = `users/${userId}/comment-media/${subjectType}/${subjectId}/`;
    if (!key.startsWith(prefix))
      throw new Error('Key ảnh bình luận không thuộc chủ thể hiện tại.');

    const object = await this.client.send(
      new HeadObjectCommand({ Bucket: this.options.bucket, Key: key }),
    );
    if (!object.ContentType || !AllowedContentTypes.has(object.ContentType))
      throw new Error('Object ảnh bình luận không có content type hợp lệ.');
    if (!object.ContentLength || object.ContentLength > MaxAvatarBytes)
      throw new Error('Object ảnh bình luận không có kích thước hợp lệ.');
  }

  public async createCommentMediaUpload(
    request: ICommentMediaUploadRequest,
  ): Promise<IStorageUploadResult> {
    assertTransactionEvidenceUploadPolicy({
      userId: request.userId,
      transactionId: request.subjectId,
      contentType: request.contentType,
      contentLength: request.contentLength,
    });

    const extension = request.contentType.split('/')[1];
    const key = `users/${request.userId}/comment-media/${request.subjectType}/${request.subjectId}/${randomUUID()}.${extension}`;
    const expiresInSeconds = this.options.uploadExpiresInSeconds ?? 300;
    const uploadUrl = await getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: this.options.bucket,
        Key: key,
        ContentType: request.contentType,
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

  public async createTransactionEvidenceUpload(
    request: ITransactionEvidenceUploadRequest,
  ): Promise<IStorageUploadResult> {
    assertTransactionEvidenceUploadPolicy(request);

    const extension = request.contentType.split('/')[1];
    const key = `users/${request.userId}/transactions/${request.transactionId}/evidence/${randomUUID()}.${extension}`;
    const expiresInSeconds = this.options.uploadExpiresInSeconds ?? 300;
    const uploadUrl = await getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: this.options.bucket,
        Key: key,
        ContentType: request.contentType,
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

  public async createPostMediaUpload(
    request: IPostMediaUploadRequest,
  ): Promise<IStorageUploadResult> {
    assertPostMediaUploadPolicy(request);

    const extension = request.contentType.split('/')[1];
    const key = `users/${request.userId}/posts/${request.postId}/media/${randomUUID()}.${extension}`;
    const expiresInSeconds = this.options.uploadExpiresInSeconds ?? 300;
    const uploadUrl = await getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: this.options.bucket,
        Key: key,
        ContentType: request.contentType,
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
