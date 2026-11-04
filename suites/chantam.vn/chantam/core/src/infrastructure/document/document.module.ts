import { ICharityPdfRenderer } from '@/domain/ports/document';
import { Global, Module } from '@nestjs/common';
import { PdfkitCharityPdfRenderer } from './pdfkit-charity-pdf.renderer';

/**
 * Dựng tài liệu (PDF). Global và được nạp ở CẢ hạ tầng HTTP lẫn CLI: module use case dự án
 * từ thiện chạy trong cả hai, thiếu một bên là cây DI của bên đó không dựng được.
 */
@Global()
@Module({
  providers: [
    { provide: ICharityPdfRenderer, useClass: PdfkitCharityPdfRenderer },
  ],
  exports: [ICharityPdfRenderer],
})
export class DocumentModule {}
