import {
  AnonymousMeritDonorLabel,
  MaxMeritDeclaredAmount,
  MeritDeclarationStatuses,
  MeritUnitTypes,
  MinMeritDeclaredAmount,
  buildVietQrUrl,
  isMeritBankAccountNumber,
  isMeritBankBin,
  isMeritDeclaredAmount,
  meritDeclarationGaps,
  meritDonorLabel,
  meritUnitGaps,
} from './merit';

function validUnit(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Chùa Vĩnh Nghiêm',
    unitType: 'TEMPLE',
    purpose: 'Trợ duyên xây dựng nhà ăn từ thiện cho bệnh nhân nghèo.',
    bankBin: '970415',
    bankAccountNumber: '113366668888',
    bankAccountName: 'CHUA VINH NGHIEM',
    ...overrides,
  } as Parameters<typeof meritUnitGaps>[0];
}

describe('isMeritBankBin', () => {
  it('nhận đúng sáu chữ số', () => {
    expect(isMeritBankBin('970415')).toBe(true);
  });

  it('từ chối năm hoặc bảy chữ số, và chữ cái', () => {
    for (const bad of ['97041', '9704156', '97041a', '', null, 970415])
      expect(isMeritBankBin(bad)).toBe(false);
  });
});

describe('isMeritBankAccountNumber', () => {
  it('nhận chữ số và chữ cái, ít nhất 4 ký tự', () => {
    expect(isMeritBankAccountNumber('113366668888')).toBe(true);
    expect(isMeritBankAccountNumber('ABC123')).toBe(true);
  });

  it('từ chối quá ngắn, có dấu cách hoặc ký tự lạ', () => {
    for (const bad of ['123', '1133 6666', '1133-6666', '', null])
      expect(isMeritBankAccountNumber(bad)).toBe(false);
  });
});

describe('isMeritDeclaredAmount', () => {
  it('nhận trong khoảng và đúng hai biên', () => {
    expect(isMeritDeclaredAmount(MinMeritDeclaredAmount)).toBe(true);
    expect(isMeritDeclaredAmount(MaxMeritDeclaredAmount)).toBe(true);
    expect(isMeritDeclaredAmount(500_000)).toBe(true);
  });

  it('từ chối dưới mức tối thiểu, vượt trần, số lẻ và chuỗi', () => {
    for (const bad of [
      MinMeritDeclaredAmount - 1,
      MaxMeritDeclaredAmount + 1,
      0,
      -1,
      1_500.5,
      '500000',
      null,
    ])
      expect(isMeritDeclaredAmount(bad)).toBe(false);
  });
});

describe('buildVietQrUrl', () => {
  const base = {
    bankBin: '970415',
    accountNumber: '113366668888',
    accountName: 'CHUA VINH NGHIEM',
  };

  it('dựng đúng đường ảnh từ BIN và số tài khoản', () => {
    expect(buildVietQrUrl(base)).toContain(
      'img.vietqr.io/image/970415-113366668888-compact2.png',
    );
  });

  it('KHÔNG gắn amount khi không truyền', () => {
    expect(buildVietQrUrl(base)).not.toContain('amount=');
  });

  it('gắn amount khi truyền số dương', () => {
    expect(buildVietQrUrl({ ...base, amount: 500_000 })).toContain(
      'amount=500000',
    );
  });

  it('KHÔNG gắn amount khi bằng 0 hoặc âm', () => {
    // Gắn `0` làm một số app ngân hàng hiểu thành "chuyển 0 đồng" rồi báo lỗi, thay vì để
    // trống cho người dùng tự nhập.
    for (const amount of [0, -1, null, undefined, Number.NaN])
      expect(buildVietQrUrl({ ...base, amount })).not.toContain('amount=');
  });

  it('encode nội dung chuyển khoản có dấu và dấu cách', () => {
    const url = buildVietQrUrl({ ...base, note: 'Cầu an cho gia đình' });
    expect(url).toContain('addInfo=');
    // Dấu cách KHÔNG được để nguyên — một URL có dấu cách thô là một URL hỏng.
    expect(url).not.toContain('addInfo=Cầu an');
  });

  it('không gắn addInfo khi note rỗng hoặc null', () => {
    expect(buildVietQrUrl({ ...base, note: '' })).not.toContain('addInfo=');
    expect(buildVietQrUrl({ ...base, note: null })).not.toContain('addInfo=');
  });
});

