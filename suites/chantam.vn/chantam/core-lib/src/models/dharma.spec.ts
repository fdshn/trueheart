import {
  DharmaContentTypes,
  DharmaHubEntries,
  DharmaHubEntryPaths,
  MaxDharmaBodyLength,
  dharmaContentGaps,
  isRecitableDharmaContent,
  normalizeDharmaCategory,
  normalizeDharmaSlug,
  slugifyDharmaTitle,
} from './dharma';

function validContent(overrides: Record<string, unknown> = {}) {
  return {
    isPublished: true,
    contentType: 'SUTRA',
    title: 'Kinh Địa Tạng',
    slug: 'kinh-dia-tang',
    bodyText: 'Như thị ngã văn.',
    audioUrl: undefined,
    coverUrl: undefined,
    ...overrides,
  } as Parameters<typeof dharmaContentGaps>[0];
}

describe('slugifyDharmaTitle', () => {
  it('xử lý đúng chữ đ — phải đổi TRƯỚC khi normalize NFD', () => {
    // `đ` là một chữ RIÊNG trong Unicode, không phải `d` cộng dấu, nên NFD không tách được
    // và nó rơi vào nhóm bị xoá. Thiếu bước đổi trước thì ra "kinh-ia-tang".
    expect(slugifyDharmaTitle('Kinh Địa Tạng')).toBe('kinh-dia-tang');
    expect(slugifyDharmaTitle('ĐẠI ĐỨC')).toBe('dai-duc');
  });

  it('bỏ dấu và gộp mọi ký tự lạ thành một gạch', () => {
    expect(slugifyDharmaTitle('Kinh  Pháp Hoa!!! (bản Việt)')).toBe(
      'kinh-phap-hoa-ban-viet',
    );
  });

  it('tiêu đề toàn ký tự lạ ra slug RỖNG để bên gọi tự xử', () => {
    expect(slugifyDharmaTitle('🙏🙏')).toBe('');
  });

  it('cắt theo trần 255 ký tự', () => {
    expect(slugifyDharmaTitle('a'.repeat(400))).toHaveLength(255);
  });
});

describe('normalizeDharmaSlug', () => {
  it('kiểu không phải chuỗi ra rỗng chứ không ném', () => {
    expect(normalizeDharmaSlug(undefined)).toBe('');
    expect(normalizeDharmaSlug(42)).toBe('');
  });
});

describe('normalizeDharmaCategory', () => {
  it('ba cách gõ cùng ra MỘT danh mục', () => {
    // Không chuẩn hoá thì ba cách gõ thành ba danh mục, và bộ lọc của người dùng chỉ ra
    // một phần ba số hàng lẽ ra phải thấy.
    for (const raw of ['Kinh Đại Thừa', 'kinh dai thua', 'Kinh  Đại  Thừa'])
      expect(normalizeDharmaCategory(raw)).toBe('kinh-dai-thua');
  });

  it('chuỗi rỗng hoặc toàn ký tự lạ ra null, KHÔNG ra chuỗi rỗng', () => {
    // Cột cho phép `NULL` nhưng `CHK_dharma_contents_category_shape` không nhận chuỗi rỗng.
    for (const raw of ['', '   ', '🙏', undefined, 42])
      expect(normalizeDharmaCategory(raw)).toBeNull();
  });

  it('cắt theo trần 50 ký tự của cột', () => {
    expect(normalizeDharmaCategory('a'.repeat(200))).toHaveLength(50);
  });
});

