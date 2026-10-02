import {
  ICreateHomeCampaignCommand,
  ICreateHomeCampaignUseCase,
  IGetHomeCampaignCommand,
  IGetHomeCampaignUseCase,
  IGetHomeLayoutResult,
  IGetHomeLayoutUseCase,
  IHomeCampaignMutationResult,
  IHomeCampaignView,
  IHomeCampaignWriteInput,
  IListHomeCampaignsCommand,
  IListHomeCampaignsResult,
  IListHomeCampaignsUseCase,
  IUpdateHomeCampaignCommand,
  IUpdateHomeCampaignUseCase,
} from '@/application/contracts/home-campaign';
import { HomeCampaignNotFoundException } from '@/domain/exceptions';
import { IHomeLayoutCache } from '@/domain/ports/cache';
import {
  IAdminConfigRepository,
  IHomeCampaignRecord,
  IHomeCampaignRepository,
  IHomeCampaignWriteParams,
} from '@/domain/ports/repository';
import {
  DefaultHomeLayout,
  homeCampaignGaps,
  normalizeHomeBanners,
  normalizeHomeFloatingBanner,
  normalizeHomePopup,
  normalizeHomeSections,
  normalizeHomeTheme,
} from '@chantam.vn/chantam.core-lib/models';
import {
  ForbiddenException,
  ValidationFailedException,
} from '@chantam/service.common-lib/exception';
import { Inject, Injectable } from '@nestjs/common';

