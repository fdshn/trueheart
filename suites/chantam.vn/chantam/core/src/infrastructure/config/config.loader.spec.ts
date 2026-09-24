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

describe('loadConfig — ô Servers của Swagger', () => {
  const original = { ...process.env };

  beforeEach(() => {
    process.env.DATABASE_URI = 'postgres://user:pass@db:5432/chantam';
    process.env.REDIS_URI = 'redis://cache:6379';
  });

  afterEach(() => {
    process.env = { ...original };
  });

  it('không khai API_SERVERS thì chỉ có localhost', () => {
    process.env.PORT = '3000';
    delete process.env.API_SERVERS;

    expect(loadConfig().docsServers).toEqual([
      { url: 'http://localhost:3000', description: 'Máy đang chạy (local)' },
    ]);
  });

  it('khai API_SERVERS thì KHÔNG chèn localhost vào đầu', () => {
    // Swagger UI lấy mục đầu làm mặc định. Chèn localhost lên đầu trên server
    // thật khiến "Try it out" trỏ vào máy của người đọc, không phải API này.
    process.env.API_SERVERS = 'Staging=https://api-staging.example.com';

    expect(loadConfig().docsServers).toEqual([
      {
        url: 'https://api-staging.example.com',
        description: 'Staging',
      },
    ]);
  });

  it('giữ nguyên thứ tự khai báo', () => {
    process.env.API_SERVERS =
      'Staging=https://staging.example.com,Production=https://api.example.com';

    expect(
      loadConfig().docsServers.map((server) => server.description),
    ).toEqual(['Staging', 'Production']);
  });

  it('chuỗi chỉ toàn dấu phẩy coi như không khai', () => {
    process.env.PORT = '3000';
    process.env.API_SERVERS = ' , , ';

    expect(loadConfig().docsServers).toEqual([
      { url: 'http://localhost:3000', description: 'Máy đang chạy (local)' },
    ]);
  });

  it('sai định dạng thì ném ngay lúc khởi động', () => {
    // Bỏ qua im lặng nghĩa là người ta mở Swagger, không thấy môi trường vừa
    // khai, rồi đi tìm lỗi ở chỗ khác.
    process.env.API_SERVERS = 'Staging';

    expect(() => loadConfig()).toThrow(/API_SERVERS/);
  });

  it('từ chối URL không có scheme', () => {
    process.env.API_SERVERS = 'Staging=api-staging.example.com';

    expect(() => loadConfig()).toThrow(/http/);
  });
});
