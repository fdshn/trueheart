import {
  ICharityPdfDocument,
  ICharityPdfRenderer,
} from '@/domain/ports/document';
import { Injectable } from '@nestjs/common';
// `export =` — default import qua được type-check nhưng `undefined` lúc chạy (tsconfig không
// bật esModuleInterop); `import * as` thì không `new` được. `import = require` là đúng cả hai.
// eslint-disable-next-line @typescript-eslint/no-require-imports -- lý do ở trên
import PDFDocument = require('pdfkit');

/** Font có đủ dấu tiếng Việt — font chuẩn của PDF (Helvetica…) không vẽ được "ộ", "ữ". */
const RegularFont = require.resolve('dejavu-fonts-ttf/ttf/DejaVuSans.ttf');
const BoldFont = require.resolve('dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf');

const Labels: Readonly<Record<string, string>> = {
  appealPurpose: 'Mục đích kêu gọi',
  appealAudience: 'Đối tượng',
  appealCircumstance: 'Hoàn cảnh',
  callToActions: 'Kêu gọi tham gia',
  parties: 'Đơn vị liên quan',
  team: 'Ban tổ chức',
  phases: 'Tiến độ',
  tasks: 'Checklist triển khai',
  customSections: 'Thông tin thêm',
  role: 'Vai trò',
  name: 'Tên',
  displayName: 'Tên',
  position: 'Chức vụ',
  username: 'Tài khoản',
  beneficiaryKind: 'Loại',
  address: 'Địa chỉ',
  hotline: 'Hotline',
  email: 'Email',
  phase: 'Bước',
  startsAt: 'Bắt đầu',
  endsAt: 'Kết thúc',
  deliveryMethod: 'Hình thức trao',
  reportMode: 'Hình thức báo cáo',
  taskKey: 'Việc',
  label: 'Tên',
  status: 'Trạng thái',
  scheduledAt: 'Thời điểm',
  workNote: 'Ghi chú',
  updateMode: 'Cập nhật',
  title: 'Tiêu đề',
  fields: 'Trường',
  fieldType: 'Kiểu',
  value: 'Giá trị',
};

/** Mã thường gặp trong bản chụp → chữ đọc được. Mã lạ in nguyên. */
const ValueLabels: Readonly<Record<string, string>> = {
  TODO: 'Chưa làm',
  IN_PROGRESS: 'Đang làm',
  DONE: 'Xong',
  SKIPPED: 'Bỏ qua',
  LIKE: 'Thích',
  SUPPORT_AND_DONATE: 'Ủng hộ, quyên góp',
  JOIN: 'Tham gia',
  ORGANIZER: 'Đơn vị tổ chức',
  BENEFICIARY: 'Bên thụ hưởng',
  LICENSING: 'Đơn vị cấp phép',
  MEDIA: 'Đơn vị truyền thông',
  INDIVIDUAL: 'Cá nhân',
  GROUP: 'Tập thể',
  GENERAL_LEAD: 'Trưởng ban',
  LIAISON_MEDIA: 'Liên lạc, truyền thông',
  INTAKE_LOGISTICS: 'Tiếp nhận, hậu cần',
  FINANCE: 'Tài chính',
  ADVANCE_TRANSPORT: 'Tiền trạm, vận chuyển',
  REPORTING: 'Báo cáo',
  PLANNING: 'Lập kế hoạch',
  PREPARATION: 'Chuẩn bị',
  DISTRIBUTION: 'Trao',
  ON_SITE: 'Trực tiếp',
  SHIP: 'Gửi hàng',
  TRANSFER: 'Chuyển khoản',
  ONLINE: 'Trực tuyến',
  OFFLINE: 'Trực tiếp',
};

/** Khoá chỉ để máy đọc — đã có nhãn đi kèm nên không in. */
const HiddenKeys = new Set(['taskKey', 'sectionKey']);

const DateTimeFormat = new Intl.DateTimeFormat('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh',
  dateStyle: 'short',
  timeStyle: 'short',
});

const IsoPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

function formatScalar(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (Array.isArray(value) && value.length === 0) return '—';
  if (value instanceof Date) return DateTimeFormat.format(value);
  if (typeof value === 'string' && IsoPattern.test(value)) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return DateTimeFormat.format(parsed);
  }
  if (typeof value === 'number') return value.toLocaleString('vi-VN');
  if (typeof value === 'boolean') return value ? 'Có' : 'Không';
  if (typeof value === 'string' && ValueLabels[value])
    return ValueLabels[value];
  if (Array.isArray(value) && value.every((item) => typeof item !== 'object'))
    return value.map(formatScalar).join(', ');
  return String(value);
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  !(value instanceof Date);

/**
 * Bản in PDF bằng pdfkit (§3.13).
 *
 * Bố cục đơn giản và XÁC ĐỊNH theo bản chụp: tiêu đề, thông tin chung, từng mục, các nhóm
 * nhu cầu, tài khoản nhận, chân trang ghi mã bản in và mã revision. `CreationDate` đặt theo
 * giờ tạo bản in chứ không theo giờ tải, để hai lần tải ra cùng một tệp.
 */
