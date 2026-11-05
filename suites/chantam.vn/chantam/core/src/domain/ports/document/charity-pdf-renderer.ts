/**
 * Dựng bản in PDF của dự án từ thiện từ một BẢN CHỤP đã lưu (CHARITY-PROJECT-LIFECYCLE §3.13).
 *
 * Đầu vào là bản chụp, không phải dự án sống: cùng một bản chụp luôn ra cùng nội dung, nên
 * tải lại sau khi ban tổ chức sửa kế hoạch vẫn là đúng bản đã tạo lúc đó.
 */
export interface ICharityPdfDocument {
  readonly exportId: string;
  readonly generatedAt: Date;
  readonly generatedByName: string | null;
  readonly lastRevisionId: string | null;
  readonly snapshot: Record<string, unknown>;
}

export interface ICharityPdfRenderer {
  render(document: ICharityPdfDocument): Promise<Buffer>;
}

export const ICharityPdfRenderer = Symbol('ICharityPdfRenderer');
