import { QueryRunner } from 'typeorm';
import { CreateOnboardingTasks1789900000003 } from './1789900000003-CreateOnboardingTasks';

describe('CreateOnboardingTasks1789900000003', () => {
  it('seeds exactly the required active profile and phone task keys with unique completions', async () => {
    const queries: string[] = [];
    const queryRunner = {
      query: jest.fn(async (query: string) => {
        queries.push(query);
      }),
    } as unknown as QueryRunner;

    await new CreateOnboardingTasks1789900000003().up(queryRunner);

    const seedQuery = queries.find((query) =>
      query.includes('INSERT INTO "onboarding_tasks"'),
    );
    const completionTableQuery = queries.find((query) =>
      query.includes('CREATE TABLE "user_onboarding_task_completions"'),
    );
    const taskKeys = [
      ...(
        seedQuery?.matchAll(
          /40000000-0000-4000-8000-00000000000[12]', '([A-Z_]+)'/g,
        ) ?? []
      ),
    ]
      .map((match) => match[1])
      .sort();
    const completionUnique = completionTableQuery?.includes(
      'UNIQUE ("user_id", "task_id")',
    );
    const evidenceTypeColumn = queries
      .find((query) => query.includes('CREATE TABLE "onboarding_tasks"'))
      ?.includes('"evidence_type" varchar(100) NOT NULL');

    expect(taskKeys).toEqual(['PHONE_VERIFIED', 'PROFILE_COMPLETE']);
    expect(completionUnique).toBe(true);
    expect(evidenceTypeColumn).toBe(true);
  });
});
