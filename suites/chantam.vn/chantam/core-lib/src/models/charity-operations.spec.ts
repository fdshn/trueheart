import { CharityCompletionBlockers } from './charity-operations';

describe('điều kiện hoàn tất dự án sau khi bỏ đợt trao', () => {
  it('không còn blocker ROUNDS_UNSETTLED', () => {
    expect(CharityCompletionBlockers as readonly string[]).not.toContain(
      'ROUNDS_UNSETTLED',
    );
  });
});
