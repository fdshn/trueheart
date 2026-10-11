import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  AcceptGiftRequestParamDto,
  CreateGiftRequestBodyDto,
  CreateGiftRequestParamDto,
  ListPostRequestsParamDto,
  ListPostRequestsQueryDto,
  RedeemPostWithPointsBodyDto,
  WithdrawGiftRequestParamDto,
} from './index';

const ValidUuid = '4182a141-a5c5-5c25-92ab-0d4488158e8f';

async function errorsOf(
  dto: new (...args: never[]) => object,
  payload: Record<string, unknown>,
): Promise<string[]> {
  const errors = await validate(plainToInstance(dto, payload));
  return errors.flatMap((error) => Object.keys(error.constraints ?? {}));
}

describe('CreateGiftRequestBodyDto', () => {
  it('nhận lời nhắn hợp lệ', async () => {
    expect(
      await errorsOf(CreateGiftRequestBodyDto, { message: 'Em xin món này ạ' }),
    ).toEqual([]);
  });

  it('từ chối lời nhắn rỗng', async () => {
    // Lời nhắn là thứ người tặng dựa vào để chọn người nhận; rỗng thì họ không
    // có gì để cân nhắc.
    expect(await errorsOf(CreateGiftRequestBodyDto, { message: '' })).toContain(
      'isNotEmpty',
    );
  });

  it('từ chối lời nhắn quá 500 ký tự', async () => {
    // Trần này phải khớp `varchar(500)` của cột trong database — vượt mà lọt
    // xuống thì Postgres ném lỗi và người dùng nhận 500 thay vì lỗi validate.
    expect(
      await errorsOf(CreateGiftRequestBodyDto, { message: 'a'.repeat(501) }),
    ).toContain('maxLength');
  });

  it('chấp nhận đúng 500 ký tự', async () => {
    expect(
      await errorsOf(CreateGiftRequestBodyDto, { message: 'a'.repeat(500) }),
    ).toEqual([]);
  });

  it('từ chối message không phải chuỗi', async () => {
    expect(
      await errorsOf(CreateGiftRequestBodyDto, { message: 123 }),
    ).toContain('isString');
  });
});

describe('Tham số đường dẫn của gift-request', () => {
  const paramDtos = [
    ['CreateGiftRequestParamDto', CreateGiftRequestParamDto],
    ['WithdrawGiftRequestParamDto', WithdrawGiftRequestParamDto],
    ['ListPostRequestsParamDto', ListPostRequestsParamDto],
  ] as const;

  it.each(paramDtos)('%s nhận postId là UUID hợp lệ', async (_name, dto) => {
    expect(await errorsOf(dto, { postId: ValidUuid })).toEqual([]);
  });

  it.each(paramDtos)(
    '%s từ chối postId không phải UUID',
    async (_name, dto) => {
      expect(await errorsOf(dto, { postId: 'khong-phai-uuid' })).toContain(
        'isUuid',
      );
    },
  );

  it('AcceptGiftRequestParamDto đòi cả postId lẫn requestId', async () => {
    expect(
      await errorsOf(AcceptGiftRequestParamDto, {
        postId: ValidUuid,
        requestId: ValidUuid,
      }),
    ).toEqual([]);
    expect(
      await errorsOf(AcceptGiftRequestParamDto, {
        postId: ValidUuid,
        requestId: 'khong-phai-uuid',
      }),
    ).toContain('isUuid');
  });
});

describe('ListPostRequestsQueryDto', () => {
  it('bỏ trống thì hợp lệ, phân trang rơi về mặc định', async () => {
    expect(await errorsOf(ListPostRequestsQueryDto, {})).toEqual([]);
  });

  it('chặn pageSize vượt trần', async () => {
    // Trần tồn tại để một bài có hàng nghìn lượt xin không kéo hết về một
    // response.
    expect(
      await errorsOf(ListPostRequestsQueryDto, { page: 1, pageSize: 5000 }),
    ).toContain('max');
  });

  it('chặn page nhỏ hơn 1', async () => {
    expect(await errorsOf(ListPostRequestsQueryDto, { page: 0 })).toContain(
      'min',
    );
  });
});

describe('RedeemPostWithPointsBodyDto', () => {
  it('nhận con số xác nhận hợp lệ', async () => {
    expect(
      await errorsOf(RedeemPostWithPointsBodyDto, { confirmedPoints: 500 }),
    ).toEqual([]);
  });

  it('BẮT BUỘC gửi — bỏ trống là từ chối, không phải bỏ qua phép kiểm', async () => {
    // Đây là chỗ phép xác nhận của CHỐT-10 mục 2 thật sự được bắt buộc. Nếu
    // trường này tuỳ chọn thì client chỉ cần không gửi nó là lại về đúng hành vi
    // cũ: tính lại theo giá mới rồi trừ luôn.
    expect(await errorsOf(RedeemPostWithPointsBodyDto, {})).toContain('isInt');
  });

  it('từ chối 0 và số âm', async () => {
    // `quoteRedemption` không bao giờ trả 0 cho một bài đổi được — 0 nghĩa là
    // "chưa quy ra điểm được", và nhận nó ở đây sẽ biến bài chưa khai giá thành
    // một lượt đổi miễn phí nếu phép kiểm ở use case có ngày đổi hình.
    expect(
      await errorsOf(RedeemPostWithPointsBodyDto, { confirmedPoints: 0 }),
    ).toContain('min');
    expect(
      await errorsOf(RedeemPostWithPointsBodyDto, { confirmedPoints: -500 }),
    ).toContain('min');
  });

  it('từ chối số thập phân và chuỗi', async () => {
    expect(
      await errorsOf(RedeemPostWithPointsBodyDto, { confirmedPoints: 1.5 }),
    ).toContain('isInt');
    expect(
      await errorsOf(RedeemPostWithPointsBodyDto, { confirmedPoints: '500' }),
    ).toContain('isInt');
  });
});
