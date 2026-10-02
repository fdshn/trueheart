import {
  EarthlyBranches,
  HeavenlyStems,
  canChiOfYear,
  formatLunarHeader,
  jdFromDate,
  jdToDate,
  lunarDateOf,
  observanceOf,
  solarToLunar,
  vietnamSolarDate,
} from './lunar';

describe('jdFromDate / jdToDate', () => {
  it('khứ hồi đúng trên một dải ngày', () => {
    for (const [d, m, y] of [
      [1, 1, 1900],
      [29, 2, 2024],
      [31, 12, 2026],
      [15, 8, 2026],
      [1, 3, 2100],
    ] as const) {
      expect(jdToDate(jdFromDate(d, m, y))).toEqual({
        day: d,
        month: m,
        year: y,
      });
    }
  });

  it('khớp mốc Julian đã biết', () => {
    // 2000-01-01 là JD 2451545 (mốc J2000 chuẩn).
    expect(jdFromDate(1, 1, 2000)).toBe(2_451_545);
  });
});

describe('solarToLunar — đối chiếu ngày THẬT đã biết', () => {
  /**
   * Mỗi dòng là một cặp ngày dương/âm tra được độc lập, không phải kết quả của chính hàm
   * này. Thuật toán thiên văn chỉ đáng tin khi so với mốc bên ngoài — tự so với chính nó
   * là phép kiểm luôn xanh.
   *
   * Bộ mốc: Tết Nguyên Đán bốn năm liền, Phật Đản (15/4 ÂL), Vu Lan (15/7 ÂL), và một
   * ngày trong tháng nhuận.
   */
  const cases: Array<{
    label: string;
    solar: readonly [number, number, number];
    lunar: { day: number; month: number; year: number; isLeapMonth?: boolean };
  }> = [
    {
      label: 'Tết 2024 (Giáp Thìn)',
      solar: [10, 2, 2024],
      lunar: { day: 1, month: 1, year: 2024 },
    },
    {
      label: 'Tết 2025 (Ất Tỵ)',
      solar: [29, 1, 2025],
      lunar: { day: 1, month: 1, year: 2025 },
    },
    {
      label: 'Tết 2026 (Bính Ngọ)',
      solar: [17, 2, 2026],
      lunar: { day: 1, month: 1, year: 2026 },
    },
    {
      label: 'Tết 2023 (Quý Mão)',
      solar: [22, 1, 2023],
      lunar: { day: 1, month: 1, year: 2023 },
    },
    {
      label: 'Phật Đản 2026 — 15/4 ÂL',
      solar: [31, 5, 2026],
      lunar: { day: 15, month: 4, year: 2026 },
    },
    {
      label: 'Vu Lan 2026 — 15/7 ÂL',
      solar: [27, 8, 2026],
      lunar: { day: 15, month: 7, year: 2026 },
    },
    {
      label: 'Tháng 6 nhuận 2025',
      solar: [25, 7, 2025],
      lunar: { day: 1, month: 6, year: 2025, isLeapMonth: true },
    },
  ];

  for (const entry of cases) {
    it(entry.label, () => {
      const [d, m, y] = entry.solar;
      const result = solarToLunar(d, m, y);
      expect({
        day: result.day,
        month: result.month,
        year: result.year,
      }).toEqual({
        day: entry.lunar.day,
        month: entry.lunar.month,
        year: entry.lunar.year,
      });
      if (entry.lunar.isLeapMonth !== undefined)
        expect(result.isLeapMonth).toBe(entry.lunar.isLeapMonth);
    });
  }

  it('ngày âm lịch luôn trong [1, 30] và tháng trong [1, 12]', () => {
    // Quét một năm đầy đủ: một lỗi chia tháng sẽ cho ngày 0, ngày 31 hay tháng 13, và
    // không ca điểm nào ở trên bắt được nếu nó rơi vào ngày khác.
    for (let offset = 0; offset < 400; offset += 1) {
      const at = new Date(Date.UTC(2026, 0, 1) + offset * 86_400_000);
      const solar = vietnamSolarDate(at);
      const lunar = solarToLunar(solar.day, solar.month, solar.year);

      expect(lunar.day).toBeGreaterThanOrEqual(1);
      expect(lunar.day).toBeLessThanOrEqual(30);
      expect(lunar.month).toBeGreaterThanOrEqual(1);
      expect(lunar.month).toBeLessThanOrEqual(12);
    }
  });

  it('ngày âm lịch tăng đều, không nhảy và không lùi', () => {
    // Hai ngày dương liền nhau phải cho hai ngày âm liền nhau, hoặc một lượt sang tháng
    // mới (ngày về 1). Mọi bước nhảy khác là lỗi chia tháng.
    let previous = solarToLunar(1, 1, 2026).day;
    for (let offset = 1; offset < 400; offset += 1) {
      const at = new Date(Date.UTC(2026, 0, 1) + offset * 86_400_000);
      const solar = vietnamSolarDate(at);
      const current = solarToLunar(solar.day, solar.month, solar.year).day;

      const ok = current === previous + 1 || current === 1;
      expect(ok).toBe(true);
      previous = current;
    }
  });
});

