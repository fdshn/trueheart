import {
  charityDistributionEvidenceGaps,
  charityDistributionFieldGaps,
  CharityDistributionMethod,
  charityDistributionMismatch,
  charityDistributionSettled,
  ICharityDistributionInput,
  stripInapplicableDistributionFields,
} from './charity-distribution';

const completeInputs: Record<
  CharityDistributionMethod,
  ICharityDistributionInput
> = {
  DIRECT_RECIPIENT: {
    distributionMethod: 'DIRECT_RECIPIENT',
    contributionTypes: ['MATERIAL'],
    locationLabel: null,
    address: null,
    lat: null,
    lng: null,
    serviceType: null,
    serviceChannel: null,
    privateDetails: {
      beneficiaryBankAccountId: null,
      recipientName: 'Nguyen Van A',
      recipientPhone: '0900000000',
      recipientAddress: '1 Duong A',
      coordinatorName: 'Tran Van B',
      coordinatorPhone: '0910000000',
      carrier: null,
      shippingFeePayer: null,
      estimatedShippingFee: null,
      trackingCode: null,
      transferContent: null,
    },
  },
  SHIPPING: {
    distributionMethod: 'SHIPPING',
    contributionTypes: ['MATERIAL'],
    locationLabel: null,
    address: null,
    lat: null,
    lng: null,
    serviceType: null,
    serviceChannel: null,
    privateDetails: {
      beneficiaryBankAccountId: null,
      recipientName: 'Nguyen Van A',
      recipientPhone: '0900000000',
      recipientAddress: '1 Duong A',
      coordinatorName: null,
      coordinatorPhone: null,
      carrier: 'Viettel Post',
      shippingFeePayer: 'ORGANIZER',
      estimatedShippingFee: 10000,
      trackingCode: 'VT123',
      transferContent: null,
    },
  },
  OTHER_LOCATION: {
    distributionMethod: 'OTHER_LOCATION',
    contributionTypes: ['MATERIAL'],
    locationLabel: 'Nha van hoa',
    address: '1 Duong A',
    lat: null,
    lng: null,
    serviceType: null,
    serviceChannel: null,
    privateDetails: {
      beneficiaryBankAccountId: null,
      recipientName: null,
      recipientPhone: null,
      recipientAddress: null,
      coordinatorName: 'Tran Van B',
      coordinatorPhone: null,
      carrier: null,
      shippingFeePayer: null,
      estimatedShippingFee: null,
      trackingCode: null,
      transferContent: null,
    },
  },
  BANK_TRANSFER: {
    distributionMethod: 'BANK_TRANSFER',
    contributionTypes: ['MONEY'],
    locationLabel: null,
    address: null,
    lat: null,
    lng: null,
    serviceType: null,
    serviceChannel: null,
    privateDetails: {
      beneficiaryBankAccountId: null,
      recipientName: null,
      recipientPhone: null,
      recipientAddress: null,
      coordinatorName: null,
      coordinatorPhone: null,
      carrier: null,
      shippingFeePayer: null,
      estimatedShippingFee: null,
      trackingCode: null,
      transferContent: 'UNG HO CHIEN DICH',
    },
  },
  SERVICE: {
    distributionMethod: 'SERVICE',
    contributionTypes: ['SERVICE'],
    locationLabel: null,
    address: null,
    lat: null,
    lng: null,
    serviceType: 'LABOR',
    serviceChannel: 'IN_PERSON',
    privateDetails: {
      beneficiaryBankAccountId: null,
      recipientName: null,
      recipientPhone: null,
      recipientAddress: null,
      coordinatorName: 'Tran Van B',
      coordinatorPhone: null,
      carrier: null,
      shippingFeePayer: null,
      estimatedShippingFee: null,
      trackingCode: null,
      transferContent: null,
    },
  },
};

