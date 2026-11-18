import { UserRanks } from '../consts';
import {
  MaxCharityMinimumParticipants,
  charityMinimumParticipantsMet,
  charityParticipationRequirementGaps,
} from './charity-participation-requirements';

describe('điều kiện tham gia chiến dịch (PR #54, 18/11)', () => {
  it('trần số người tối thiểu là 100.000', () => {
    expect(MaxCharityMinimumParticipants).toBe(100_000);
  });

  it.each([
    [{}],
    [{ minimumParticipants: 0 }],
    [{ minimumParticipants: 100_000 }],
    [{ minimumParticipantRank: null }],
    [{ minimumParticipantRank: UserRanks.SILVER }],
    [{ minimumParticipantRank: 'DIAMOND' }],
  ])('hợp lệ: %p', (input) => {
    expect(charityParticipationRequirementGaps(input)).toEqual([]);
  });

  it.each([
    [{ minimumParticipants: -1 }],
    [{ minimumParticipants: 1.5 }],
    [{ minimumParticipants: 100_001 }],
    [{ minimumParticipants: '5' }],
    [{ minimumParticipantRank: 'PLATINUM' }],
    [{ minimumParticipantRank: 'silver' }],
  ])('không hợp lệ: %p', (input) => {
    expect(charityParticipationRequirementGaps(input)).not.toEqual([]);
  });

  it.each([
    [0, 0, true],
    [0, 5, true],
    [3, 2, false],
    [3, 3, true],
  ])('tối thiểu %p, đã check-in %p -> đạt = %p', (minimum, checkedIn, met) => {
    expect(charityMinimumParticipantsMet(minimum, checkedIn)).toBe(met);
  });
});
