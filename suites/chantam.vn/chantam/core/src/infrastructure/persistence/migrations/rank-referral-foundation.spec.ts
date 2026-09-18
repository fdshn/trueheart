import { QueryRunner } from 'typeorm';
import { CreateRankReferralFoundation1790000000000 } from './1790000000000-CreateRankReferralFoundation';

describe('CreateRankReferralFoundation1790000000000', () => {
  it('creates idempotent append-only ledger and immutable referral constraints', async () => {
    const queries: string[] = [];
    const queryRunner = {
      query: jest.fn(async (query: string) => {
        queries.push(query);
      }),
    } as unknown as QueryRunner;

    await new CreateRankReferralFoundation1790000000000().up(queryRunner);

    const sql = queries.join('\n');

    expect(sql).toContain('CREATE TABLE "point_rules"');
    expect(sql).toContain('CREATE TABLE "point_ledger"');
    expect(sql).toContain('CREATE TABLE "user_point_balances"');
    expect(sql).toContain('CREATE TABLE "rank_tiers"');
    expect(sql).toContain('CREATE TABLE "rank_maintenance_cycles"');
    expect(sql).toContain('CREATE TABLE "referrals"');
    expect(sql).toContain('UNIQUE ("idempotency_key")');
    expect(sql).toContain('UNIQUE ("referee_id")');
    expect(sql).toContain('UNIQUE ("user_id", "cycle_start")');
    expect(sql).toContain('prevent_point_ledger_mutation');
    expect(sql).toContain('enforce_referral_qualification_transition');
    expect(sql).toContain('OLD."qualified_at" IS NOT NULL');
    expect(sql).toContain('NEW."referrer_id" IS DISTINCT FROM OLD."referrer_id"');
    expect(sql).toContain('PHONE_VERIFIED_FIRST_TIME');
    expect(sql).toContain('REFERRAL_QUALIFIED');
  });
});
