import {
  GroupRadiusLadderRanks,
  IGetGroupRadiusPolicyCommand,
  IGetGroupRadiusPolicyResult,
  IGetGroupRadiusPolicyUseCase,
  IGroupRadiusPolicy,
  IPublishGroupRadiusPolicyCommand,
  IPublishGroupRadiusPolicyResult,
  IPublishGroupRadiusPolicyUseCase,
} from '@/application/contracts/admin-config';
import {
  IAdminConfigRepository,
  IEntitlementRepository,
} from '@/domain/ports/repository';
import {
  GroupDefaultRadiusConfigKey,
  GroupMaxRadiusConfigKey,
  GroupMinRadiusConfigKey,
  GroupRadiusColumnBoundsKm,
  groupRadiusConfigKeyForRank,
} from '@chantam.vn/chantam.core-lib/consts';
import {
  ForbiddenException,
  ValidationFailedException,
} from '@chantam/service.common-lib/exception';
import { Inject, Injectable } from '@nestjs/common';

/**
 * Thang bán kính theo bậc, đọc/ghi CẢ THANG một lượt.
 *
 * ## Vì sao cần endpoint riêng khi POST /admin/system-configs đã sửa được
 *
 * Bốn khoá bán kính theo bậc vốn đã là cấu hình động: Admin sửa được từng khoá,
 * có audit, có phiên bản, có copy-on-write. Nhưng sửa TỪNG KHOÁ có ba chỗ hụt mà
 * một endpoint thang lấp được:
 *
 * 1. **Không nguyên tử.** Hạ Kim Cương rồi mới nâng Vàng là có một khoảng thời
 *    gian Vàng rộng hơn Kim Cương, và nhóm nào tạo trong khoảng đó mang bán kính
 *    sai VĨNH VIỄN — bán kính là snapshot (BR-GRP-03).
 * 2. **Không kiểm được ràng buộc giữa các bậc.** "Đơn điệu tăng theo bậc" là bất
 *    biến của cả thang; một lượt ghi thấy đúng một khoá thì không có gì để so.
 *    Bậc cao mà vùng hẹp hơn bậc thấp thì thăng bậc thành hình phạt.
 * 3. **Admin thấy bốn dòng rời rạc** lẫn giữa mười mấy khoá khác, không thấy hình
 *    của cái thang.
 *
 * Endpoint này KHÔNG thay đường cũ — nó nằm trên cùng bốn khoá đó, nên sửa bằng
 * đường nào cũng ra cùng một chỗ.
 */
const ReadPermission = 'config.read';
const WritePermission = 'config.write';
const MetersPerKm = 1000;
const MinReasonLength = 10;

function toMeters(raw: unknown): number | null {
  const value = Number(raw);

  return Number.isFinite(value) && value > 0 ? Math.trunc(value) : null;
}

function columnBounds(): { min: number; max: number } {
  return {
    min: GroupRadiusColumnBoundsKm.min * MetersPerKm,
    max: GroupRadiusColumnBoundsKm.max * MetersPerKm,
  };
}

async function readPolicy(
  configs: IAdminConfigRepository,
  entitlements: IEntitlementRepository,
): Promise<IGroupRadiusPolicy> {
  const [defaultRaw, minRaw, maxRaw, policy] = await Promise.all([
    configs.getConfigValue(GroupDefaultRadiusConfigKey),
    configs.getConfigValue(GroupMinRadiusConfigKey),
    configs.getConfigValue(GroupMaxRadiusConfigKey),
    entitlements.getPolicyRevision(),
  ]);

  const bounds = columnBounds();
  const defaultMeters = toMeters(defaultRaw) ?? bounds.min;

  // `canCreateGroup` trả kèm vì nó quyết định bậc nào CÓ NGHĨA. Hôm nay chỉ Kim
  // Cương tạo được nhóm, nên ba bậc dưới là số chờ sẵn — Admin cần thấy điều đó
  // thay vì tưởng mình vừa đổi vùng của ba bậc đang hoạt động.
  const createGroup = policy.capabilities.find(
    (capability) => capability.code === 'CREATE_GROUP',
  );

  const rungs = await Promise.all(
    GroupRadiusLadderRanks.map(async (rank) => ({
      rank,
      own: toMeters(
        await configs.getConfigValue(groupRadiusConfigKeyForRank(rank)),
      ),
    })),
  );

  return {
    defaultMeters,
    minMeters: toMeters(minRaw) ?? bounds.min,
    maxMeters: toMeters(maxRaw) ?? bounds.max,
    columnBoundsMeters: bounds,
    ladder: rungs.map(({ rank, own }) => ({
      rank,
      meters: own ?? defaultMeters,
      inherited: own === null,
      canCreateGroup:
        (createGroup?.enabled ?? false) &&
        (createGroup?.ranks.find((value) => value.rank === rank)?.allowed ??
          false),
    })),
  };
}

@Injectable()
export class GetGroupRadiusPolicyUseCase implements IGetGroupRadiusPolicyUseCase {
  public constructor(
    @Inject(IAdminConfigRepository)
    private readonly configs: IAdminConfigRepository,
    @Inject(IEntitlementRepository)
    private readonly entitlements: IEntitlementRepository,
  ) {}

