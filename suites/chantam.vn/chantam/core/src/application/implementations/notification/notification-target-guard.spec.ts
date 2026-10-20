import {
  NotificationTargetsByType,
  NotificationTargetTypes,
  NotificationTypes,
} from '@chantam.vn/chantam.core-lib/consts';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Mọi nơi gửi thông báo phải mang đích hợp lệ cho đúng loại của nó.
 *
 * ## Vì sao cần một phép kiểm cơ học
 *
 * `DispatchNotificationUseCase` tự lấy đích từ `reference` khi reference là một màn,
 * và BỎ đích sai cặp (để không mở nhầm màn). Hai lối an toàn đó cũng chính là hai
 * cách hỏng im lặng: quên truyền `target` cho một reference CON (yêu cầu xin đồ, lượt
 * đóng góp) hay khai nhầm loại, thì thông báo vẫn ghi, chỉ là bấm vào không đi đâu.
 * Unit test của từng notifier không thấy — chúng không biết hợp đồng mobile.
 *
 * Phép kiểm đọc từng lời gọi `type: NotificationTypes.X` trong `src` và đối chiếu với
 * `NotificationTargetsByType[X]`.
 */
const ImplementationRoot = join(__dirname, '..');

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return name.endsWith('.ts') && !name.endsWith('.spec.ts') ? [path] : [];
  });
}

interface IDispatchSite {
  where: string;
  type: NotificationTypes;
  referenceType: string | null;
  /** Loại đích ghi tường minh; `'DYNAMIC'` khi `target` là một biến tính lúc chạy. */
  target: NotificationTargetTypes | 'NULL' | 'DYNAMIC' | null;
}

function dispatchSites(): IDispatchSite[] {
  const sites: IDispatchSite[] = [];
  for (const file of sourceFiles(ImplementationRoot)) {
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, index) => {
      if (!/(^|[^\w])type:/.test(line)) return;

      // Giá trị của `type:` có thể là một biểu thức ba ngôi trải nhiều dòng
      // (`type: isReply ? A : B`) — đọc tới dấu phẩy kết thúc thuộc tính, rồi lấy
      // MỌI loại xuất hiện trong đó.
      const indent = line.search(/\S/);
      let valueEnd = index;
      while (
        valueEnd < lines.length - 1 &&
        !(
          lines[valueEnd].trimEnd().endsWith(',') &&
          (valueEnd === index || lines[valueEnd].search(/\S/) > indent)
        )
      )
        valueEnd += 1;
      const value = lines.slice(index, valueEnd + 1).join('\n');
      const types = [...value.matchAll(/NotificationTypes\.(\w+)/g)].map(
        (found) => found[1] as NotificationTypes,
      );
      if (types.length === 0) return;

      // Đối tượng lệnh kết thúc ở dòng đóng ngoặc đầu tiên thụt ÍT hơn dòng `type:`.
      const end = lines.findIndex(
        (candidate, at) =>
          at > valueEnd &&
          candidate.trim().length > 0 &&
          candidate.search(/\S/) < indent,
      );
      const block = lines.slice(index, end === -1 ? undefined : end).join('\n');

      const reference = /referenceType: '([A-Z_]+)'/.exec(block)?.[1] ?? null;
      const explicit = /target: \{ type: NotificationTargetTypes\.(\w+)/.exec(
        block,
      )?.[1];
      const target = explicit
        ? (explicit as NotificationTargetTypes)
        : /\btarget: null\b/.test(block)
          ? 'NULL'
          : /\btarget[,:]/.test(block)
            ? 'DYNAMIC'
            : null;

      for (const type of types)
        sites.push({
          where: `${relative(ImplementationRoot, file)}:${index + 1}`,
          type,
          referenceType: reference,
          target,
        });
    });
  }
  return sites;
}

describe('Đích điều hướng ở mọi nơi gửi thông báo', () => {
  const sites = dispatchSites();

  it('quét được nơi gửi (không phải regex trượt hết)', () => {
    expect(sites.length).toBeGreaterThan(30);
  });

  it('mọi loại thông báo trong enum đều có ít nhất một nơi gửi được quét', () => {
    // SYSTEM_BROADCAST đi qua `notificationType:` của lượt gửi hàng loạt.
    const seen = new Set(sites.map((site) => site.type));
    const missing = Object.values(NotificationTypes).filter(
      (type) => !seen.has(type) && type !== NotificationTypes.SYSTEM_BROADCAST,
    );
    expect(missing).toEqual([]);
  });

  it('đích ghi tường minh phải hợp lệ cho đúng loại thông báo', () => {
    const wrong = sites
      .filter(
        (site) =>
          site.target !== null &&
          site.target !== 'NULL' &&
          site.target !== 'DYNAMIC' &&
          !NotificationTargetsByType[site.type].includes(site.target),
      )
      .map((site) => `${site.where} ${site.type} → ${String(site.target)}`);
    expect(wrong).toEqual([]);
  });

  it('không ghi đích thì reference phải tự là một đích hợp lệ — không để mobile đoán', () => {
    const unresolved = sites
      .filter((site) => site.target === null)
      .filter((site) => NotificationTargetsByType[site.type].length > 0)
      .filter(
        (site) =>
          site.referenceType === null ||
          !NotificationTargetsByType[site.type].includes(
            site.referenceType as NotificationTargetTypes,
          ),
      )
      .map(
        (site) =>
          `${site.where} ${site.type} (reference ${String(site.referenceType)})`,
      );
    expect(unresolved).toEqual([]);
  });
});
