import {
  ICreateSponsorBannerCommand,
  ICreateSponsorBannerUseCase,
  IDecideSponsorBannerApprovalCommand,
  IDecideSponsorBannerApprovalUseCase,
  IDeleteSponsorBannerCommand,
  IDeleteSponsorBannerResult,
  IDeleteSponsorBannerUseCase,
  IListAdminSponsorBannersCommand,
  IListAdminSponsorBannersUseCase,
  IPublicSponsorBannerDto,
  IRecordBannerClickCommand,
  IRecordBannerClickResult,
  IRecordBannerClickUseCase,
  IServeSponsorBannersCommand,
  IServeSponsorBannersResult,
  IServeSponsorBannersUseCase,
  ISetSponsorBannerActiveCommand,
  ISetSponsorBannerActiveUseCase,
  ISponsorBannerPageResult,
  IUpdateSponsorBannerCommand,
  IUpdateSponsorBannerUseCase,
  IWriteSponsorBannerInput,
} from '@/application/contracts/sponsor-banner';
import {
  SponsorBannerApprovalAlreadyDecidedException,
  SponsorBannerNotFoundException,
  SponsorBannerNotServingException,
} from '@/domain/exceptions';
import {
  IAdminConfigRepository,
  ISponsorBanner,
  ISponsorBannerRepository,
  IWriteSponsorBannerParams,
} from '@/domain/ports/repository';
import {
  BannerPlacement,
  MaxBannerPartnerNameLength,
  MaxBannerTitleLength,
  bannerGaps,
} from '@chantam.vn/chantam.core-lib/models';
import {
  ForbiddenException,
  ValidationFailedException,
} from '@chantam/service.common-lib/exception';
import { Inject, Injectable } from '@nestjs/common';

/**
 * Cặp quyền RIÊNG, không dùng lại `campaign.*`.
 *
 * Duyệt một banner tài trợ là xác nhận với đối tác rằng nội dung của họ chạy đúng khung giờ
 * đã bán, và `impressionCount` là con số đối soát. Đó là một hành vi thương mại, khác việc
 * biên tập bố cục Home. Xem migration `1798600000000`.
 */
const ReadPermission = 'banner.read';
const WritePermission = 'banner.manage';

/** Số banner tối đa một lượt phục vụ. Trần để một `?limit=10000` không kéo cả bảng. */
const MaxServedBanners = 20;

/** Bỏ phần số liệu và liên hệ đối tác trước khi trả ra ngoài. */
function toPublic(banner: ISponsorBanner): IPublicSponsorBannerDto {
  return {
    globalId: banner.globalId,
    title: banner.title,
    imageUrl: banner.imageUrl,
    targetUrl: banner.targetUrl,
    placement: banner.placement,
    displayOrder: banner.displayOrder,
    partnerName: banner.partnerName,
  };
}

/**
 * Đọc và kiểm phần thân chung của một lượt ghi.
 *
 * `partial` phân biệt lượt TẠO với lượt SỬA: lúc tạo thì mọi trường bắt buộc phải có, lúc
 * sửa thì chỉ kiểm những trường người gọi gửi. Gộp hai lối vào một hàm vì bộ luật phải
 * giống nhau — một bản chép thứ hai là một chỗ để đường sửa lỏng hơn đường tạo, và lúc đó
 * một banner hợp lệ sửa một lần thành banner sai.
 */
