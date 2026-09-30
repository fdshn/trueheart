import { PointLedgerRepository } from './point-ledger.repository';
import { ReferralRepository } from './referral.repository';

const RefereeId = '10000000-0000-4000-8000-000000000001';

describe('ReferralRepository', () => {
  it('qualifies once and appends the reward in the same transaction', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([
        { referrer_id: '20000000-0000-4000-8000-000000000002' },
      ])
      // Phép đọc thứ hai: người MỜI còn hoạt động hay không.
      .mockResolvedValueOnce([
        { global_id: '20000000-0000-4000-8000-000000000002' },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { points: 56, affects_lifetime: true, version: 1, daily_cap: 3 },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ count: '0' }])
      .mockResolvedValueOnce([{ balance: 0, lifetime: 0 }])
      .mockResolvedValueOnce([{ id: '2' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: '1' }]);
    const manager = { query };
    const rootManager = {
      transaction: jest.fn(async (callback) => callback(manager)),
    };
    const ledger = new PointLedgerRepository(rootManager as never);
    const referrals = new ReferralRepository(rootManager as never, ledger);

    const qualified = await referrals.qualifyAndAward({ refereeId: RefereeId });

    expect(qualified).toEqual({
      qualified: true,
      referrerId: '20000000-0000-4000-8000-000000000002',
      // Trả kèm số điểm để thông báo cho người giới thiệu nói đúng con số. Lấy từ
      // bút toán vừa ghi, KHÔNG đọc lại `point_rules` — rule là cấu hình động nên
      // đọc lại có thể ra con số khác với con số đã vào sổ.
      awardedPoints: 56,
    });
    expect(rootManager.transaction).toHaveBeenCalledTimes(1);
    const sql = query.mock.calls.map(([statement]) => statement).join('\n');
    expect(sql).toContain('UPDATE referrals');
    expect(sql).toContain('INSERT INTO point_ledger');
  });

  it('không trả thưởng khi người MỜI đã bị khoá hoặc xoá', async () => {
    // Đường đăng ký đã kiểm ACTIVE, nhưng giữa lúc đăng ký và lúc trả thưởng còn
    // cả quá trình onboarding của người được mời — đủ vài ngày để Admin khoá tài
    // khoản farm. Đo được 30/09: tài khoản BANNED + xoá mềm vẫn nhận +56.
    const query = jest
      .fn()
      .mockResolvedValueOnce([
        { referrer_id: '20000000-0000-4000-8000-000000000002' },
      ])
      // Không còn dòng nào khớp `status = 'ACTIVE' AND deleted_at IS NULL`.
      .mockResolvedValueOnce([]);
    const manager = { query };
    const rootManager = {
      transaction: jest.fn(async (callback) => callback(manager)),
    };
    const ledger = new PointLedgerRepository(rootManager as never);
    const referrals = new ReferralRepository(rootManager as never, ledger);

    await expect(
      referrals.qualifyAndAward({ refereeId: RefereeId }),
    ).resolves.toEqual({ qualified: false });

    const sql = query.mock.calls.map(([statement]) => statement).join('\n');
    // Không ghi gì: không bút toán, và không đánh dấu đã tính — dòng ở lại trạng
    // thái treo, đúng như nhánh chạm trần ngày làm.
    expect(sql).not.toContain('INSERT INTO point_ledger');
    expect(sql).not.toContain('UPDATE referrals');
  });
});
