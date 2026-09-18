import { loadConfig } from './config.loader';
import { ConfigSchema } from './config.schema';

describe('loadConfig', () => {
  const original = { ...process.env };

  afterEach(() => {
    process.env = { ...original };
  });

  it('đọc đúng giá trị từ biến môi trường', () => {
    process.env.PORT = '4000';
    process.env.NODE_ENV = 'production';
    process.env.DATABASE_URI = 'postgres://user:pass@db:5432/chantam';
    process.env.REDIS_URI = 'redis://cache:6379';
    process.env.GEO_JITTER_RADIUS_METERS = '500';
    process.env.OTP_EMAIL_FROM_ADDRESS = 'otp@chantam.vn';
    process.env.OTP_EMAIL_FROM_NAME = 'Chân Tâm OTP';
    process.env.POST_OPERATOR_USERNAMES = 'Demo-Operator, second-operator, ';
    process.env.RANK_OPERATOR_USERNAMES = 'Rank-Operator, second-rank-operator, ';

    const config = loadConfig();

    expect(config.port).toBe(4000);
    expect(config.env).toBe('production');
    expect(config.database.default).toBe(
      'postgres://user:pass@db:5432/chantam',
    );
    expect(config.geo.jitterRadiusMeters).toBe(500);
    expect(config.otpEmail).toEqual({
      fromAddress: 'otp@chantam.vn',
      fromName: 'Chân Tâm OTP',
    });
    expect(config.postOperator.usernames).toEqual([
      'demo-operator',
      'second-operator',
    ]);
    expect(config.rankOperator.usernames).toEqual([
      'rank-operator',
      'second-rank-operator',
    ]);
  });

  it('email From trống vẫn là config hợp lệ, không tự bật delivery', () => {
    delete process.env.OTP_EMAIL_FROM_ADDRESS;
    delete process.env.OTP_EMAIL_FROM_NAME;

    expect(loadConfig().otpEmail).toEqual({
      fromAddress: '',
      fromName: 'Chân Tâm',
    });
  });

  it('schema từ chối email From sai định dạng', () => {
    const { error } = ConfigSchema.validate({
      DATABASE_URI: 'postgres://user:pass@db:5432/chantam',
      REDIS_URI: 'redis://cache:6379',
      JWT_SECRET: '01234567890123456789012345678901',
      OTP_EMAIL_FROM_ADDRESS: 'khong-phai-email',
    });

    expect(error).toBeDefined();
  });

  it('quy về development khi NODE_ENV không hợp lệ', () => {
    process.env.NODE_ENV = 'khong-ton-tai';
    expect(loadConfig().env).toBe('development');
  });

  it('dùng bán kính làm nhiễu mặc định 300m khi không khai báo', () => {
    delete process.env.GEO_JITTER_RADIUS_METERS;
    expect(loadConfig().geo.jitterRadiusMeters).toBe(300);
  });
});
