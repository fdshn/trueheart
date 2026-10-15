import { plainToInstance } from 'class-transformer';
import { IsOptional, IsString, validateSync } from 'class-validator';
import { PatchMeritUnitDto } from './merit/merit.dto';
import { NotNullWhenPresent } from './not-null-when-present';
import { PatchSponsorBannerDto } from './sponsor-banner/sponsor-banner.dto';

class Probe {
  @NotNullWhenPresent()
  @IsString()
  required?: string;

  @IsOptional()
  @IsString()
  clearable?: string | null;
}

const errorsOf = (cls: new () => object, body: object) =>
  validateSync(plainToInstance(cls, body)).map((error) => error.property);

describe('NotNullWhenPresent', () => {
  it('không gửi thì bỏ qua như @IsOptional', () => {
    expect(errorsOf(Probe, {})).toEqual([]);
  });

  it('gửi null cho trường bắt buộc → 400, không lọt xuống thành 500', () => {
    expect(errorsOf(Probe, { required: null })).toEqual(['required']);
  });

  it('trường được xoá vẫn nhận null', () => {
    expect(errorsOf(Probe, { clearable: null })).toEqual([]);
  });
});

describe('PATCH công đức và banner: null chỉ hợp lệ ở trường được xoá', () => {
  it('đơn vị công đức: null ở trường bắt buộc bị chặn', () => {
    expect(
      errorsOf(PatchMeritUnitDto, {
        name: null,
        unitType: null,
        purpose: null,
        bankBin: null,
        bankAccountNumber: null,
        bankAccountName: null,
        displayOrder: null,
      }).sort(),
    ).toEqual(
      [
        'bankAccountName',
        'bankAccountNumber',
        'bankBin',
        'displayOrder',
        'name',
        'purpose',
        'unitType',
      ].sort(),
    );
  });

  it('đơn vị công đức: null ở trường được xoá được nhận', () => {
    expect(
      errorsOf(PatchMeritUnitDto, {
        description: null,
        coverUrl: null,
        addressLabel: null,
        bankName: null,
      }),
    ).toEqual([]);
  });

  it('banner: null ở trường bắt buộc bị chặn, partnerContact thì xoá được', () => {
    expect(
      errorsOf(PatchSponsorBannerDto, {
        partnerName: null,
        title: null,
        imageUrl: null,
        targetUrl: null,
        placement: null,
        displayOrder: null,
        startsAt: null,
        endsAt: null,
      }).sort(),
    ).toEqual(
      [
        'displayOrder',
        'endsAt',
        'imageUrl',
        'partnerName',
        'placement',
        'startsAt',
        'targetUrl',
        'title',
      ].sort(),
    );
    expect(errorsOf(PatchSponsorBannerDto, { partnerContact: null })).toEqual(
      [],
    );
  });
});