  public async handle(
    command: IGetGroupRadiusPolicyCommand,
  ): Promise<IGetGroupRadiusPolicyResult> {
    if (
      !(await this.configs.hasPermission(command.actorUserId, ReadPermission))
    )
      throw new ForbiddenException();

    return { radiusPolicy: await readPolicy(this.configs, this.entitlements) };
  }
}

@Injectable()
export class PublishGroupRadiusPolicyUseCase implements IPublishGroupRadiusPolicyUseCase {
  public constructor(
    @Inject(IAdminConfigRepository)
    private readonly configs: IAdminConfigRepository,
    @Inject(IEntitlementRepository)
    private readonly entitlements: IEntitlementRepository,
  ) {}

  public async handle(
    command: IPublishGroupRadiusPolicyCommand,
  ): Promise<IPublishGroupRadiusPolicyResult> {
    if (
      !(await this.configs.hasPermission(command.actorUserId, WritePermission))
    )
      throw new ForbiddenException();

    const { defaultMeters, ladder, reason } = command.radiusPolicy;
    const bounds = columnBounds();
    const problems: string[] = [];

    const unknown = ladder
      .map((rung) => rung.rank)
      .filter((rank) => !GroupRadiusLadderRanks.includes(rank));
    if (unknown.length > 0)
      problems.push(
        `ladder: bậc không đặt được bán kính riêng: ${unknown.join(', ')} — VIEWER bị chặn ở cổng onboarding trước khi tới bước bán kính`,
      );

    const duplicated = [
      ...new Set(
        ladder
          .filter(
            (rung, index) =>
              ladder.findIndex((other) => other.rank === rung.rank) !== index,
          )
          .map((rung) => rung.rank),
      ),
    ];
    if (duplicated.length > 0)
      problems.push(`ladder: bậc trùng lặp: ${duplicated.join(', ')}`);

    const outOfBounds = [
      ...ladder.map((rung) => rung.meters),
      ...(defaultMeters === undefined ? [] : [defaultMeters]),
    ].find(
      (value) =>
        !Number.isInteger(value) || value < bounds.min || value > bounds.max,
    );
    if (outOfBounds !== undefined)
      problems.push(
        `bán kính phải là số nguyên trong khoảng ${bounds.min}–${bounds.max} m; ${outOfBounds} nằm ngoài cận cứng của cột groups.radius_km`,
      );

    if (!reason || reason.trim().length < MinReasonLength)
      problems.push(
        `reason: cần ít nhất ${MinReasonLength} ký tự — đây là thứ audit log hiển thị`,
      );

    // Đơn điệu tăng — bất biến của CẢ thang, và là lý do chính endpoint này tồn
    // tại. Kiểm trên thang SAU KHI trộn với giá trị đang có, không chỉ trên phần
    // Admin gửi lên: sửa một bậc cũng làm lệch quan hệ với ba bậc kia.
    if (problems.length === 0) {
      const current = await readPolicy(this.configs, this.entitlements);
      const merged = new Map(
        current.ladder.map((rung) => [rung.rank, rung.meters]),
      );
      // Đổi `defaultMeters` kéo theo mọi bậc đang THỪA HƯỞNG nó.
      if (defaultMeters !== undefined)
        for (const rung of current.ladder)
          if (rung.inherited) merged.set(rung.rank, defaultMeters);
      for (const rung of ladder) merged.set(rung.rank, rung.meters);

      const ordered = GroupRadiusLadderRanks.map((rank) => ({
        rank,
        meters: merged.get(rank) ?? 0,
      }));
      const broken = ordered.find(
        (rung, index) => index > 0 && rung.meters < ordered[index - 1].meters,
      );
      if (broken) {
        const lower = ordered[ordered.indexOf(broken) - 1];
        problems.push(
          `ladder: bán kính phải KHÔNG GIẢM theo bậc — ${broken.rank} (${broken.meters} m) hẹp hơn ${lower.rank} (${lower.meters} m), tức thăng bậc thành hình phạt`,
        );
      }
    }

    if (problems.length > 0) throw new ValidationFailedException(problems);

    // Ghi tuần tự qua ĐÚNG đường cũ: mỗi khoá là một bản copy-on-write riêng, nên
    // audit và phiên bản giữ nguyên hình, và sửa bằng endpoint nào cũng ra cùng
    // một chỗ. Không nguyên tử ở tầng database — nhưng phép kiểm đơn điệu đã chạy
    // trên thang ĐÃ TRỘN, nên một lượt ghi dở dang chỉ để lại thang cũ ở vài bậc,
    // không để lại thang nghịch.
    if (defaultMeters !== undefined)
      await this.configs.publishSystemConfig({
        actorUserId: command.actorUserId,
        key: GroupDefaultRadiusConfigKey,
        value: defaultMeters,
        valueType: 'INTEGER',
        reason: reason.trim(),
      });

    // Ghi từ bậc THẤP lên cao: nếu chết giữa chừng thì phần đã ghi vẫn không
    // dựng ra thang nghịch với phần chưa ghi khi thang đi lên.
    for (const rank of GroupRadiusLadderRanks) {
      const rung = ladder.find((entry) => entry.rank === rank);
      if (!rung) continue;
      await this.configs.publishSystemConfig({
        actorUserId: command.actorUserId,
        key: groupRadiusConfigKeyForRank(rank),
        value: rung.meters,
        valueType: 'INTEGER',
        reason: reason.trim(),
      });
    }

    return { radiusPolicy: await readPolicy(this.configs, this.entitlements) };
  }
}
