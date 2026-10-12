import {
  canEditContribution,
  CharityBeneficiaryRelations,
  CharityCampaignTypes,
  contributionDecisionProblem,
  contributionStatusFrom,
  firstNeedOverflow,
  MaxNeedItemQuantity,
  MaxNeedItemsPerCampaign,
  overallNeedProgressPercent,
  remainingNeedQuantity,
} from './charity-campaign';

describe('remainingNeedQuantity (F65b §3)', () => {
  it('trừ cả phần đã nhận đề nghị và phần thực nhận', () => {
    expect(
      remainingNeedQuantity({
        targetQuantity: 100,
        acceptedQuantity: 30,
        receivedQuantity: 20,
      }),
    ).toBe(50);
  });

  it('không bao giờ âm, dù projection vượt mục tiêu', () => {
    // Chiến dịch cho phép vượt mục tiêu thì `accepted + received` có thể lớn hơn
    // `target`. Một số âm ở đây sẽ chảy vào phép so "còn thiếu bao nhiêu" và biến
    // thành "được nhận thêm" ở nơi gọi.
    expect(
      remainingNeedQuantity({
        targetQuantity: 100,
        acceptedQuantity: 80,
        receivedQuantity: 40,
      }),
    ).toBe(0);
  });

  it('đề nghị CHƯA được chấp nhận không giữ chỗ', () => {
    // Đây là quyết định nghiệp vụ, không phải chi tiết kỹ thuật: hàm không nhận
    // `pendingQuantity` nên không có đường nào cho nó trừ vào phần còn thiếu. Giữ
    // chỗ theo đề nghị thì một loạt đề nghị không thực hiện làm chiến dịch trông
    // như đã đủ và chặn người tặng thật.
    const base = { targetQuantity: 100, acceptedQuantity: 0 };
    expect(remainingNeedQuantity({ ...base, receivedQuantity: 0 })).toBe(100);
  });
});

describe('overallNeedProgressPercent (F65b §3)', () => {
  it('trung bình TỶ LỆ, không cộng số lượng khác đơn vị', () => {
    // 100kg gạo xong một nửa, 10 thùng mì xong hết → 50% và 100% ra 75%.
    // Cộng số lượng sẽ ra 55/110, một con số không có nghĩa vì kg và thùng không
    // cùng thang.
    expect(
      overallNeedProgressPercent([
        { targetQuantity: 100, acceptedQuantity: 50, receivedQuantity: 0 },
        { targetQuantity: 10, acceptedQuantity: 0, receivedQuantity: 10 },
      ]),
    ).toBe(75);
  });

  it('kẹp mỗi dòng ở 100% TRƯỚC khi lấy trung bình', () => {
    // Một dòng vượt mục tiêu 300% không được kéo cả chiến dịch lên quá 100%, và
    // cũng không được bù cho dòng chưa ai tặng.
    expect(
      overallNeedProgressPercent([
        { targetQuantity: 10, acceptedQuantity: 30, receivedQuantity: 0 },
        { targetQuantity: 10, acceptedQuantity: 0, receivedQuantity: 0 },
      ]),
    ).toBe(50);
  });

  it('chưa khai nhu cầu nào thì null, KHÔNG phải 0', () => {
    // 0% nghĩa là "chưa nhận được gì"; đây là "chưa khai nhu cầu nào". Trả 0 sẽ
    // cho client vẽ một progress bar rỗng cho một chiến dịch không có mục tiêu.
    expect(overallNeedProgressPercent([])).toBeNull();
  });

  it('dòng mục tiêu 0 không làm phép chia cho 0', () => {
    expect(
      overallNeedProgressPercent([
        { targetQuantity: 0, acceptedQuantity: 0, receivedQuantity: 0 },
      ]),
    ).toBe(0);
  });
});