function toView(record: IHomeCampaignRecord): IHomeCampaignView {
  return {
    id: record.globalId,
    campaignName: record.campaignName,
    theme: record.theme,
    marqueeText: record.marqueeText,
    banners: record.banners,
    sectionsLayout: record.sectionsLayout,
    popup: record.popup,
    floatingBanner: record.floatingBanner,
    startTime: record.startTime,
    endTime: record.endTime,
    isActive: record.isActive,
    isLive: record.isLive,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

/**
 * Chuẩn hoá đầu vào rồi kiểm — theo đúng thứ tự đó.
 *
 * Chuẩn hoá TRƯỚC khi kiểm là chỗ quan trọng: `homeCampaignGaps` hỏi "có khối nào đang
 * bật không", mà một khối `type` lạ bị `normalizeHomeSections` loại bỏ. Kiểm trên dữ liệu
 * thô sẽ thấy "có khối" rồi lưu một cấu hình mà khối đó không bao giờ tới được client.
 */
function prepare(
  input: IHomeCampaignWriteInput,
  actorUserId: string,
): IHomeCampaignWriteParams {
  const prepared = {
    actorUserId,
    campaignName: input.campaignName.trim(),
    theme: normalizeHomeTheme(input.theme),
    marqueeText: input.marqueeText?.trim() || null,
    banners: normalizeHomeBanners(input.banners),
    sectionsLayout: normalizeHomeSections(input.sectionsLayout),
    popup: normalizeHomePopup(input.popup),
    floatingBanner: normalizeHomeFloatingBanner(input.floatingBanner),
    startTime: input.startTime,
    endTime: input.endTime,
    isActive: input.isActive,
  };

  const gaps = homeCampaignGaps(prepared);
  if (gaps.length > 0) throw new ValidationFailedException(gaps);

  return prepared;
}

@Injectable()
export class ListHomeCampaignsUseCase implements IListHomeCampaignsUseCase {
  public constructor(
    @Inject(IHomeCampaignRepository)
    private readonly repository: IHomeCampaignRepository,
    @Inject(IAdminConfigRepository)
    private readonly admin: IAdminConfigRepository,
  ) {}

  public async handle(
    command: IListHomeCampaignsCommand,
  ): Promise<IListHomeCampaignsResult> {
    if (!(await this.admin.hasPermission(command.actorUserId, 'campaign.read')))
      throw new ForbiddenException();

    const page = await this.repository.listCampaigns({
      limit: command.limit,
      offset: command.offset,
    });

    return { items: page.items.map(toView), total: page.total };
  }
}

@Injectable()
export class GetHomeCampaignUseCase implements IGetHomeCampaignUseCase {
  public constructor(
    @Inject(IHomeCampaignRepository)
    private readonly repository: IHomeCampaignRepository,
    @Inject(IAdminConfigRepository)
    private readonly admin: IAdminConfigRepository,
  ) {}

  public async handle(
    command: IGetHomeCampaignCommand,
  ): Promise<IHomeCampaignView> {
    if (!(await this.admin.hasPermission(command.actorUserId, 'campaign.read')))
      throw new ForbiddenException();

    const record = await this.repository.findByGlobalId(command.campaignId);
    if (!record) throw new HomeCampaignNotFoundException();

    return toView(record);
  }
}

@Injectable()
export class CreateHomeCampaignUseCase implements ICreateHomeCampaignUseCase {
  public constructor(
    @Inject(IHomeCampaignRepository)
    private readonly repository: IHomeCampaignRepository,
    @Inject(IHomeLayoutCache) private readonly cache: IHomeLayoutCache,
    @Inject(IAdminConfigRepository)
    private readonly admin: IAdminConfigRepository,
  ) {}

  public async handle(
    command: ICreateHomeCampaignCommand,
  ): Promise<IHomeCampaignMutationResult> {
    if (
      !(await this.admin.hasPermission(command.actorUserId, 'campaign.manage'))
    )
      throw new ForbiddenException();

    const record = await this.repository.createCampaign(
      prepare(command, command.actorUserId),
    );

    // Xoá đệm SAU khi ghi thành công, không trước: xoá trước rồi ghi lỗi nghĩa là
    // vừa mất đệm vừa không đổi được gì.
    const cacheInvalidated = await this.cache.invalidate();

    return { campaign: toView(record), cacheInvalidated };
  }
}

@Injectable()
export class UpdateHomeCampaignUseCase implements IUpdateHomeCampaignUseCase {
  public constructor(
    @Inject(IHomeCampaignRepository)
    private readonly repository: IHomeCampaignRepository,
    @Inject(IHomeLayoutCache) private readonly cache: IHomeLayoutCache,
    @Inject(IAdminConfigRepository)
    private readonly admin: IAdminConfigRepository,
  ) {}

  public async handle(
    command: IUpdateHomeCampaignCommand,
  ): Promise<IHomeCampaignMutationResult> {
    if (
      !(await this.admin.hasPermission(command.actorUserId, 'campaign.manage'))
    )
      throw new ForbiddenException();

    // Hỏi trước để trả 404 thay vì để `updateCampaign` trả về 0 dòng rồi nổ ở
    // `toRecord(rows[0])` với một TypeError không nói lên gì.
    const existing = await this.repository.findByGlobalId(command.campaignId);
    if (!existing) throw new HomeCampaignNotFoundException();

    const record = await this.repository.updateCampaign({
      ...prepare(command, command.actorUserId),
      globalId: command.campaignId,
    });

    const cacheInvalidated = await this.cache.invalidate();

    return { campaign: toView(record), cacheInvalidated };
  }
}

/**
 * Bố cục Home cho app (UC-ADM-03 bước 6, §7.2.6).
 *
 * Ba tầng, theo thứ tự: đệm Redis → database → `DefaultHomeLayout`.
 *
 * Tầng thứ ba là BR_CAMP_02 và nó không được bỏ: giữa hai chiến dịch là phần lớn thời gian
 * của năm, trả `null` hay 404 ở đó nghĩa là app không có gì vẽ ở màn hình đầu tiên.
 *
 * Bố cục mặc định cũng được **ghi vào đệm**. Thoạt nhìn là đệm một thứ có sẵn trong mã
 * nguồn, nhưng cái đệm ở đây là KẾT LUẬN "hiện không có chiến dịch nào" — không đệm thì
 * mọi lượt mở app trong cả tháng không có chiến dịch đều phải đi một truy vấn.
 */
@Injectable()
export class GetHomeLayoutUseCase implements IGetHomeLayoutUseCase {
  public constructor(
    @Inject(IHomeCampaignRepository)
    private readonly repository: IHomeCampaignRepository,
    @Inject(IHomeLayoutCache) private readonly cache: IHomeLayoutCache,
  ) {}

  public async handle(): Promise<IGetHomeLayoutResult> {
    const cached = await this.cache.read();
    if (cached) return { layout: cached, fromCache: true };

    const layout =
      (await this.repository.findActiveLayout()) ?? DefaultHomeLayout;
    await this.cache.write(layout);

    return { layout, fromCache: false };
  }
}
