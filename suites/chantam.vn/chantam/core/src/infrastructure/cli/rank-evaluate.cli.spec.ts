jest.mock('../config/config.module', () => ({
  ConfigModule: class ConfigModule {},
}));

import { runRankEvaluation } from './rank-evaluate.cli';
import { RankEvaluationCliModule } from './rank-evaluation-cli.module';

describe('runRankEvaluation', () => {
  it('creates an application context, invokes the evaluator once, and closes without an HTTP listener', async () => {
    const evaluate = {
      handle: jest.fn().mockResolvedValue({ processedCycles: 4 }),
    };
    const app = {
      get: jest.fn().mockReturnValue(evaluate),
      close: jest.fn().mockResolvedValue(undefined),
      listen: jest.fn(),
    };
    const createApplicationContext = jest.fn().mockResolvedValue(app);

    await expect(
      runRankEvaluation(createApplicationContext as never, {}),
    ).resolves.toEqual({
      processedCycles: 4,
    });

    expect(evaluate.handle).toHaveBeenCalledWith({});
    expect(app.close).toHaveBeenCalledTimes(1);
    expect(app.listen).not.toHaveBeenCalled();
  });

  it('uses the dedicated CLI module rather than the HTTP application module', async () => {
    const evaluate = {
      handle: jest.fn().mockResolvedValue({ processedCycles: 0 }),
    };
    const app = {
      get: jest.fn().mockReturnValue(evaluate),
      close: jest.fn().mockResolvedValue(undefined),
    };
    const createApplicationContext = jest.fn().mockResolvedValue(app);

    await runRankEvaluation(createApplicationContext as never);

    expect(createApplicationContext).toHaveBeenCalledWith(
      RankEvaluationCliModule,
    );
  });
});