describe('vietnamSolarDate — cắt ngày theo UTC+7', () => {
  it('23:30 UTC đã là ngày hôm sau ở Việt Nam', () => {
    // Đây là lỗi lệch một ngày đã bắt ở phân hệ điểm danh. Đọc theo UTC thì tấm biểu ngữ
    // ngày Rằm hiện sai một ngày với nửa số người dùng.
    expect(vietnamSolarDate(new Date('2026-02-16T23:30:00Z'))).toEqual({
      day: 17,
      month: 2,
      year: 2026,
    });
  });

  it('16:00 UTC là mốc chuyển ngày', () => {
    expect(vietnamSolarDate(new Date('2026-02-16T16:59:00Z')).day).toBe(16);
    expect(vietnamSolarDate(new Date('2026-02-16T17:00:00Z')).day).toBe(17);
  });

  it('lunarDateOf dùng đúng ngày Việt Nam', () => {
    // 2026-02-16T23:30Z = 17/02 ở Việt Nam = mùng 1 Tết Bính Ngọ.
    expect(lunarDateOf(new Date('2026-02-16T23:30:00Z'))).toMatchObject({
      day: 1,
      month: 1,
      year: 2026,
    });
  });
});

describe('canChiOfYear', () => {
  it('khớp các năm đã biết', () => {
    expect(canChiOfYear(1984)).toBe('Giáp Tý');
    expect(canChiOfYear(2024)).toBe('Giáp Thìn');
    expect(canChiOfYear(2025)).toBe('Ất Tỵ');
    expect(canChiOfYear(2026)).toBe('Bính Ngọ');
    expect(canChiOfYear(2027)).toBe('Đinh Mùi');
  });

  it('lặp đúng chu kỳ 60 năm', () => {
    for (let year = 1960; year < 1980; year += 1)
      expect(canChiOfYear(year)).toBe(canChiOfYear(year + 60));
  });

  it('mười can và mười hai chi đều đủ', () => {
    expect(HeavenlyStems).toHaveLength(10);
    expect(EarthlyBranches).toHaveLength(12);
  });
});

describe('observanceOf', () => {
  it('ngày 14 và 15 là Rằm', () => {
    for (const day of [14, 15])
      expect(
        observanceOf({ day, month: 7, year: 2026, isLeapMonth: false }),
      ).toBe('FULL_MOON');
  });

  it('ngày 30 và 1 là Mùng Một', () => {
    for (const day of [30, 1])
      expect(
        observanceOf({ day, month: 7, year: 2026, isLeapMonth: false }),
      ).toBe('NEW_MOON');
  });

  it('ngày khác không có mốc nào', () => {
    for (const day of [2, 13, 16, 29])
      expect(
        observanceOf({ day, month: 7, year: 2026, isLeapMonth: false }),
      ).toBeNull();
  });
});

describe('formatLunarHeader', () => {
  it('đúng khuôn UC-LUNAR-01 bước 2', () => {
    expect(formatLunarHeader(new Date('2026-02-17T03:00:00Z'))).toBe(
      '17/02/2026 - 01/01 [Bính Ngọ]',
    );
  });

  it('đánh dấu tháng nhuận', () => {
    expect(formatLunarHeader(new Date('2025-07-25T03:00:00Z'))).toContain(
      '(nhuận)',
    );
  });

  it('số luôn hai chữ số', () => {
    expect(formatLunarHeader(new Date('2026-03-05T03:00:00Z'))).toMatch(
      /^\d{2}\/\d{2}\/\d{4} - \d{2}\/\d{2}/,
    );
  });
});
