import { loadConfig } from './config.loader';

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

    const config = loadConfig();

    expect(config.port).toBe(4000);
    expect(config.env).toBe('production');
    expect(config.database.default).toBe(
      'postgres://user:pass@db:5432/chantam',
    );
    expect(config.geo.jitterRadiusMeters).toBe(500);
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
