import { IPointLedgerRepository } from '@/domain/ports/repository';
import { CallHandler, ExecutionContext } from '@nestjs/common';
import { lastValueFrom, Observable, of, throwError } from 'rxjs';
import { notePointAward } from '../../points/point-award-context';
import {
  PointsAwardedHeaders,
  PointsAwardedInterceptor,
} from './points-awarded.interceptor';

function makeContext(user: { userId: string } | undefined) {
  const headers: Record<string, string> = {};
  const reply = {
    header: jest.fn((name: string, value: string) => {
      headers[name] = value;
      return reply;
    }),
  };
  const context = {
    getType: () => 'http',
    switchToHttp: () => ({
      getRequest: () => ({ user }),
      getResponse: () => reply,
    }),
  } as unknown as ExecutionContext;
  return { context, headers, reply };
}

function makeLedger(rows: { ruleCode: string; delta: number }[]) {
  return {
    findCommittedAwards: jest.fn().mockResolvedValue(rows),
  } as unknown as jest.Mocked<IPointLedgerRepository>;
}

/** Handler giả: ghi sổ (qua `notePointAward`) rồi trả body, như một use case thật. */
function handlerThatAwards(
  awards: { userId: string; entryId: number; delta: number }[],
): CallHandler {
  return {
    handle: () =>
      new Observable((subscriber) => {
        void (async () => {
          await Promise.resolve();
          for (const award of awards) notePointAward(award);
          subscriber.next({ ok: true });
          subscriber.complete();
        })();
      }),
  };
}

describe('PointsAwardedInterceptor', () => {
  it('cộng điểm cho người gọi → X-Points-Awarded và X-Points-Message (percent-encode)', async () => {
    const ledger = makeLedger([{ ruleCode: 'GIFT_COMPLETED_GIVER', delta: 5 }]);
    const { context, headers } = makeContext({ userId: 'me' });

    const body = await lastValueFrom(
      new PointsAwardedInterceptor(ledger).intercept(
        context,
        handlerThatAwards([{ userId: 'me', entryId: 41, delta: 5 }]),
      ),
    );

    expect(body).toEqual({ ok: true });
    expect(ledger.findCommittedAwards).toHaveBeenCalledWith('me', [41]);
    expect(headers[PointsAwardedHeaders.awarded]).toBe('5');
    expect(decodeURIComponent(headers[PointsAwardedHeaders.message])).toBe(
      'Tặng quà thành công',
    );
    // Giá trị header phải là ASCII thuần: Node ném ERR_INVALID_CHAR với ký tự ngoài
    // Latin-1, và một request cộng điểm thành công sẽ ra 500.
    expect(headers[PointsAwardedHeaders.message]).toMatch(/^[\x20-\x7e]+$/);
    expect(headers['Access-Control-Expose-Headers']).toBe(
      'X-Points-Awarded, X-Points-Message',
    );
  });

  it('nhiều khoản trong một request: cộng tổng, ghép tiêu đề không lặp', async () => {
    const ledger = makeLedger([
      { ruleCode: 'CHECK_IN_DAILY', delta: 2 },
      { ruleCode: 'CHECK_IN_STREAK_MILESTONE', delta: 10 },
      { ruleCode: 'CHECK_IN_DAILY', delta: 2 },
    ]);
    const { context, headers } = makeContext({ userId: 'me' });

    await lastValueFrom(
      new PointsAwardedInterceptor(ledger).intercept(
        context,
        handlerThatAwards([
          { userId: 'me', entryId: 1, delta: 2 },
          { userId: 'me', entryId: 2, delta: 10 },
          { userId: 'me', entryId: 3, delta: 2 },
        ]),
      ),
    );

    expect(headers[PointsAwardedHeaders.awarded]).toBe('14');
    expect(decodeURIComponent(headers[PointsAwardedHeaders.message])).toBe(
      'Điểm danh hằng ngày; Thưởng mốc điểm danh liên tiếp',
    );
  });

  it('không cộng điểm nào → không có header, không hỏi database', async () => {
    const ledger = makeLedger([]);
    const { context, reply } = makeContext({ userId: 'me' });

    await lastValueFrom(
      new PointsAwardedInterceptor(ledger).intercept(
        context,
        handlerThatAwards([]),
      ),
    );

    expect(ledger.findCommittedAwards).not.toHaveBeenCalled();
    expect(reply.header).not.toHaveBeenCalled();
  });

  it('bút toán đã ghi nhưng bị rollback (database không còn) → không có header', async () => {
    const ledger = makeLedger([]);
    const { context, reply } = makeContext({ userId: 'me' });

    await lastValueFrom(
      new PointsAwardedInterceptor(ledger).intercept(
        context,
        handlerThatAwards([{ userId: 'me', entryId: 9, delta: 5 }]),
      ),
    );

    expect(ledger.findCommittedAwards).toHaveBeenCalledWith('me', [9]);
    expect(reply.header).not.toHaveBeenCalled();
  });

  it('request không đăng nhập → đi thẳng, không mở scope', async () => {
    const ledger = makeLedger([]);
    const { context, reply } = makeContext(undefined);

    await lastValueFrom(
      new PointsAwardedInterceptor(ledger).intercept(context, {
        handle: () => of({ ok: true }),
      }),
    );

    expect(reply.header).not.toHaveBeenCalled();
  });

  it('handler lỗi → lỗi đi nguyên ra, không đụng header', async () => {
    const ledger = makeLedger([]);
    const { context, reply } = makeContext({ userId: 'me' });

    await expect(
      lastValueFrom(
        new PointsAwardedInterceptor(ledger).intercept(context, {
          handle: () => throwError(() => new Error('boom')),
        }),
      ),
    ).rejects.toThrow('boom');
    expect(reply.header).not.toHaveBeenCalled();
  });

  it('đọc lại sổ điểm hỏng → response vẫn trả, chỉ thiếu header', async () => {
    const ledger = {
      findCommittedAwards: jest.fn().mockRejectedValue(new Error('db down')),
    } as unknown as jest.Mocked<IPointLedgerRepository>;
    const { context, reply } = makeContext({ userId: 'me' });

    const body = await lastValueFrom(
      new PointsAwardedInterceptor(ledger).intercept(
        context,
        handlerThatAwards([{ userId: 'me', entryId: 1, delta: 5 }]),
      ),
    );

    expect(body).toEqual({ ok: true });
    expect(reply.header).not.toHaveBeenCalled();
  });
});
