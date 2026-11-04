import { PdfkitCharityPdfRenderer } from './pdfkit-charity-pdf.renderer';

describe('PdfkitCharityPdfRenderer', () => {
  const document = {
    exportId: '0b2f7c1e-3a7d-4f7e-9b1a-5d6c7e8f9a0b',
    generatedAt: new Date('2026-11-04T08:00:00Z'),
    generatedByName: 'Anh Minh',
    lastRevisionId: null,
    snapshot: {
      title: 'Áo ấm cho học sinh vùng cao',
      description: 'Gom áo ấm, chăn và sách vở cho ba điểm trường ở Hà Giang.',
      stageLabel: 'Triển khai',
      locationLabel: 'Hà Giang',
      startTime: '2026-11-01T00:00:00.000Z',
      endTime: '2026-12-01T00:00:00.000Z',
      sections: [
        {
          sectionKey: 'PLAN',
          label: 'Kế hoạch',
          content: {
            appealPurpose: 'Giúp 300 học sinh có áo ấm trước mùa rét.',
            parties: [{ role: 'ORGANIZER', name: 'CLB Trái tim vàng' }],
          },
        },
        { sectionKey: 'EVENT', label: 'Sự kiện trao', content: null },
      ],
      itemNeeds: [
        {
          itemName: 'Áo ấm',
          unit: 'chiếc',
          targetQuantity: 300,
          receivedQuantity: 58,
          remainingQuantity: 242,
        },
      ],
      bankAccounts: [
        {
          bankName: 'Vietcombank',
          accountNo: '0011223344',
          accountName: 'CLB',
        },
      ],
    },
  };

  it('ra một tệp PDF có font tiếng Việt nhúng', async () => {
    const pdf = await new PdfkitCharityPdfRenderer().render(document);
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(pdf.toString('latin1')).toContain('DejaVuSans');
    expect(pdf.length).toBeGreaterThan(2000);
  });

  it('cùng bản chụp → cùng kích thước tệp (nội dung xác định theo bản chụp)', async () => {
    const renderer = new PdfkitCharityPdfRenderer();
    const [first, second] = await Promise.all([
      renderer.render(document),
      renderer.render(document),
    ]);
    expect(first.length).toBe(second.length);
  });
});