describe('quy tắc hình thức trao theo đợt', () => {
  it.each([
    [
      'DIRECT_RECIPIENT',
      [
        'privateDetails.recipientAddress',
        'privateDetails.coordinatorName',
        'privateDetails.coordinatorPhone',
      ],
    ],
    [
      'SHIPPING',
      [
        'privateDetails.recipientName',
        'privateDetails.recipientPhone',
        'privateDetails.recipientAddress',
        'privateDetails.carrier',
        'privateDetails.shippingFeePayer',
        'privateDetails.estimatedShippingFee',
      ],
    ],
    // Cấp chiến dịch (CR 22/11/2026): địa điểm trao là địa chỉ của các đơn vị nhận / điểm
    // tiếp nhận, nên OTHER_LOCATION chỉ còn bắt buộc người phụ trách.
    ['OTHER_LOCATION', ['privateDetails.coordinatorName']],
    ['BANK_TRANSFER', ['privateDetails.transferContent']],
    [
      'SERVICE',
      ['serviceType', 'serviceChannel', 'privateDetails.coordinatorName'],
    ],
  ] as const)(
    'báo chính xác từng trường bắt buộc của %s',
    (method, requiredFields) => {
      expect(charityDistributionFieldGaps(completeInputs[method])).toEqual([]);

      for (const field of requiredFields) {
        const input = structuredClone(completeInputs[method]);
        const [scope, key] = field.split('.');
        if (key)
          input.privateDetails[key as keyof typeof input.privateDetails] = null;
        else input[scope as keyof ICharityDistributionInput] = null as never;
        expect(charityDistributionFieldGaps(input)).toEqual([field]);
      }
    },
  );

  it('báo thiếu contributionTypes với mọi hình thức', () => {
    expect(
      charityDistributionFieldGaps({
        ...completeInputs.SERVICE,
        contributionTypes: [],
      }),
    ).toEqual(['contributionTypes']);
  });

  it('coi chuỗi chỉ có khoảng trắng là thiếu', () => {
    expect(
      charityDistributionFieldGaps({
        ...completeInputs.SERVICE,
        privateDetails: {
          ...completeInputs.SERVICE.privateDetails,
          coordinatorName: '   ',
        },
      }),
    ).toEqual(['privateDetails.coordinatorName']);
  });

  it('OTHER_LOCATION không còn bắt buộc nhãn hay địa chỉ điểm trao', () => {
    expect(
      charityDistributionFieldGaps({
        ...completeInputs.OTHER_LOCATION,
        locationLabel: null,
        address: null,
        lat: null,
        lng: null,
      }),
    ).toEqual([]);
  });

  it('từ chối BANK_TRANSFER không nhận MONEY', () => {
    expect(
      charityDistributionMismatch({
        ...completeInputs.BANK_TRANSFER,
        contributionTypes: ['MATERIAL'],
      }),
    ).not.toBeNull();
  });

  it('round cũ không có method không cần trường hay bằng chứng', () => {
    const legacy = { ...completeInputs.SERVICE, distributionMethod: null };
    expect(charityDistributionFieldGaps(legacy)).toEqual([]);
    expect(
      charityDistributionEvidenceGaps({
        distributionMethod: null,
        evidenceUrls: [],
        trackingCode: null,
      }),
    ).toEqual([]);
  });

  it('SHIPPING có bằng chứng nhưng thiếu mã vận đơn', () => {
    expect(
      charityDistributionEvidenceGaps({
        distributionMethod: 'SHIPPING',
        evidenceUrls: ['https://example.com/evidence.jpg'],
        trackingCode: null,
      }),
    ).toEqual(['trackingCode']);
  });

  it('mọi round mới cần bằng chứng', () => {
    expect(
      charityDistributionEvidenceGaps({
        distributionMethod: 'SERVICE',
        evidenceUrls: [],
        trackingCode: null,
      }),
    ).toEqual(['evidenceUrls']);
  });

  it('giữ đúng các trường DIRECT_RECIPIENT áp dụng', () => {
    const result = stripInapplicableDistributionFields(
      completeInputs.DIRECT_RECIPIENT,
    );
    expect(result.privateDetails).toMatchObject({
      recipientName: 'Nguyen Van A',
      recipientPhone: '0900000000',
      recipientAddress: '1 Duong A',
      coordinatorName: 'Tran Van B',
      coordinatorPhone: '0910000000',
      carrier: null,
      shippingFeePayer: null,
      estimatedShippingFee: null,
      trackingCode: null,
      transferContent: null,
    });
    expect(result.locationLabel).toBeNull();
    expect(result.serviceType).toBeNull();
  });

  it('giữ đúng các trường SHIPPING áp dụng', () => {
    const result = stripInapplicableDistributionFields({
      ...completeInputs.SHIPPING,
      locationLabel: 'Sai',
      address: 'Sai',
      lat: 1,
      lng: 2,
      serviceType: 'LABOR',
      serviceChannel: 'ONLINE',
      privateDetails: {
        ...completeInputs.SHIPPING.privateDetails,
        coordinatorName: 'Sai',
        coordinatorPhone: 'Sai',
        transferContent: 'Sai',
      },
    });
    expect(result.privateDetails).toMatchObject({
      recipientName: 'Nguyen Van A',
      recipientPhone: '0900000000',
      recipientAddress: '1 Duong A',
      carrier: 'Viettel Post',
      shippingFeePayer: 'ORGANIZER',
      estimatedShippingFee: 10000,
      trackingCode: 'VT123',
      coordinatorName: null,
      coordinatorPhone: null,
      transferContent: null,
    });
    expect(result.locationLabel).toBeNull();
    expect(result.serviceChannel).toBeNull();
  });

  it('chỉ BANK_TRANSFER giữ tài khoản thụ hưởng gắn với đợt', () => {
    const linked = (input: ICharityDistributionInput) =>
      stripInapplicableDistributionFields({
        ...input,
        privateDetails: {
          ...input.privateDetails,
          beneficiaryBankAccountId: 'acc-1',
        },
      }).privateDetails.beneficiaryBankAccountId;
    expect(linked(completeInputs.BANK_TRANSFER)).toBe('acc-1');
    expect(linked(completeInputs.SERVICE)).toBeNull();
  });
});