function prepareWrite(
  input: Partial<IWriteSponsorBannerInput>,
  options: { partial: boolean },
): Partial<IWriteSponsorBannerParams> {
  const changes: Record<string, unknown> = {};

  const partnerName = input.partnerName?.trim();
  const title = input.title?.trim();
  const startsAt =
    input.startsAt === undefined ? undefined : new Date(input.startsAt);
  const endsAt =
    input.endsAt === undefined ? undefined : new Date(input.endsAt);

  if (!options.partial) {
    const gaps = bannerGaps({
      partnerName: partnerName ?? '',
      title: title ?? '',
      placement: input.placement,
      imageUrl: input.imageUrl,
      targetUrl: input.targetUrl,
      startsAt: startsAt ?? new Date(Number.NaN),
      endsAt: endsAt ?? new Date(Number.NaN),
    });
    if (gaps.length > 0) throw new ValidationFailedException(gaps);
  } else {
    // Lượt sửa: kiểm TỪNG trường được gửi, bằng đúng những phép kiểm của `bannerGaps`.
    // Dựng một bản ghi giả rồi gọi `bannerGaps` ở đây sẽ báo lỗi cho các trường KHÔNG gửi.
    const gaps: string[] = [];

    if (partnerName !== undefined) {
      if (partnerName.length === 0) gaps.push('partnerName không được rỗng');
      if (partnerName.length > MaxBannerPartnerNameLength)
        gaps.push(`partnerName không vượt ${MaxBannerPartnerNameLength} ký tự`);
    }
    if (title !== undefined) {
      if (title.length === 0) gaps.push('title không được rỗng');
      if (title.length > MaxBannerTitleLength)
        gaps.push(`title không vượt ${MaxBannerTitleLength} ký tự`);
    }
    if (startsAt !== undefined && !Number.isFinite(startsAt.getTime()))
      gaps.push('startsAt không phải thời điểm hợp lệ');
    if (endsAt !== undefined && !Number.isFinite(endsAt.getTime()))
      gaps.push('endsAt không phải thời điểm hợp lệ');
    // Chỉ so được khi CẢ HAI mốc cùng gửi. Gửi một mốc lẻ thì ràng buộc
    // `CHK_sponsor_banners_window` là lớp chặn — và nó phải là lớp chặn, vì mốc kia nằm
    // trong database chứ không trong request.
    if (
      startsAt !== undefined &&
      endsAt !== undefined &&
      Number.isFinite(startsAt.getTime()) &&
      Number.isFinite(endsAt.getTime()) &&
      endsAt.getTime() <= startsAt.getTime()
    )
      gaps.push('endsAt phải sau startsAt');

    if (gaps.length > 0) throw new ValidationFailedException(gaps);
  }

  if (partnerName !== undefined) changes.partnerName = partnerName;
  if (input.partnerContact !== undefined)
    changes.partnerContact = input.partnerContact.trim() || null;
  if (title !== undefined) changes.title = title;
  if (input.imageUrl !== undefined) changes.imageUrl = input.imageUrl;
  if (input.targetUrl !== undefined) changes.targetUrl = input.targetUrl;
  if (input.placement !== undefined)
    changes.placement = input.placement as BannerPlacement;
  if (input.displayOrder !== undefined)
    changes.displayOrder = input.displayOrder;
  if (startsAt !== undefined) changes.startsAt = startsAt;
  if (endsAt !== undefined) changes.endsAt = endsAt;

  return changes as Partial<IWriteSponsorBannerParams>;
}

@Injectable()
export class CreateSponsorBannerUseCase implements ICreateSponsorBannerUseCase {
  public constructor(
    @Inject(ISponsorBannerRepository)
    private readonly repository: ISponsorBannerRepository,
    @Inject(IAdminConfigRepository)
    private readonly admin: IAdminConfigRepository,
  ) {}

  public async handle(
    command: ICreateSponsorBannerCommand,
  ): Promise<ISponsorBanner> {
    if (!(await this.admin.hasPermission(command.actorUserId, WritePermission)))
      throw new ForbiddenException();

    const prepared = prepareWrite(command, { partial: false });

    // UC-POST-04: Phase 1 banner CHỈ do Admin tạo từ CMS, nên người tạo cũng là người
    // duyệt và banner vào thẳng `APPROVED`. Giữ nguyên máy trạng thái ba bước thay vì bỏ
    // nó đi: khi nào mở cho đối tác tự gửi hồ sơ thì chỉ phải đổi hai dòng dưới đây, không
    // phải thêm một cột và một luồng duyệt.
    return this.repository.create({
      ...(prepared as IWriteSponsorBannerParams),
      displayOrder: prepared.displayOrder ?? 1,
      partnerContact: prepared.partnerContact ?? null,
      createdBy: command.actorUserId,
      approvalStatus: 'APPROVED',
      approvedBy: command.actorUserId,
    });
  }
}

@Injectable()
export class UpdateSponsorBannerUseCase implements IUpdateSponsorBannerUseCase {
  public constructor(
    @Inject(ISponsorBannerRepository)
    private readonly repository: ISponsorBannerRepository,
    @Inject(IAdminConfigRepository)
    private readonly admin: IAdminConfigRepository,
  ) {}

  public async handle(
    command: IUpdateSponsorBannerCommand,
  ): Promise<ISponsorBanner> {
    if (!(await this.admin.hasPermission(command.actorUserId, WritePermission)))
      throw new ForbiddenException();

    const updated = await this.repository.update({
      bannerId: command.bannerId,
      changes: prepareWrite(command, { partial: true }),
    });
    if (!updated) throw new SponsorBannerNotFoundException();

    return updated;
  }
}

@Injectable()
export class ListAdminSponsorBannersUseCase implements IListAdminSponsorBannersUseCase {
  public constructor(
    @Inject(ISponsorBannerRepository)
    private readonly repository: ISponsorBannerRepository,
    @Inject(IAdminConfigRepository)
    private readonly admin: IAdminConfigRepository,
  ) {}

  public async handle(
    command: IListAdminSponsorBannersCommand,
  ): Promise<ISponsorBannerPageResult> {
    if (!(await this.admin.hasPermission(command.actorUserId, ReadPermission)))
      throw new ForbiddenException();

    return this.repository.listForAdmin({
      limit: command.limit,
      offset: command.offset,
      placement: command.placement,
      approvalStatus: command.approvalStatus,
    });
  }
}

