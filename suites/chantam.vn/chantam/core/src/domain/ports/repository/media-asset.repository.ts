export interface IMediaAsset {
  readonly globalId: string;
  readonly storageKey: string;
  readonly publicUrl: string;
  readonly contentType: string;
  readonly fileName: string | null;
  /** `null` khi tài khoản người tải đã bị xoá. */
  readonly uploadedBy: string | null;
  readonly uploadedByUsername: string | null;
  readonly createdAt: Date;
}

export interface IMediaAssetRepository {
  /**
   * Ghi một ảnh vào thư viện. Cùng `storageKey` lần hai thì trả lại đúng dòng cũ —
   * Admin bấm xác nhận hai lần không sinh hai ảnh giống hệt nhau.
   */
  register(params: {
    storageKey: string;
    publicUrl: string;
    contentType: string;
    fileName: string | null;
    uploadedBy: string;
  }): Promise<IMediaAsset>;

  /** Mới tải trước. `keyword` khớp tên tệp hoặc username người tải. */
  list(params: {
    keyword: string | null;
    skip: number;
    take: number;
  }): Promise<{ items: IMediaAsset[]; total: number }>;
}

export const IMediaAssetRepository = Symbol('IMediaAssetRepository');