describe('dharmaContentGaps', () => {
  it('nội dung đủ thông tin không có khoảng trống', () => {
    expect(dharmaContentGaps(validContent())).toEqual([]);
  });

  it('BẢN NHÁP rỗng là hợp lệ — Admin soạn qua nhiều buổi', () => {
    expect(
      dharmaContentGaps(validContent({ isPublished: false, bodyText: '' })),
    ).toEqual([]);
  });

  it('XUẤT BẢN mà nội dung rỗng hoặc toàn dấu cách thì không được', () => {
    for (const bodyText of ['', '   ', '\n\n'])
      expect(
        dharmaContentGaps(validContent({ isPublished: true, bodyText })),
      ).toContain('bodyText không được rỗng khi xuất bản');
  });

  it('loại nội dung ngoài allowlist bị bắt, và nói rõ giá trị hợp lệ', () => {
    const gaps = dharmaContentGaps(validContent({ contentType: 'MANTRA' }));
    expect(gaps).toHaveLength(1);
    for (const type of DharmaContentTypes) expect(gaps[0]).toContain(type);
  });

  it('audio và cover qua http bị bắt, bỏ trống thì không', () => {
    expect(
      dharmaContentGaps(validContent({ audioUrl: 'http://cdn.vn/a.mp3' })),
    ).toContain('audioUrl phải là một đường dẫn https');
    expect(
      dharmaContentGaps(validContent({ coverUrl: 'http://cdn.vn/a.jpg' })),
    ).toContain('coverUrl phải là một đường dẫn https');
    expect(
      dharmaContentGaps(validContent({ audioUrl: null, coverUrl: null })),
    ).toEqual([]);
  });

  it('slug rỗng bị bắt KỂ CẢ khi còn nháp', () => {
    // Cột `UNIQUE NOT NULL` không nhận rỗng, nên để lọt tới database là đổi một thông báo
    // đọc được thành một lỗi ràng buộc.
    expect(
      dharmaContentGaps(validContent({ isPublished: false, slug: '' }))[0],
    ).toContain('slug');
  });

  it('nội dung vượt trần 2 triệu ký tự bị bắt', () => {
    expect(
      dharmaContentGaps(
        validContent({ bodyText: 'a'.repeat(MaxDharmaBodyLength + 1) }),
      ),
    ).toContain(`bodyText không vượt ${MaxDharmaBodyLength} ký tự`);
  });
});

describe('isRecitableDharmaContent', () => {
  it('chỉ SUTRA đã xuất bản mới tụng được', () => {
    expect(
      isRecitableDharmaContent({ contentType: 'SUTRA', isPublished: true }),
    ).toBe(true);
  });

  it('INFO và TEMPLE_INTRO không tụng được', () => {
    // Mở cho hai loại đó là cho người dùng "đánh dấu đã tụng xong" một trang giới thiệu
    // chùa, và lịch sử tụng mất nghĩa.
    for (const contentType of ['INFO', 'TEMPLE_INTRO'] as const)
      expect(isRecitableDharmaContent({ contentType, isPublished: true })).toBe(
        false,
      );
  });

  it('bản nháp không tụng được dù là SUTRA', () => {
    expect(
      isRecitableDharmaContent({ contentType: 'SUTRA', isPublished: false }),
    ).toBe(false);
  });
});

describe('DharmaHubEntryPaths', () => {
  it('mọi entry của UI-DHARMA-01 đều có đường', () => {
    for (const entry of DharmaHubEntries)
      expect(DharmaHubEntryPaths[entry]).toMatch(/^\//);
  });

  it('entry Công đức trỏ sang /merit-units, KHÔNG sang một đường dharma riêng', () => {
    // UC-DHARMA-05: "Tái sử dụng nghiệp vụ Công đức/Hồi hướng tại mục 3.3.11". Dựng một
    // bản thứ hai là hai nguồn cho cùng một số tài khoản ngân hàng, và lúc đó sửa một nơi
    // là để nơi kia trỏ sai dòng tiền.
    expect(DharmaHubEntryPaths.MERIT).toBe('/merit-units');
    expect(DharmaHubEntryPaths.MERIT).not.toContain('dharma');
  });

  it('đúng bảy entry, theo đúng số UI-DHARMA-01 liệt kê', () => {
    expect(DharmaHubEntries).toHaveLength(7);
  });
});
