import { MaxPageSize } from '@chantam/service.common-lib/dto';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { ChatFlagQueueQueryDto } from './admin-config/admin-chat-flag.dto';
import { GetAdminAuditLogsQueryDto } from './admin-config/admin-config.dto';
import { ListAdminUsersQueryDto } from './admin-config/admin-user.dto';
import { GetSystemLogsQueryDto } from './admin-config/system-log.dto';

/**
 * CMS backlog B8: bốn DTO này tự khai `pageSize` tối đa 100, nhưng `toSkipTake` cắt về
 * `MaxPageSize` (50) — gửi 100 nhận 50 dòng mà không lời nào báo. Giờ quá trần là 400.
 */
const pageSizeErrors = (cls: new () => object, pageSize: string) =>
  validateSync(plainToInstance(cls, { pageSize }), {
    skipMissingProperties: true,
  }).filter((error) => error.property === 'pageSize').length;

describe('pageSize của các danh sách Admin khớp trần MaxPageSize', () => {
  it.each([
    ['chat flags', ChatFlagQueueQueryDto],
    ['audit logs', GetAdminAuditLogsQueryDto],
    ['admin users', ListAdminUsersQueryDto],
    ['system logs', GetSystemLogsQueryDto],
  ] as const)('%s: đúng trần nhận, quá trần 400', (_name, cls) => {
    expect(pageSizeErrors(cls, String(MaxPageSize))).toBe(0);
    expect(pageSizeErrors(cls, String(MaxPageSize + 1))).toBe(1);
  });
});
