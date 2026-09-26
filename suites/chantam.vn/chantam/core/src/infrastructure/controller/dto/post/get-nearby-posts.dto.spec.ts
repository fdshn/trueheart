import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { GetNearbyPostsQueryDto } from './get-nearby-posts.dto';

const validQuery = {
  lat: 10.7724,
  lng: 106.698,
  radiusMeters: 5_000,
  postType: 'OFFER',
};

describe('GetNearbyPostsQueryDto', () => {
  it.each(['OFFER', 'WANTED', 'CHARITY', 'CLASSIFIED', 'MERIT'])(
    'accepts public post type %s',
    async (postType) => {
      const errors = await validate(
        plainToInstance(GetNearbyPostsQueryDto, { ...validQuery, postType }),
      );

      expect(errors).toHaveLength(0);
    },
  );

  it('reports the same allowed values advertised by Swagger', async () => {
    const errors = await validate(
      plainToInstance(GetNearbyPostsQueryDto, {
        ...validQuery,
        postType: 'ADS',
      }),
    );

    expect(errors[0].constraints?.isIn).toBe(
      'postType must be one of the following values: OFFER, WANTED, CHARITY, CLASSIFIED, MERIT',
    );
  });

  it.each([
    { postType: 'ADS' },
    { keyword: 'x' },
    { keyword: 'x'.repeat(101) },
    { categoryId: 'not-a-uuid' },
    { radiusMeters: 99 },
    { radiusMeters: 50_001 },
    { pageSize: 51 },
  ])('rejects invalid public discovery query %#', async (override) => {
    const errors = await validate(
      plainToInstance(GetNearbyPostsQueryDto, { ...validQuery, ...override }),
    );

    expect(errors).not.toHaveLength(0);
  });

  it('BỎ TRỐNG postType là hợp lệ — feed trộn cả năm loại', async () => {
    // Trước 26/09 tham số này bắt buộc, nên client muốn một feed trộn phải gọi
    // năm lần rồi tự ghép, mà mỗi lần phân trang riêng nên ghép xong thứ tự
    // vô nghĩa.
    const { postType, ...withoutType } = validQuery;
    void postType;

    const errors = await validate(
      plainToInstance(GetNearbyPostsQueryDto, withoutType),
    );

    expect(errors).toHaveLength(0);
  });

  it('nhận từ khoá tìm kiếm', async () => {
    const errors = await validate(
      plainToInstance(GetNearbyPostsQueryDto, {
        ...validQuery,
        keyword: 'nồi cơm điện',
      }),
    );

    expect(errors).toHaveLength(0);
  });

  it('BỎ TRỐNG cả toạ độ lẫn bán kính là hợp lệ — trả toàn bộ', async () => {
    // Không có gốc toạ độ thì bán kính không lọc gì; bắt gửi nó là bắt client
    // bịa ra một con số server sẽ lờ đi.
    const errors = await validate(
      plainToInstance(GetNearbyPostsQueryDto, { page: 1, pageSize: 20 }),
    );

    expect(errors).toHaveLength(0);
  });

  it('có toạ độ mà thiếu bán kính thì từ chối', async () => {
    // Ở nhánh này bán kính THỰC SỰ quyết định kết quả, nên thiếu nó là lỗi
    // client chứ không phải ý muốn quét toàn quốc.
    const errors = await validate(
      plainToInstance(GetNearbyPostsQueryDto, {
        lat: 10.7724,
        lng: 106.698,
        page: 1,
        pageSize: 20,
      }),
    );

    expect(errors).not.toHaveLength(0);
    expect(errors[0].property).toBe('radiusMeters');
  });

  it('bán kính sai giá trị vẫn bị bắt khi có toạ độ', async () => {
    const errors = await validate(
      plainToInstance(GetNearbyPostsQueryDto, {
        lat: 10.7724,
        lng: 106.698,
        radiusMeters: 50_001,
        page: 1,
        pageSize: 20,
      }),
    );

    expect(errors).not.toHaveLength(0);
  });
});