describe('charityDistributionSettled', () => {
  const base = {
    evidenceUrls: ['https://cdn.example.com/a.jpg'],
    trackingCode: null,
  };

  it('BANK_TRANSFER có bằng chứng nhưng tài khoản chưa xác thực thì chưa xong', () => {
    expect(
      charityDistributionSettled({
        ...base,
        distributionMethod: 'BANK_TRANSFER',
        beneficiaryAccount: { verified: false, live: true, sameCampaign: true },
      }),
    ).toEqual(
      expect.objectContaining({ settled: false, accountVerified: false }),
    );
  });

  it('BANK_TRANSFER thiếu tài khoản thì chưa xong', () => {
    expect(
      charityDistributionSettled({
        ...base,
        distributionMethod: 'BANK_TRANSFER',
        beneficiaryAccount: null,
      }).settled,
    ).toBe(false);
  });

  it('BANK_TRANSFER đủ bằng chứng và tài khoản hợp lệ thì xong', () => {
    expect(
      charityDistributionSettled({
        ...base,
        distributionMethod: 'BANK_TRANSFER',
        beneficiaryAccount: { verified: true, live: true, sameCampaign: true },
      }),
    ).toEqual({ settled: true, evidenceGaps: [], accountVerified: true });
  });

  it('chiến dịch cũ không có hình thức luôn coi là xong', () => {
    expect(
      charityDistributionSettled({
        distributionMethod: null,
        evidenceUrls: [],
        trackingCode: null,
        beneficiaryAccount: null,
      }).settled,
    ).toBe(true);
  });
});