@Injectable()
export class PdfkitCharityPdfRenderer implements ICharityPdfRenderer {
  public render(document: ICharityPdfDocument): Promise<Buffer> {
    const snapshot = document.snapshot;
    const doc = new PDFDocument({
      size: 'A4',
      margin: 48,
      info: {
        Title: String(snapshot.title ?? 'Dự án từ thiện'),
        Creator: 'Chân Tâm',
        CreationDate: document.generatedAt,
      },
    });
    doc.registerFont('regular', RegularFont);
    doc.registerFont('bold', BoldFont);

    const chunks: Buffer[] = [];
    const done = new Promise<Buffer>((resolve, reject) => {
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });

    const heading = (text: string, size = 14) =>
      doc.moveDown(0.6).font('bold').fontSize(size).text(text).moveDown(0.2);
    const line = (label: string, value: unknown) =>
      doc
        .font('bold')
        .fontSize(10)
        .text(`${label}: `, { continued: true })
        .font('regular')
        .text(formatScalar(value));

    const renderValue = (key: string, value: unknown, depth: number): void => {
      if (HiddenKeys.has(key)) return;
      const label = Labels[key] ?? key;
      if (Array.isArray(value) && value.some((item) => isPlainObject(item))) {
        doc
          .font('bold')
          .fontSize(10)
          .text(label, { indent: depth * 12 });
        value.forEach((item, index) => {
          doc
            .font('regular')
            .fontSize(10)
            .text(`${index + 1}.`, { indent: (depth + 1) * 12 });
          if (isPlainObject(item))
            for (const [childKey, childValue] of Object.entries(item))
              renderValue(childKey, childValue, depth + 2);
        });
        return;
      }
      if (isPlainObject(value)) {
        doc
          .font('bold')
          .fontSize(10)
          .text(label, { indent: depth * 12 });
        for (const [childKey, childValue] of Object.entries(value))
          renderValue(childKey, childValue, depth + 1);
        return;
      }
      doc
        .font('bold')
        .fontSize(10)
        .text(`${label}: `, { indent: depth * 12, continued: true })
        .font('regular')
        .text(formatScalar(value));
    };

    doc
      .font('bold')
      .fontSize(18)
      .text(String(snapshot.title ?? ''));
    doc.font('regular').fontSize(10).fillColor('#555555');
    doc.text(
      `Giai đoạn: ${formatScalar(snapshot.stageLabel)} · ${formatScalar(snapshot.locationLabel)}`,
    );
    doc.text(
      `Thời gian: ${formatScalar(snapshot.startTime)} – ${formatScalar(snapshot.endTime)}`,
    );
    doc.fillColor('#000000');
    if (snapshot.description) {
      doc.moveDown(0.5).fontSize(11).text(String(snapshot.description));
    }

    const sections = Array.isArray(snapshot.sections)
      ? (snapshot.sections as Record<string, unknown>[])
      : [];
    for (const section of sections) {
      heading(String(section.label ?? section.sectionKey ?? ''));
      if (!isPlainObject(section.content)) {
        doc.font('regular').fontSize(10).text('Chưa có nội dung.');
        continue;
      }
      for (const [key, value] of Object.entries(section.content))
        renderValue(key, value, 0);
    }

    const table = (
      title: string,
      rows: unknown,
      render: (row: Record<string, unknown>) => string,
    ) => {
      if (!Array.isArray(rows) || rows.length === 0) return;
      heading(title, 12);
      for (const row of rows as Record<string, unknown>[])
        doc
          .font('regular')
          .fontSize(10)
          .text(`• ${render(row)}`);
    };
    table(
      'Hiện vật',
      snapshot.itemNeeds,
      (row) =>
        `${formatScalar(row.itemName)}: cần ${formatScalar(row.targetQuantity)} ${formatScalar(row.unit)}, đã nhận ${formatScalar(row.receivedQuantity)}, còn thiếu ${formatScalar(row.remainingQuantity)}`,
    );
    table(
      'Kêu gọi tiền',
      snapshot.fundingNeeds,
      (row) =>
        `${formatScalar(row.title)}: mục tiêu ${formatScalar(row.targetAmount)}đ, đã xác nhận ${formatScalar(row.confirmedAmount)}đ, ngoài app ${formatScalar(row.externalAmount)}đ, còn thiếu ${formatScalar(row.remainingAmount)}đ`,
    );
    table(
      'Tuyển người',
      snapshot.volunteerNeeds,
      (row) =>
        `${formatScalar(row.title)}: cần ${formatScalar(row.neededCount)}, đã xác nhận ${formatScalar(row.confirmedCount)}, còn thiếu ${formatScalar(row.remainingCount)}`,
    );
    table(
      'Tài khoản nhận',
      snapshot.bankAccounts,
      (row) =>
        `${formatScalar(row.bankName)} · ${formatScalar(row.accountNo)} · ${formatScalar(row.accountName)}`,
    );

    doc.moveDown(1).fillColor('#777777');
    line('Mã bản in', document.exportId);
    line('Tạo lúc', document.generatedAt);
    line('Người tạo', document.generatedByName);
    line('Revision', document.lastRevisionId);
    doc.end();
    return done;
  }
}
