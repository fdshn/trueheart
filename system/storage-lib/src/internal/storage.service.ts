import {
  DeleteObjectsCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  IChatMediaUploadRequest,
  ICommentMediaUploadRequest,
  IObjectStorage,
  IPostMediaUploadRequest,
  IStorageUploadRequest,
  IStorageUploadResult,
  ITransactionEvidenceUploadRequest,
  StorageValidationError,
} from '../contracts';
import {
  IS3Client,
  IStorageModuleOptions,
  IStorageOptions,
} from './storage-options';

const AllowedContentTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);

const Megabyte = 1024 * 1024;

/**
 * Hạn mức theo TỪNG loại ảnh.
 *
 * Trước đây cả năm loại dùng chung một hằng tên `MaxAvatarBytes`, nên tên nói
 * dối ở bốn chỗ, và muốn nới ảnh bài đăng là nới luôn avatar. Con số hiện bằng
 * nhau — nhưng chúng là năm quyết định khác nhau, và tách ra thì đổi được từng
 * cái mà không đụng cái khác.
 */
export const MediaSizeLimits = {
  avatar: 5 * Megabyte,
  postMedia: 5 * Megabyte,
  transactionEvidence: 5 * Megabyte,
  chatMedia: 5 * Megabyte,
  commentMedia: 5 * Megabyte,
} as const;

/** Tên loại ảnh trong thông báo lỗi, để người dùng biết mình đang gửi cái gì. */
const MediaLabels = {
  avatar: 'Avatar',
  postMedia: 'Ảnh bài đăng',
  transactionEvidence: 'Ảnh bằng chứng',
  chatMedia: 'Ảnh trong chat',
  commentMedia: 'Ảnh bình luận',
} as const;

type MediaKind = keyof typeof MediaSizeLimits;

function assertUploadPolicy(kind: MediaKind, request: IStorageUploadRequest) {
  const label = MediaLabels[kind];
  const limit = MediaSizeLimits[kind];

  if (!AllowedContentTypes.has(request.contentType))
    throw new StorageValidationError(
      `${label} chỉ nhận image/jpeg, image/png hoặc image/webp.`,
    );

  if (!Number.isInteger(request.contentLength))
    throw new StorageValidationError(`${label} phải khai kích thước thật.`);

  if (request.contentLength < 1 || request.contentLength > limit)
    throw new StorageValidationError(
      `${label} phải lớn hơn 0 và không quá ${Math.round(limit / Megabyte)} MB.`,
    );
}

export function assertAvatarUploadPolicy(request: IStorageUploadRequest): void {
  assertUploadPolicy('avatar', request);
}

export function assertPostMediaUploadPolicy(
  request: IPostMediaUploadRequest,
): void {
  assertUploadPolicy('postMedia', request);
}

export function assertTransactionEvidenceUploadPolicy(
  request: ITransactionEvidenceUploadRequest,
): void {
  assertUploadPolicy('transactionEvidence', request);
}

@Injectable()
export class StorageService implements IObjectStorage {
  public constructor(
    @Inject(IS3Client) private readonly client: S3Client,
    @Inject(IStorageOptions) private readonly options: IStorageModuleOptions,
  ) {}

  /**
   * Khuôn chung cho mọi phép xác nhận: tiền tố, content type, dung lượng.
   *
   * **Xoá object khi nó sai chính sách.** Presigned PUT không ép được dung lượng
   * ở phía S3 nếu không ký sẵn `Content-Length`, nên vẫn có đường một object
   * quá cỡ nằm lại trong bucket sau khi bị từ chối. Không dọn thì mỗi lần từ
   * chối là một lần bucket phình thêm, và không bản ghi nào trong database nhắc
   * rằng nó tồn tại.
   *
   * KHÔNG xoá khi sai TIỀN TỐ: object đó không phải của người gọi. Xoá nó là
   * biến endpoint xác nhận thành công cụ xoá ảnh của người khác — chỉ cần đoán
   * đúng một key.
   */
  private async verifyObject(
    kind: MediaKind,
    expectedPrefix: string,
    key: string,
  ): Promise<void> {
    const label = MediaLabels[kind];

    if (!key.startsWith(expectedPrefix))
      throw new StorageValidationError(
        `Key ${label.toLowerCase()} không thuộc chủ thể hiện tại.`,
      );

    const object = await this.client.send(
      new HeadObjectCommand({ Bucket: this.options.bucket, Key: key }),
    );

    const badType =
      !object.ContentType || !AllowedContentTypes.has(object.ContentType);
    const badSize =
      !object.ContentLength || object.ContentLength > MediaSizeLimits[kind];

    if (!badType && !badSize) return;

    // Dọn trước khi ném: object đã nằm trong bucket rồi, và người gọi sẽ không
    // quay lại dọn hộ.
    await this.deleteObjects([key]);

    throw new StorageValidationError(
      badType
        ? `Object ${label.toLowerCase()} không có content type ảnh hợp lệ.`
        : `Object ${label.toLowerCase()} vượt quá kích thước cho phép.`,
    );
  }

  public async confirmAvatarUpload(
    userId: string,
    key: string,
  ): Promise<string> {
    await this.verifyObject('avatar', `users/${userId}/avatars/`, key);

    return `${this.options.publicBaseUrl.replace(/\/$/, '')}/${key}`;
  }

  public async confirmPostMediaUpload(
    userId: string,
    postId: string,
    key: string,
  ): Promise<void> {
    await this.verifyObject(
      'postMedia',
      `users/${userId}/posts/${postId}/media/`,
      key,
    );
  }

