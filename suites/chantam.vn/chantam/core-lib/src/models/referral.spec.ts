import {
  DefaultReferralAbuseConfig,
  makeReferralCode,
  normalizeReferralAbuseConfig,
  referralAbuseReviewEnabled,
  referralCodeCandidates,
} from './referral';

describe('referralCodeCandidates', () => {
  it('ứng viên ĐẦU giữ đúng công thức cũ: 12 ký tự đầu, bỏ gạch, viết hoa', () => {
    // Mã giới thiệu là bất biến và đã phát ra ngoài — đổi ứng viên đầu là làm mọi link
    // mời đã gửi trỏ vào hư không.
    expect(makeReferralCode('10000000-0000-4000-8000-000000000001')).toBe(
      '100000000000',
    );
  });

  it('mọi ứng viên dài đúng 12 — cột là varchar(12)', () => {
    for (const code of referralCodeCandidates(
      '3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
    ))
      expect(code).toHaveLength(12);
  });

  it('cho nhiều ứng viên KHÁC NHAU để còn đường lùi khi trùng', () => {
    const codes = referralCodeCandidates(
      '3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
    );
    expect(codes.length).toBeGreaterThan(1);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('ba uuid demo trùng tiền tố vẫn tách được bằng ứng viên khác nhau', () => {
    // Đây là ca đo được 01/10: cả ba ra `100000000000` ở ứng viên đầu, và `seed:demo`
    // chết ở dòng thứ hai với `UQ_users_referral_code`. Trên đường đăng ký thật nó là
    // một 500, và người dùng không lách được vì cùng username luôn ra cùng uuid.
    const ids = [
      '10000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000002',
      '10000000-0000-4000-8000-000000000003',
    ];
    expect(ids.map((id) => makeReferralCode(id))).toEqual([
      '100000000000',
      '100000000000',
      '100000000000',
    ]);
    // Nhưng ứng viên thứ hai — đUÔI của uuid — tách được cả ba, nên vòng lùi gỡ được
    // ngay ở lượt thứ hai thay vì thử vò ích.
    const seconds = ids.map((id) => referralCodeCandidates(id)[1]);
    expect(new Set(seconds).size).toBe(3);
  });
});

describe('normalizeReferralAbuseConfig', () => {
  it('thiếu dòng cấu hình thì lùi về mặc định, và mặc định là TẮT', () => {
    expect(
      normalizeReferralAbuseConfig({
        minQualifiedReferrals: undefined,
        minDeviceClusters: undefined,
        minClusterSize: undefined,
      }),
    ).toEqual(DefaultReferralAbuseConfig);
    // Mặc định tắt là CÓ CHỦ ĐÍCH: dấu vết đăng ký mới được ghi từ 30/09 nên chưa ai
    // biết "bình thường" trông thế nào, và một ngưỡng chọn trước khi có dữ liệu là
    // phỏng đoán mặc áo chính sách.
    expect(referralAbuseReviewEnabled(DefaultReferralAbuseConfig)).toBe(false);
  });

  it('giá trị rác thì lùi về mặc định chứ không ra NaN', () => {
    expect(
      normalizeReferralAbuseConfig({
        minQualifiedReferrals: 5,
        minDeviceClusters: 'nhiều',
        minClusterSize: 0,
      }),
      // Chỉ VẾ ĐÓ lùi về mặc định, hai vế còn lại giữ nguyên — một giá trị rác ở
      // một dòng không được xoá hai dòng Admin đã đặt đúng.
    ).toEqual(DefaultReferralAbuseConfig);
  });

  it('sàn mẫu tối thiểu là 1 — 0 nghĩa là xét cả người chưa mời được ai', () => {
    expect(
      normalizeReferralAbuseConfig({
        minQualifiedReferrals: 0,
        minDeviceClusters: 2,
        minClusterSize: 0,
      }).minQualifiedReferrals,
    ).toBe(1);
  });

  it('cụm có từ 2 người nên minClusterSize 1 bị kẹp lên 2', () => {
    // Đặt 1 nghĩa là "mọi người đều là một cụm", tức vô nghĩa chứ không phải nghiêm
    // ngặt hơn.
    expect(
      normalizeReferralAbuseConfig({
        minQualifiedReferrals: 5,
        minDeviceClusters: 0,
        minClusterSize: 1,
      }).minClusterSize,
    ).toBe(2);
  });

  it('0 ở hai vế lọc là TẮT, không bị kẹp lên', () => {
    const config = normalizeReferralAbuseConfig({
      minQualifiedReferrals: 5,
      minDeviceClusters: 0,
      minClusterSize: 0,
    });
    expect(config.minDeviceClusters).toBe(0);
    expect(config.minClusterSize).toBe(0);
    expect(referralAbuseReviewEnabled(config)).toBe(false);
  });

  it('bật một vế là đủ để hàng đợi chạy — hai vế là HOẶC', () => {
    // Nhiều cụm nhỏ và một cụm rất lớn là hai hình dạng khác nhau của cùng một việc;
    // đòi cả hai cùng vượt là bỏ sót cả hai.
    expect(
      referralAbuseReviewEnabled(
        normalizeReferralAbuseConfig({
          minQualifiedReferrals: 5,
          minDeviceClusters: 2,
          minClusterSize: 0,
        }),
      ),
    ).toBe(true);
    expect(
      referralAbuseReviewEnabled(
        normalizeReferralAbuseConfig({
          minQualifiedReferrals: 5,
          minDeviceClusters: 0,
          minClusterSize: 4,
        }),
      ),
    ).toBe(true);
  });

  it('cắt phần thập phân thay vì giữ số lẻ', () => {
    expect(
      normalizeReferralAbuseConfig({
        minQualifiedReferrals: 5.9,
        minDeviceClusters: 2.7,
        minClusterSize: 3.2,
      }),
    ).toEqual({
      minQualifiedReferrals: 5,
      minDeviceClusters: 2,
      minClusterSize: 3,
    });
  });
});