describe('hằng của phân hệ từ thiện', () => {
  it('hai loại hoạt động, đúng tên mà CHECK ở database nhận', () => {
    expect([...CharityCampaignTypes]).toEqual([
      'INDIVIDUAL_APPEAL',
      'ORGANIZED_CAMPAIGN',
    ]);
    expect([...CharityBeneficiaryRelations]).toEqual(['SELF', 'OTHER']);
  });

  it('trần số lượng khớp CHK_campaign_need_items_target', () => {
    // Lệch con số này với CHECK ở database thì client nhận 500 thay vì lỗi validate.
    expect(MaxNeedItemQuantity).toBe(1_000_000);
    expect(MaxNeedItemsPerCampaign).toBe(50);
  });
});

describe('contributionStatusFrom (F65b §4)', () => {
  it('còn dòng CHƯA quyết thì vẫn là PENDING_REVIEW', () => {
    // Một đề nghị ba dòng mới xử một dòng chưa phải là đề nghị đã xử. Kết luận
    // sớm sẽ khoá đường sửa của contributor trong khi organizer còn đang xem.
    expect(
      contributionStatusFrom([
        { offeredQuantity: 50, acceptedQuantity: 50 },
        { offeredQuantity: 10, acceptedQuantity: null },
      ]),
    ).toBe('PENDING_REVIEW');
  });

  it('nhận ĐỦ mọi dòng là ACCEPTED', () => {
    expect(
      contributionStatusFrom([
        { offeredQuantity: 50, acceptedQuantity: 50 },
        { offeredQuantity: 10, acceptedQuantity: 10 },
      ]),
    ).toBe('ACCEPTED');
  });

  it('nhận đủ vài dòng mà BỎ HẲN dòng khác vẫn là nhận một phần', () => {
    // Đây là ca dễ sai nhất: "mọi dòng được nhận đều nhận đủ" không phải
    // "nhận đủ". Người tặng cần thấy rằng một món của họ không được nhận.
    expect(
      contributionStatusFrom([
        { offeredQuantity: 50, acceptedQuantity: 50 },
        { offeredQuantity: 10, acceptedQuantity: 0 },
      ]),
    ).toBe('PARTIALLY_ACCEPTED');
  });

  it('nhận ít hơn trên một dòng cũng là nhận một phần', () => {
    expect(
      contributionStatusFrom([{ offeredQuantity: 50, acceptedQuantity: 30 }]),
    ).toBe('PARTIALLY_ACCEPTED');
  });

  it('không nhận dòng nào là REJECTED', () => {
    expect(
      contributionStatusFrom([
        { offeredQuantity: 50, acceptedQuantity: 0 },
        { offeredQuantity: 10, acceptedQuantity: 0 },
      ]),
    ).toBe('REJECTED');
  });

  it('không có dòng nào thì PENDING_REVIEW, không phải REJECTED', () => {
    // Một đề nghị rỗng không tồn tại được qua API, nhưng nếu có thì nó là dữ liệu
    // hỏng — và gọi nó REJECTED là khẳng định organizer đã quyết điều họ chưa thấy.
    expect(contributionStatusFrom([])).toBe('PENDING_REVIEW');
  });
});

describe('canEditContribution (F65b §4)', () => {
  it('chỉ sửa/rút được khi CHƯA có phần nào được chấp nhận', () => {
    expect(canEditContribution('PENDING_REVIEW')).toBe(true);
    for (const status of [
      'PARTIALLY_ACCEPTED',
      'ACCEPTED',
      'REJECTED',
      'WITHDRAWN',
    ] as const)
      expect(canEditContribution(status)).toBe(false);
  });
});