describe('meritUnitGaps', () => {
  it('đơn vị đủ thông tin không có khoảng trống', () => {
    expect(meritUnitGaps(validUnit())).toEqual([]);
  });

  it('BIN sai bị bắt', () => {
    expect(meritUnitGaps(validUnit({ bankBin: '12345' }))).toContain(
      'bankBin phải là sáu chữ số theo chuẩn Napas',
    );
  });

  it('số tài khoản sai bị bắt', () => {
    expect(
      meritUnitGaps(validUnit({ bankAccountNumber: '12' })),
    ).toContainEqual(expect.stringContaining('bankAccountNumber'));
  });

  it('tên thụ hưởng rỗng bị bắt — người chuyển cần đối chiếu nó', () => {
    expect(meritUnitGaps(validUnit({ bankAccountName: '   ' }))[0]).toContain(
      'bankAccountName',
    );
  });

  it('mục đích quá ngắn bị bắt', () => {
    expect(meritUnitGaps(validUnit({ purpose: 'ngắn' }))[0]).toContain(
      'purpose',
    );
  });

  it('loại đơn vị ngoài allowlist bị bắt, và nói rõ giá trị hợp lệ', () => {
    const gaps = meritUnitGaps(validUnit({ unitType: 'NHA_THO' }));
    expect(gaps).toHaveLength(1);
    for (const type of MeritUnitTypes) expect(gaps[0]).toContain(type);
  });

  it('thiếu nhiều trường thì báo đủ, không dừng ở lỗi đầu', () => {
    // Một form thiếu ba trường mà chỉ báo một lỗi là ba lượt gửi lại.
    expect(
      meritUnitGaps(
        validUnit({
          bankBin: 'x',
          bankAccountNumber: '1',
          bankAccountName: '',
        }),
      ),
    ).toHaveLength(3);
  });
});

describe('meritDeclarationGaps', () => {
  it('lời khai hợp lệ không có khoảng trống', () => {
    expect(
      meritDeclarationGaps({ declaredAmount: 500_000, status: 'INTENDED' }),
    ).toEqual([]);
  });

  it('trạng thái ngoài allowlist bị bắt', () => {
    const gaps = meritDeclarationGaps({
      declaredAmount: 500_000,
      status: 'VERIFIED',
    });
    expect(gaps).toHaveLength(1);
    for (const status of MeritDeclarationStatuses)
      expect(gaps[0]).toContain(status);
  });

  it('số tiền sai bị bắt', () => {
    expect(
      meritDeclarationGaps({ declaredAmount: 10, status: 'INTENDED' }),
    ).toHaveLength(1);
  });

  it('note quá dài bị bắt, note rỗng thì không', () => {
    expect(
      meritDeclarationGaps({
        declaredAmount: 500_000,
        status: 'INTENDED',
        note: 'x'.repeat(501),
      }),
    ).toHaveLength(1);
    expect(
      meritDeclarationGaps({
        declaredAmount: 500_000,
        status: 'INTENDED',
        note: undefined,
      }),
    ).toEqual([]);
  });
});

describe('meritDonorLabel', () => {
  it('ẩn danh ra nhãn cố định', () => {
    expect(
      meritDonorLabel({ isAnonymous: true, displayName: 'Nguyễn Văn A' }),
    ).toBe(AnonymousMeritDonorLabel);
  });

  it('không ẩn danh ra tên thật', () => {
    expect(
      meritDonorLabel({ isAnonymous: false, displayName: 'Nguyễn Văn A' }),
    ).toBe('Nguyễn Văn A');
  });

  it('tên null hoặc rỗng (tài khoản đã xoá) rơi về nhãn cố định', () => {
    // Hiện chuỗi rỗng ở đó là một dòng trống trên Sổ vàng mà không ai hiểu.
    expect(meritDonorLabel({ isAnonymous: false, displayName: null })).toBe(
      AnonymousMeritDonorLabel,
    );
    expect(meritDonorLabel({ isAnonymous: false, displayName: '   ' })).toBe(
      AnonymousMeritDonorLabel,
    );
  });
});
