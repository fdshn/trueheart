import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  CharityCampaignDistributionDto,
  UpdateAdminCharityCampaignDto,
  WriteCharityCampaignDto,
} from './charity-campaign.dto';
import { CharityRoundInputDto } from './charity-operations.dto';
import {
  CharityBeneficiaryBankAccountDto,
  CharityProfileDto,
} from './charity-project.dto';

const failedFields = async (
  cls: new () => object,
  input: Record<string, unknown>,
) =>
  (await validate(plainToInstance(cls, input))).map((error) => error.property);

const round = {
  title: 'Đợt 1',
  startsAt: '2026-12-20T01:00:00Z',
  endsAt: '2026-12-20T09:00:00Z',
};
const distribution = {
  method: 'SHIPPING',
  contributionTypes: ['MATERIAL'],
  scheduledStart: '2026-12-20T01:00:00Z',
  scheduledEnd: '2026-12-20T09:00:00Z',
};

/** Độ rộng cột B2 / C1 — DTO không được lỏng hơn, nếu không câu ghi đổ ra 500. */
const privateLimits: [string, number][] = [
  ['recipientName', 200],
  ['recipientPhone', 30],
  ['recipientAddress', 500],
  ['coordinatorName', 200],
  ['coordinatorPhone', 30],
  ['carrier', 200],
  ['trackingCode', 100],
  ['transferContent', 200],
];

describe('Giới hạn DTO hình thức trao khớp cột database', () => {
  it.each([
    ['CharityRoundInputDto', CharityRoundInputDto, round],
    [
      'CharityCampaignDistributionDto',
      CharityCampaignDistributionDto,
      distribution,
    ],
  ] as const)(
    '%s: chuỗi riêng tư đúng độ rộng cột',
    async (_name, cls, base) => {
      for (const [field, max] of privateLimits) {
        expect(
          await failedFields(cls, { ...base, [field]: 'x'.repeat(max) }),
        ).not.toContain(field);
        expect(
          await failedFields(cls, { ...base, [field]: 'x'.repeat(max + 1) }),
        ).toContain(field);
      }
    },
  );

  it.each([
    ['CharityRoundInputDto', CharityRoundInputDto, round],
    [
      'CharityCampaignDistributionDto',
      CharityCampaignDistributionDto,
      distribution,
    ],
  ] as const)(
    '%s: estimatedShippingFee 0..10_000_000, số nguyên',
    async (_name, cls, base) => {
      for (const ok of [0, 10_000_000])
        expect(
          await failedFields(cls, { ...base, estimatedShippingFee: ok }),
        ).not.toContain('estimatedShippingFee');
      for (const bad of [-1, 10_000_001, 1.5])
        expect(
          await failedFields(cls, { ...base, estimatedShippingFee: bad }),
        ).toContain('estimatedShippingFee');
    },
  );

  it.each([
    ['CharityRoundInputDto', CharityRoundInputDto, round],
    [
      'CharityCampaignDistributionDto',
      CharityCampaignDistributionDto,
      distribution,
    ],
  ] as const)(
    '%s: contributionTypes tối đa 3, chỉ ba loại',
    async (_name, cls, base) => {
      expect(
        await failedFields(cls, {
          ...base,
          contributionTypes: ['MATERIAL', 'MONEY', 'SERVICE'],
        }),
      ).not.toContain('contributionTypes');
      expect(
        await failedFields(cls, {
          ...base,
          contributionTypes: ['MATERIAL', 'MONEY', 'SERVICE', 'MATERIAL'],
        }),
      ).toContain('contributionTypes');
      expect(
        await failedFields(cls, { ...base, contributionTypes: ['CASH'] }),
      ).toContain('contributionTypes');
    },
  );

  it('tài khoản thụ hưởng: bank_name 200, account_no 40, account_name 200', async () => {
    const base = {
      holderType: 'OWNER',
      bankName: 'VCB',
      accountNo: '0123456789',
      accountName: 'NGUYEN VAN A',
    };
    for (const [field, max, char] of [
      ['bankName', 200, 'x'],
      ['accountNo', 40, '1'],
      ['accountName', 200, 'x'],
    ] as const) {
      expect(
        await failedFields(CharityBeneficiaryBankAccountDto, {
          ...base,
          [field]: char.repeat(max),
        }),
      ).not.toContain(field);
      expect(
        await failedFields(CharityBeneficiaryBankAccountDto, {
          ...base,
          [field]: char.repeat(max + 1),
        }),
      ).toContain(field);
    }
  });

  it.each([
    ['WriteCharityCampaignDto', WriteCharityCampaignDto],
    ['UpdateAdminCharityCampaignDto', UpdateAdminCharityCampaignDto],
    ['CharityProfileDto', CharityProfileDto],
  ] as const)('%s: acceptedContributionTypes tối đa 3', async (_name, cls) => {
    expect(
      await failedFields(cls, {
        acceptedContributionTypes: ['MATERIAL', 'MONEY', 'SERVICE'],
      }),
    ).not.toContain('acceptedContributionTypes');
    expect(
      await failedFields(cls, {
        acceptedContributionTypes: ['MATERIAL', 'MONEY', 'SERVICE', 'MONEY'],
      }),
    ).toContain('acceptedContributionTypes');
  });
});