  public async confirmTransactionEvidenceUpload(
    userId: string,
    transactionId: string,
    key: string,
  ): Promise<void> {
    await this.verifyObject(
      'transactionEvidence',
      `users/${userId}/transactions/${transactionId}/evidence/`,
      key,
    );
  }

  public async confirmCommentMediaUpload(
    userId: string,
    subjectType: string,
    subjectId: string,
    key: string,
  ): Promise<void> {
    await this.verifyObject(
      'commentMedia',
      `users/${userId}/comment-media/${subjectType}/${subjectId}/`,
      key,
    );
  }

  public async confirmChatMediaUpload(
    userId: string,
    roomId: string,
    key: string,
  ): Promise<void> {
    await this.verifyObject(
      'chatMedia',
      `users/${userId}/chat/${roomId}/`,
      key,
    );
  }

  public async createCommentMediaUpload(
    request: ICommentMediaUploadRequest,
  ): Promise<IStorageUploadResult> {
    assertUploadPolicy('commentMedia', request);

    const extension = request.contentType.split('/')[1];
    const key = `users/${request.userId}/comment-media/${request.subjectType}/${request.subjectId}/${randomUUID()}.${extension}`;
    const expiresInSeconds = this.options.uploadExpiresInSeconds ?? 300;
    const uploadUrl = await getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: this.options.bucket,
        Key: key,
        ContentType: request.contentType,
        // KÝ LUÔN kích thước. Thiếu dòng này thì con số client khai chỉ là lời
        // khai: xin đường tải cho 1 KB rồi PUT 500 MB vẫn trôi, vì URL đã ký
        // không ràng buộc gì về độ dài. `content-length` nằm trong chữ ký nên
        // gửi lệch một byte là chữ ký hỏng.
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
        // KÝ LUÔN kích thước. Thiếu dòng này thì con số client khai chỉ là lời
        // khai: xin đường tải cho 1 KB rồi PUT 500 MB vẫn trôi, vì URL đã ký
        // không ràng buộc gì về độ dài. `content-length` nằm trong chữ ký nên
        // gửi lệch một byte là chữ ký hỏng.
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
        // KÝ LUÔN kích thước. Thiếu dòng này thì con số client khai chỉ là lời
        // khai: xin đường tải cho 1 KB rồi PUT 500 MB vẫn trôi, vì URL đã ký
        // không ràng buộc gì về độ dài. `content-length` nằm trong chữ ký nên
        // gửi lệch một byte là chữ ký hỏng.
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
        // KÝ LUÔN kích thước. Thiếu dòng này thì con số client khai chỉ là lời
        // khai: xin đường tải cho 1 KB rồi PUT 500 MB vẫn trôi, vì URL đã ký
        // không ràng buộc gì về độ dài. `content-length` nằm trong chữ ký nên
        // gửi lệch một byte là chữ ký hỏng.
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

  public async createChatMediaUpload(
    request: IChatMediaUploadRequest,
  ): Promise<IStorageUploadResult> {
    assertUploadPolicy('chatMedia', request);

    const extension = request.contentType.split('/')[1];
    const key = `users/${request.userId}/chat/${request.roomId}/${randomUUID()}.${extension}`;
    const expiresInSeconds = this.options.uploadExpiresInSeconds ?? 300;
    const uploadUrl = await getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: this.options.bucket,
        Key: key,
        ContentType: request.contentType,
        // KÝ LUÔN kích thước. Thiếu dòng này thì con số client khai chỉ là lời
        // khai: xin đường tải cho 1 KB rồi PUT 500 MB vẫn trôi, vì URL đã ký
        // không ràng buộc gì về độ dài. `content-length` nằm trong chữ ký nên
        // gửi lệch một byte là chữ ký hỏng.
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

  /**
   * Xoá theo lô 1000 key một lần — trần của DeleteObjects.
   *
   * Không ném khi một key hỏng: đây là bước dọn sau khi dữ liệu đã xoá xong, và
   * một object sót lại không được chặn việc dọn nốt những object còn lại.
   * Lifecycle rule của bucket là lưới cuối.
   */
  public async deleteObjects(keys: readonly string[]): Promise<number> {
    if (keys.length === 0) return 0;

    let deleted = 0;
    for (let index = 0; index < keys.length; index += 1000) {
      const batch = keys.slice(index, index + 1000);
      try {
        const result = await this.client.send(
          new DeleteObjectsCommand({
            Bucket: this.options.bucket,
            Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true },
          }),
        );
        deleted += batch.length - (result.Errors?.length ?? 0);
      } catch {
        // Nuốt có chủ ý — xem ghi chú trên.
      }
    }
    return deleted;
  }

  public async listObjects(params: {
    prefix: string;
    cursor?: string;
    limit?: number;
  }): Promise<{
    objects: { key: string; lastModified: Date | null; size: number }[];
    nextCursor: string | null;
  }> {
    const result = await this.client.send(
      new ListObjectsV2Command({
        Bucket: this.options.bucket,
        Prefix: params.prefix,
        ContinuationToken: params.cursor,
        MaxKeys: params.limit ?? 1000,
      }),
    );

    return {
      objects: (result.Contents ?? [])
        .filter((item): item is typeof item & { Key: string } =>
          Boolean(item.Key),
        )
        .map((item) => ({
          key: item.Key,
          lastModified: item.LastModified ?? null,
          size: Number(item.Size ?? 0),
        })),
      // `IsTruncated` mới là câu trả lời cho "còn nữa không"; token có thể có
      // giá trị mà đã hết dữ liệu.
      nextCursor: result.IsTruncated
        ? (result.NextContinuationToken ?? null)
        : null,
    };
  }
}
