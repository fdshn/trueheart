import {
  CharityBeneficiaryRelations,
  CharityCampaignTypes,
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
