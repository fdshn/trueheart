import { CoreErrors } from './error-catalog';
import { ErrorCodes } from './error-codes';

describe('Mã lỗi CR giám sát viên / tổng duyệt / đơn vị nhận', () => {
  const ordered = [
    'CHARITY_BENEFICIARY_DISTRIBUTION_TIME_OUT_OF_RANGE',
    'CHARITY_NEED_BELOW_ESTIMATED_PORTIONS',
    'CHARITY_FUNDING_BELOW_ESTIMATED_AMOUNT',
    'CHARITY_REHEARSAL_NOT_READY',
    'CHARITY_INTAKE_CLOSED',
    'CHARITY_SUPERVISOR_CONFLICT',
    'CHARITY_SCHEDULE_INVALID',
    'CHARITY_REVISION_PENDING_EXISTS',
    'CHARITY_CHANGE_REQUIRES_REVIEW',
    'CHARITY_CAMPAIGN_SUMMARY_NOT_PUBLISHED',
  ] as const;

  it('mã 0x13_5c–0x13_65 đúng thứ tự spec', () => {
    const codes = ordered.map(
      (key) => (ErrorCodes as unknown as Record<string, number>)[key],
    );
    expect(codes).toEqual([
      0x135c, 0x135d, 0x135e, 0x135f, 0x1360, 0x1361, 0x1362, 0x1363, 0x1364,
      0x1365,
    ]);
  });

  it('mã HTTP theo đúng thứ tự spec', () => {
    const statuses = ordered.map(
      (key) =>
        (CoreErrors as unknown as Record<string, { httpStatus: number }>)[key]
          .httpStatus,
    );
    expect(statuses).toEqual([
      400, 400, 400, 409, 409, 409, 400, 409, 409, 409,
    ]);
  });

  it('details của CHARITY_NEED_BELOW_ESTIMATED_PORTIONS trả danh sách dòng kèm minimumQuantity', () => {
    const items = [
      { index: 0, needItemId: null, itemName: 'Áo', minimumQuantity: 300 },
    ];
    expect(
      CoreErrors.CHARITY_NEED_BELOW_ESTIMATED_PORTIONS.details(items),
    ).toEqual({
      items,
    });
  });

  it('mã round cũ giữ nguyên số', () => {
    expect(ErrorCodes.CHARITY_ROUND_NOT_FOUND).toBe(0x134a);
    expect(ErrorCodes.CHARITY_ROUND_INVALID_STATE).toBe(0x134b);
  });
});