describe('contributionDecisionProblem (F65b §4–§5)', () => {
  const lines = [
    { contributionItemId: 'a', needItemId: 'gao', offeredQuantity: 50 },
    { contributionItemId: 'b', needItemId: 'mi', offeredQuantity: 10 },
  ];

  it('quyết đủ mọi dòng, đúng luật thì hợp lệ', () => {
    expect(
      contributionDecisionProblem(lines, [
        { contributionItemId: 'a', acceptedQuantity: 50 },
        {
          contributionItemId: 'b',
          acceptedQuantity: 0,
          rejectionReason: 'QUALITY_NOT_ACCEPTABLE',
        },
      ]),
    ).toBeNull();
  });

  it('BỎ SÓT một dòng thì không hợp lệ — không quyết dần', () => {
    // Đề nghị nửa đã quyết sinh lượt giao nhận cho phần đã nhận, và lượt quyết thứ
    // hai không có chỗ đặt lượt giao nhận thứ hai.
    expect(
      contributionDecisionProblem(lines, [
        { contributionItemId: 'a', acceptedQuantity: 50 },
      ]),
    ).toMatch(/đủ mọi dòng/);
  });

  it('nhận ÍT hơn đề nghị mà không có lý do thì không hợp lệ', () => {
    expect(
      contributionDecisionProblem(lines, [
        { contributionItemId: 'a', acceptedQuantity: 30 },
        { contributionItemId: 'b', acceptedQuantity: 10 },
      ]),
    ).toMatch(/lý do/);
  });

  it('nhận ĐỦ mà mang lý do từ chối thì không hợp lệ', () => {
    expect(
      contributionDecisionProblem(lines, [
        {
          contributionItemId: 'a',
          acceptedQuantity: 50,
          rejectionReason: 'TARGET_REACHED',
        },
        { contributionItemId: 'b', acceptedQuantity: 10 },
      ]),
    ).toMatch(/không có lý do/);
  });

  it('nhận NHIỀU hơn đề nghị thì không hợp lệ', () => {
    // Nhận nhiều hơn là tự khai một cam kết thay cho người tặng.
    expect(
      contributionDecisionProblem(lines, [
        { contributionItemId: 'a', acceptedQuantity: 51 },
        { contributionItemId: 'b', acceptedQuantity: 10 },
      ]),
    ).toMatch(/từ 0 tới 50/);
  });

  it('dòng lạ hoặc quyết một dòng hai lần thì không hợp lệ', () => {
    expect(
      contributionDecisionProblem(lines, [
        { contributionItemId: 'x', acceptedQuantity: 1 },
      ]),
    ).toMatch(/không thuộc/);
    expect(
      contributionDecisionProblem(lines, [
        { contributionItemId: 'a', acceptedQuantity: 50 },
        { contributionItemId: 'a', acceptedQuantity: 50 },
      ]),
    ).toMatch(/hai lần/);
  });
});

describe('firstNeedOverflow (F65b §5)', () => {
  const needs = [
    {
      needItemId: 'gao',
      itemName: 'Gạo tẻ',
      targetQuantity: 100,
      acceptedQuantity: 60,
      receivedQuantity: 20,
    },
  ];

  it('vừa khít phần còn thiếu thì cho qua', () => {
    expect(
      firstNeedOverflow(needs, [{ needItemId: 'gao', acceptedQuantity: 20 }]),
    ).toBeNull();
  });

  it('vượt một đơn vị thì chặn, và nói phần còn lại MỚI NHẤT', () => {
    // Không âm thầm cắt số: người tổ chức phải biết chính xác mình vừa chấp nhận
    // bao nhiêu (§5).
    expect(
      firstNeedOverflow(needs, [{ needItemId: 'gao', acceptedQuantity: 21 }]),
    ).toEqual({
      needItemId: 'gao',
      itemName: 'Gạo tẻ',
      requested: 21,
      remaining: 20,
    });
  });

  it('dòng nhận 0 không bao giờ là vượt, kể cả khi nhu cầu đã đủ', () => {
    // Từ chối một dòng của một nhu cầu đã đủ là việc người tổ chức PHẢI làm được —
    // đó đúng là lý do `TARGET_REACHED` tồn tại.
    expect(
      firstNeedOverflow(
        [{ ...needs[0], acceptedQuantity: 80 }],
        [{ needItemId: 'gao', acceptedQuantity: 0 }],
      ),
    ).toBeNull();
  });
});
