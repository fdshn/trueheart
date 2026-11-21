export const CharityBeneficiaryAccountHolderTypes = [
  'OWNER',
  'BENEFICIARY',
] as const;
export type CharityBeneficiaryAccountHolderType =
  (typeof CharityBeneficiaryAccountHolderTypes)[number];

export interface ICharityBeneficiaryBankAccountInput {
  holderType: CharityBeneficiaryAccountHolderType;
  partyId: string | null;
  bankName: string;
  accountNo: string;
  accountName: string;
}

export interface ICharityBeneficiaryBankAccount extends ICharityBeneficiaryBankAccountInput {
  accountId: string;
  validFrom: Date;
  validTo: Date | null;
  closeReason: string | null;
  verifiedAt: Date | null;
  verifiedBy: string | null;
}

export type AddCharityBeneficiaryBankAccountOutcome =
  | { status: 'CREATED'; account: ICharityBeneficiaryBankAccount }
  | { status: 'REPLACED_NOT_FOUND' };

export function normalizeHolderName(value: string | null): string {
  return (value ?? '')
    .replaceAll('đ', 'd')
    .replaceAll('Đ', 'D')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function holderNameMatches(
  accountName: string,
  expected: string | null,
): boolean {
  return (
    expected !== null &&
    expected.trim() !== '' &&
    normalizeHolderName(accountName) === normalizeHolderName(expected)
  );
}
