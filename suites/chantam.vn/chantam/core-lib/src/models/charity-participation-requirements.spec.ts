import { UserRanks } from '../consts';
import {
  MaxCharityMinimumSupervisors,
  charityMinimumSupervisorsMet,
  charitySupervisorRequirementGaps,
} from './charity-participation-requirements';

describe('điều kiện tham gia chiến dịch (PR #54, 18/11)', () => {
  it('trần số người tối thiểu là 100.000', () => {
    expect(MaxCharityMinimumSupervisors).toBe(100_000);
  });

  it.each([
    [{}],
    [{ minimumSupervisors: 0 }],
    [{ minimumSupervisors: 100_000 }],
    [{ minimumSupervisorRank: null }],
    [{ minimumSupervisorRank: UserRanks.SILVER }],
    [{ minimumSupervisorRank: 'DIAMOND' }],
  ])('hợp lệ: %p', (input) => {
    expect(charitySupervisorRequirementGaps(input)).toEqual([]);
  });

  it.each([
    [{ minimumSupervisors: -1 }],
    [{ minimumSupervisors: 1.5 }],
    [{ minimumSupervisors: 100_001 }],
    [{ minimumSupervisors: '5' }],
    [{ minimumSupervisorRank: 'PLATINUM' }],
    [{ minimumSupervisorRank: 'silver' }],
  ])('không hợp lệ: %p', (input) => {
    expect(charitySupervisorRequirementGaps(input)).not.toEqual([]);
  });

  it.each([
    [0, 0, true],
    [0, 5, true],
    [3, 2, false],
    [3, 3, true],
  ])('tối thiểu %p, đã check-in %p -> đạt = %p', (minimum, checkedIn, met) => {
    expect(charityMinimumSupervisorsMet(minimum, checkedIn)).toBe(met);
  });
});