@Injectable()
export class DecideSponsorBannerApprovalUseCase implements IDecideSponsorBannerApprovalUseCase {
  public constructor(
    @Inject(ISponsorBannerRepository)
    private readonly repository: ISponsorBannerRepository,
    @Inject(IAdminConfigRepository)
    private readonly admin: IAdminConfigRepository,
  ) {}

  public async handle(
    command: IDecideSponsorBannerApprovalCommand,
  ): Promise<ISponsorBanner> {
    if (!(await this.admin.hasPermission(command.actorUserId, WritePermission)))
      throw new ForbiddenException();

    if (!(await this.repository.findByGlobalId(command.bannerId)))
      throw new SponsorBannerNotFoundException();

    const decided = await this.repository.decideApproval({
      bannerId: command.bannerId,
      approverId: command.actorUserId,
      approve: command.approve,
      note: command.note?.trim() || null,
    });
    // Banner tồn tại nhưng `UPDATE` không khớp hàng nào nghĩa là nó không còn
    // `PENDING_APPROVAL` — một Admin khác đã xử lý.
    if (!decided) throw new SponsorBannerApprovalAlreadyDecidedException();

    return decided;
  }
}

@Injectable()
export class SetSponsorBannerActiveUseCase implements ISetSponsorBannerActiveUseCase {
  public constructor(
    @Inject(ISponsorBannerRepository)
    private readonly repository: ISponsorBannerRepository,
    @Inject(IAdminConfigRepository)
    private readonly admin: IAdminConfigRepository,
  ) {}

  public async handle(
    command: ISetSponsorBannerActiveCommand,
  ): Promise<ISponsorBanner> {
    if (!(await this.admin.hasPermission(command.actorUserId, WritePermission)))
      throw new ForbiddenException();

    const updated = await this.repository.setActive({
      bannerId: command.bannerId,
      isActive: command.isActive,
    });
    if (!updated) throw new SponsorBannerNotFoundException();

    return updated;
  }
}

@Injectable()
export class DeleteSponsorBannerUseCase implements IDeleteSponsorBannerUseCase {
  public constructor(
    @Inject(ISponsorBannerRepository)
    private readonly repository: ISponsorBannerRepository,
    @Inject(IAdminConfigRepository)
    private readonly admin: IAdminConfigRepository,
  ) {}

  public async handle(
    command: IDeleteSponsorBannerCommand,
  ): Promise<IDeleteSponsorBannerResult> {
    if (!(await this.admin.hasPermission(command.actorUserId, WritePermission)))
      throw new ForbiddenException();

    if (!(await this.repository.softDelete(command.bannerId)))
      throw new SponsorBannerNotFoundException();

    return { deleted: true };
  }
}

@Injectable()
export class ServeSponsorBannersUseCase implements IServeSponsorBannersUseCase {
  public constructor(
    @Inject(ISponsorBannerRepository)
    private readonly repository: ISponsorBannerRepository,
  ) {}

  public async handle(
    command: IServeSponsorBannersCommand,
  ): Promise<IServeSponsorBannersResult> {
    const banners = await this.repository.findServing({
      placement: command.placement,
      limit: Math.min(command.limit, MaxServedBanners),
    });

    // Đếm lượt hiển thị SAU khi đã có danh sách, và một câu cho cả dải.
    //
    // Lỗi đếm KHÔNG được làm hỏng lượt đọc: banner không hiện vì hụt một con số thống kê là
    // đổi một sự cố nhỏ thành một khoảng trống trên trang chủ. Vẫn `await` để lỗi không
    // thành unhandled rejection.
    try {
      await this.repository.recordImpressions(
        banners.map((banner) => banner.globalId),
      );
    } catch {
      // Cố ý nuốt. Xem docblock ngay trên.
    }

    return { banners: banners.map(toPublic) };
  }
}

@Injectable()
export class RecordBannerClickUseCase implements IRecordBannerClickUseCase {
  public constructor(
    @Inject(ISponsorBannerRepository)
    private readonly repository: ISponsorBannerRepository,
  ) {}

  public async handle(
    command: IRecordBannerClickCommand,
  ): Promise<IRecordBannerClickResult> {
    const banner = await this.repository.findByGlobalId(command.bannerId);
    if (!banner) throw new SponsorBannerNotFoundException();

    // Khác lượt hiển thị: lỗi ở đây KHÔNG nuốt. Một lượt bấm là hành động có chủ ý của
    // người dùng và là con số đối soát trực tiếp với đối tác — mất nó là mất doanh thu đã
    // phát sinh, nên người gọi phải biết.
    if (!(await this.repository.recordClick(command.bannerId)))
      throw new SponsorBannerNotServingException();

    return { targetUrl: banner.targetUrl };
  }
}
