export const CharityContributionTypes = [
  'MATERIAL',
  'MONEY',
  'SERVICE',
] as const;

export type CharityContributionType = (typeof CharityContributionTypes)[number];

export interface ICharityIntakeCounts {
  readonly openMaterialNeeds: number;
  readonly openFundingNeeds: number;
  readonly openSupportNeeds: number;
  readonly liveBankAccounts: number;
}

export function charitySubmitRequirementGaps(
  types: readonly CharityContributionType[],
  counts: ICharityIntakeCounts,
): string[] {
  const gaps: string[] = [];

  if (types.includes('MATERIAL') && counts.openMaterialNeeds < 1)
    gaps.push('MATERIAL: chưa có nhu cầu hiện vật đang mở');

  if (types.includes('MONEY')) {
    if (counts.openFundingNeeds < 1)
      gaps.push('MONEY: chưa có nhu cầu tiền đang mở');
    if (counts.liveBankAccounts < 1)
      gaps.push('MONEY: chưa có tài khoản nhận đang hiệu lực');
  }

  if (types.includes('SERVICE') && counts.openSupportNeeds < 1)
    gaps.push('SERVICE: chưa có nhu cầu dịch vụ đang mở');

  return gaps;
}

export function deriveAcceptedContributionTypes(input: {
  readonly materialNeeds: number;
  readonly fundingNeeds: number;
  readonly supportNeeds: number;
}): CharityContributionType[] {
  return CharityContributionTypes.filter(
    (type): type is CharityContributionType =>
      (type === 'MATERIAL' && input.materialNeeds > 0) ||
      (type === 'MONEY' && input.fundingNeeds > 0) ||
      (type === 'SERVICE' && input.supportNeeds > 0),
  );
}

export function normalizeContributionTypes(
  values: readonly CharityContributionType[],
): CharityContributionType[] {
  return CharityContributionTypes.filter((type) => values.includes(type));
}
