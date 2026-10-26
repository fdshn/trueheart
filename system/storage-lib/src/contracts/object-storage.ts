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

export interface ICommentMediaUploadRequest extends IStorageUploadRequest {
  /**
   * Khoá theo CHỦ THỂ chứ không theo bình luận: bình luận chưa tồn tại lúc xin
   * đường tải — nó được tạo cùng lúc với ảnh.
   */
  subjectType: string;
  subjectId: string;
}

export interface ICampaignMediaConfirmation {
  mediaType: 'IMAGE' | 'VIDEO';
  publicUrl: string;
}

export interface ICmsMediaConfirmation {
  contentType: string;
  publicUrl: string;
}

export interface IChatMediaUploadRequest extends IStorageUploadRequest {
  /**
   * Khoá theo PHÒNG chứ không theo tin nhắn: chat chỉ ghi thêm, tin nhắn được
   * tạo cùng lúc với ảnh nên lúc xin đường tải nó chưa tồn tại.
   */
  roomId: string;
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
  /** Clip giới thiệu trên hồ sơ (PR #46 §3.3): video mp4/quicktime ≤ 50 MB. */
  createIntroVideoUpload(
    request: IStorageUploadRequest,
  ): Promise<IStorageUploadResult>;
  /** Ảnh bìa của clip giới thiệu, do client tạo: ảnh ≤ 2 MB. */
  createIntroThumbnailUpload(
    request: IStorageUploadRequest,
  ): Promise<IStorageUploadResult>;
  /** Trả URL công khai sau khi HeadObject xác nhận đúng chủ, đúng loại, đúng trần. */
  confirmIntroVideoUpload(userId: string, key: string): Promise<string>;
  confirmIntroThumbnailUpload(userId: string, key: string): Promise<string>;
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
  /**
   * Anh dinh kem mot binh luan.
   *
   * Tach khoi media bai dang vi vong doi khac: media bai dang chet cung bai, con
   * anh binh luan chet cung binh luan.
   */
  createCommentMediaUpload(
    request: ICommentMediaUploadRequest,
  ): Promise<IStorageUploadResult>;
  confirmCommentMediaUpload(
    userId: string,
    subjectType: string,
    subjectId: string,
    key: string,
  ): Promise<void>;
  /**
   * Anh dinh kem mot tin nhan chat.
   *
   * Tach khoi anh bang chung luot trao: chat bi xoa theo han luu tru, con bang
   * chung thi khong — do chinh la ly do hai thu nam o hai tien to khac nhau.
   */
  createChatMediaUpload(
    request: IChatMediaUploadRequest,
  ): Promise<IStorageUploadResult>;
  confirmChatMediaUpload(
    userId: string,
    roomId: string,
    key: string,
  ): Promise<void>;
  createCampaignMediaUpload(
    request: IStorageUploadRequest,
  ): Promise<IStorageUploadResult>;
  confirmCampaignMediaUpload(
    userId: string,
    key: string,
  ): Promise<ICampaignMediaConfirmation>;
  /**
   * Ảnh thư viện chung của CMS — banner, bìa blog, ảnh chiến dịch Home, nội dung pháp.
   *
   * CHỈ ảnh: mọi chỗ CMS dùng ảnh là `https://` ảnh tĩnh, không chỗ nào phát video. Khoá
   * theo người tải (`users/<adminId>/cms-media/`) để vẫn truy được ai đưa ảnh lên, và
   * để job dọn rác quét được như mọi tiền tố khác.
   */
  createCmsMediaUpload(
    request: IStorageUploadRequest,
  ): Promise<IStorageUploadResult>;
  confirmCmsMediaUpload(
    userId: string,
    key: string,
  ): Promise<ICmsMediaConfirmation>;
  /**
   * Xoa object theo lo, kieu co-gang.
   *
   * Dung khi xoa chat theo han: loi hua "tin nhan se duoc xoa" chi dung mot nua
   * neu chu bien mat ma anh van mo duoc bang duong dan cong khai.
   *
   * KHONG nam trong transaction database duoc, nen goi SAU khi commit. Object
   * con sot khi tien trinh chet giua chung duoc lifecycle rule cua bucket don;
   * lam nguoc lai thi dong database se tro vao anh khong con ton tai.
   *
   * Tra ve so object da xoa duoc. Khong nem khi mot key hong — mot anh sot lai
   * khong duoc chan viec don not nhung anh con lai.
   */
  deleteObjects(keys: readonly string[]): Promise<number>;

  /**
   * Duyệt mọi object dưới một tiền tố, kèm thời điểm sửa cuối.
   *
   * Dùng cho việc dọn object mồ côi: client xin đường tải rồi bỏ ngang, hoặc
   * tải xong mà không gọi bước xác nhận — object nằm lại và KHÔNG bản ghi nào
   * trong database nhắc rằng nó tồn tại, nên chỉ có cách duyệt bucket mới thấy.
   *
   * Trả về theo lô để bên gọi không phải giữ cả bucket trong bộ nhớ.
   */
  listObjects(params: {
    prefix: string;
    /** Con trỏ của lô trước. Bỏ trống là bắt đầu từ đầu. */
    cursor?: string;
    limit?: number;
  }): Promise<{
    objects: { key: string; lastModified: Date | null; size: number }[];
    nextCursor: string | null;
  }>;
}

export const IObjectStorage = Symbol('IObjectStorage');
