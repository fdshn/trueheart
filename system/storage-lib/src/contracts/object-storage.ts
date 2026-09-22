export interface IStorageUploadRequest {
  /** Owner is embedded in the object key; callers cannot upload into another user's namespace. */
  userId: string;
  contentType: string;
  contentLength: number;
}

export interface IStorageUploadResult {
  key: string;
  uploadUrl: string;
  expiresInSeconds: number;
  /** Public CDN URL only after a successful client PUT. */
  publicUrl: string;
}

export interface IPostMediaUploadRequest extends IStorageUploadRequest {
  postId: string;
}

export interface ITransactionEvidenceUploadRequest extends IStorageUploadRequest {
  transactionId: string;
}

export interface IObjectStorage {
  createAvatarUpload(
    request: IStorageUploadRequest,
  ): Promise<IStorageUploadResult>;
  createPostMediaUpload(
    request: IPostMediaUploadRequest,
  ): Promise<IStorageUploadResult>;
  /** HeadObject + owner-prefix check before a profile can attach the avatar. */
  confirmAvatarUpload(userId: string, key: string): Promise<string>;
  /** HeadObject verifies both owner and canonical post before media attachment. */
  confirmPostMediaUpload(
    userId: string,
    postId: string,
    key: string,
  ): Promise<void>;
  /**
   * Anh bang chung cua mot luot trao: luc trao do, luc nhan, luc hang bi hoan.
   *
   * Tach khoi media bai dang vi vong doi khac han. Media bai dang chet cung bai;
   * anh bang chung phai song lau hon ca phong chat, vi chat bi xoa theo han luu
   * tru con bang chung thi khong.
   */
  createTransactionEvidenceUpload(
    request: ITransactionEvidenceUploadRequest,
  ): Promise<IStorageUploadResult>;
  /** HeadObject kiem ca chu so huu lan dung luot trao truoc khi gan. */
  confirmTransactionEvidenceUpload(
    userId: string,
    transactionId: string,
    key: string,
  ): Promise<void>;
}

export const IObjectStorage = Symbol('IObjectStorage');
