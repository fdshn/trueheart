import {
  ICompleteMeritDeclarationCommand,
  ICompleteMeritDeclarationUseCase,
  ICreateMeritUnitCommand,
  ICreateMeritUnitUseCase,
  IDeclareMeritCommand,
  IDeclareMeritResult,
  IDeclareMeritUseCase,
  IDeleteMeritUnitCommand,
  IDeleteMeritUnitResult,
  IDeleteMeritUnitUseCase,
  IGetMeritUnitCommand,
  IGetMeritUnitResult,
  IGetMeritUnitUseCase,
  IListAdminMeritUnitsCommand,
  IListAdminMeritUnitsUseCase,
  IListOwnMeritDeclarationsCommand,
  IListOwnMeritDeclarationsResult,
  IListOwnMeritDeclarationsUseCase,
  IListPublicMeritUnitsCommand,
  IListPublicMeritUnitsUseCase,
  IMeritUnitPageResult,
  IMeritUnitView,
  ISetMeritUnitActiveCommand,
  ISetMeritUnitActiveUseCase,
  IUpdateMeritUnitCommand,
  IUpdateMeritUnitUseCase,
  IWriteMeritUnitInput,
} from '@/application/contracts/merit';
import {
  MeritDeclarationAlreadyCompletedException,
  MeritUnitNotFoundException,
} from '@/domain/exceptions';
import {
  IAdminConfigRepository,
  IMeritDeclaration,
  IMeritRepository,
  IMeritUnit,
  IWriteMeritUnitParams,
} from '@/domain/ports/repository';
import {
  MaxMeritNoteLength,
  MeritDeclarationStatus,
  MeritUnitType,
  buildVietQrUrl,
  meritDeclarationGaps,
  meritUnitGaps,
  normalizeCharitySlug,
  slugifyCharityTitle,
} from '@chantam.vn/chantam.core-lib/models';
import {
  ForbiddenException,
  ValidationFailedException,
} from '@chantam/service.common-lib/exception';
import { Inject, Injectable } from '@nestjs/common';

/**
 * Cặp quyền RIÊNG, và `merit.manage` là quyền nhạy nhất trong Admin CMS.
 *
 * Đơn vị Công đức mang **số tài khoản ngân hàng**. Sửa được nó là chuyển dòng tiền công đức
 * sang tài khoản khác, và người dùng không có cách nào biết — họ quét mã QR do hệ thống dựng
 * và tin nó. Vì vậy chỉ `SUPER_ADMIN` được cấp. Xem migration `1798800000000`.
 */
const ReadPermission = 'merit.read';
const WritePermission = 'merit.manage';

/** Số hàng Sổ vàng trả kèm trang chi tiết. */
const LedgerPreviewSize = 20;

/**
 * Dựng khung nhìn đơn vị: gắn mã VietQR và hai con số tổng.
 *
 * Mã QR ở đây KHÔNG gắn số tiền — trang danh sách và trang chi tiết chưa biết người dùng
 * định chuyển bao nhiêu. Mã có số tiền dựng ở `DeclareMeritUseCase`, sau khi họ khai.
 */
async function toView(
  repository: IMeritRepository,
  unit: IMeritUnit,
): Promise<IMeritUnitView> {
  const totals = await repository.getDeclaredTotals(unit.globalId);
  return {
    ...unit,
    vietQrUrl: buildVietQrUrl({
      bankBin: unit.bankBin,
      accountNumber: unit.bankAccountNumber,
      accountName: unit.bankAccountName,
    }),
    totalDeclaredAmount: totals.totalDeclaredAmount,
    completedCount: totals.completedCount,
  };
}

async function toPage(
  repository: IMeritRepository,
  page: { items: IMeritUnit[]; total: number },
): Promise<IMeritUnitPageResult> {
  return {
    // `Promise.all` chứ không vòng `for await`: một trang 20 đơn vị là 20 lượt đếm, và chạy
    // tuần tự biến một trang thành 20 lượt round-trip xếp hàng.
    items: await Promise.all(
      page.items.map((unit) => toView(repository, unit)),
    ),
    total: page.total,
  };
}

/**
 * Đọc và kiểm phần thân chung của một lượt ghi đơn vị.
 *
 * `partial` phân biệt tạo với sửa. Một bản chép thứ hai cho đường sửa là một chỗ để đường
 * đó lỏng hơn — và ở đây "lỏng hơn" nghĩa là một số tài khoản ngân hàng sai định dạng đi
 * vào database, rồi mã QR không quét được mà không ai biết tại sao.
 */
async function prepareUnitWrite(
  repository: IMeritRepository,
  input: Partial<IWriteMeritUnitInput>,
  options: { partial: boolean; exceptGlobalId?: string },
): Promise<Partial<IWriteMeritUnitParams>> {
  const name = input.name?.trim();
  const purpose = input.purpose?.trim();
  const requestedSlug = normalizeCharitySlug(input.slug);
  const slug =
    requestedSlug.length > 0
      ? requestedSlug
      : name === undefined
        ? undefined
        : slugifyCharityTitle(name);

  if (!options.partial) {
    const gaps = meritUnitGaps({
      name: name ?? '',
      unitType: input.unitType,
      purpose: purpose ?? '',
      bankBin: input.bankBin,
      bankAccountNumber: input.bankAccountNumber,
      bankAccountName: input.bankAccountName ?? '',
    });
    if (!slug || slug.length === 0)
      gaps.push(
        'slug rỗng sau khi chuẩn hoá — tên cần ít nhất một chữ hoặc số Latin, hoặc gửi slug riêng',
      );
    if (gaps.length > 0) throw new ValidationFailedException(gaps);
  } else {
    // Lượt sửa: kiểm từng trường được gửi, bằng đúng bộ luật của `meritUnitGaps`. Gọi
    // `meritUnitGaps` với một bản ghi giả sẽ báo lỗi cho các trường KHÔNG gửi.
    const gaps = meritUnitGaps({
      name: name ?? 'khong-gui',
      unitType: input.unitType ?? 'TEMPLE',
      purpose: purpose ?? 'khong gui gi ca',
      bankBin: input.bankBin ?? '970415',
      bankAccountNumber: input.bankAccountNumber ?? '0000',
      bankAccountName: input.bankAccountName ?? 'khong-gui',
    });
    if (gaps.length > 0) throw new ValidationFailedException(gaps);
  }

  // Toạ độ phải đủ cặp — `ST_MakePoint` với một `NULL` cho ra `NULL`, tức đơn vị lặng lẽ
  // mất vị trí trên bản đồ thay vì người gửi biết mình gửi thiếu.
  const hasLat = input.lat !== undefined && input.lat !== null;
  const hasLng = input.lng !== undefined && input.lng !== null;
  if (hasLat !== hasLng)
    throw new ValidationFailedException([
      'lat và lng phải gửi cùng nhau, hoặc bỏ cả hai',
    ]);

  if (slug !== undefined && slug.length > 0) {
    // Hỏi trước khi ghi để trả thông báo đọc được thay vì để `UQ_merit_units_slug` ném 500.
    if (await repository.slugTaken(slug, options.exceptGlobalId))
      throw new ValidationFailedException([
        `slug "${slug}" đã có đơn vị khác dùng — đổi tên hoặc gửi slug riêng`,
      ]);
  }

  const changes: Record<string, unknown> = {};
  if (name !== undefined) changes.name = name;
  if (slug !== undefined && slug.length > 0) changes.slug = slug;
  if (input.unitType !== undefined)
    changes.unitType = input.unitType as MeritUnitType;
  if (purpose !== undefined) changes.purpose = purpose;
  if (input.description !== undefined)
    changes.description = input.description.trim() || null;
  if (input.coverUrl !== undefined) changes.coverUrl = input.coverUrl || null;
  if (input.addressLabel !== undefined)
    changes.addressLabel = input.addressLabel.trim() || null;
  if (input.bankBin !== undefined) changes.bankBin = input.bankBin;
  if (input.bankAccountNumber !== undefined)
    changes.bankAccountNumber = input.bankAccountNumber;
  if (input.bankAccountName !== undefined)
    changes.bankAccountName = input.bankAccountName.trim();
  if (input.bankName !== undefined)
    changes.bankName = input.bankName.trim() || null;
  if (input.displayOrder !== undefined)
    changes.displayOrder = input.displayOrder;
  if (hasLat && hasLng) {
    changes.lat = Number(input.lat);
    changes.lng = Number(input.lng);
  }

  return changes as Partial<IWriteMeritUnitParams>;
}

@Injectable()
export class CreateMeritUnitUseCase implements ICreateMeritUnitUseCase {
  public constructor(
    @Inject(IMeritRepository) private readonly repository: IMeritRepository,
    @Inject(IAdminConfigRepository)
    private readonly admin: IAdminConfigRepository,
  ) {}

  public async handle(
    command: ICreateMeritUnitCommand,
  ): Promise<IMeritUnitView> {
    if (!(await this.admin.hasPermission(command.actorUserId, WritePermission)))
      throw new ForbiddenException();

    const prepared = await prepareUnitWrite(this.repository, command, {
      partial: false,
    });

    const unit = await this.repository.createUnit({
      ...(prepared as IWriteMeritUnitParams),
      description: prepared.description ?? null,
      coverUrl: prepared.coverUrl ?? null,
      addressLabel: prepared.addressLabel ?? null,
      bankName: prepared.bankName ?? null,
      lat: prepared.lat ?? null,
      lng: prepared.lng ?? null,
      displayOrder: prepared.displayOrder ?? 1,
      createdBy: command.actorUserId,
    });

    return toView(this.repository, unit);
  }
}

@Injectable()
export class UpdateMeritUnitUseCase implements IUpdateMeritUnitUseCase {
  public constructor(
    @Inject(IMeritRepository) private readonly repository: IMeritRepository,
    @Inject(IAdminConfigRepository)
    private readonly admin: IAdminConfigRepository,
  ) {}

  public async handle(
    command: IUpdateMeritUnitCommand,
  ): Promise<IMeritUnitView> {
    if (!(await this.admin.hasPermission(command.actorUserId, WritePermission)))
      throw new ForbiddenException();

    const updated = await this.repository.updateUnit({
      unitId: command.unitId,
      changes: await prepareUnitWrite(this.repository, command, {
        partial: true,
        exceptGlobalId: command.unitId,
      }),
    });
    if (!updated) throw new MeritUnitNotFoundException();

    return toView(this.repository, updated);
  }
}

@Injectable()
export class ListPublicMeritUnitsUseCase implements IListPublicMeritUnitsUseCase {
  public constructor(
    @Inject(IMeritRepository) private readonly repository: IMeritRepository,
  ) {}

  public async handle(
    command: IListPublicMeritUnitsCommand,
  ): Promise<IMeritUnitPageResult> {
    return toPage(
      this.repository,
      await this.repository.listPublicUnits(command),
    );
  }
}

@Injectable()
export class ListAdminMeritUnitsUseCase implements IListAdminMeritUnitsUseCase {
  public constructor(
    @Inject(IMeritRepository) private readonly repository: IMeritRepository,
    @Inject(IAdminConfigRepository)
    private readonly admin: IAdminConfigRepository,
  ) {}

  public async handle(
    command: IListAdminMeritUnitsCommand,
  ): Promise<IMeritUnitPageResult> {
    if (!(await this.admin.hasPermission(command.actorUserId, ReadPermission)))
      throw new ForbiddenException();

    return toPage(
      this.repository,
      await this.repository.listUnitsForAdmin({
        limit: command.limit,
        offset: command.offset,
        includeInactive: command.includeInactive,
      }),
    );
  }
}

@Injectable()
export class GetMeritUnitUseCase implements IGetMeritUnitUseCase {
  public constructor(
    @Inject(IMeritRepository) private readonly repository: IMeritRepository,
  ) {}

  public async handle(
    command: IGetMeritUnitCommand,
  ): Promise<IGetMeritUnitResult> {
    const unit = await this.repository.findPublicUnitByIdOrSlug(
      command.idOrSlug,
    );
    if (!unit) throw new MeritUnitNotFoundException();

    const ledger = await this.repository.listLedger({
      unitId: unit.globalId,
      limit: LedgerPreviewSize,
      offset: 0,
    });

    return {
      unit: await toView(this.repository, unit),
      ledger: ledger.items,
      ledgerTotal: ledger.total,
    };
  }
}

@Injectable()
export class SetMeritUnitActiveUseCase implements ISetMeritUnitActiveUseCase {
  public constructor(
    @Inject(IMeritRepository) private readonly repository: IMeritRepository,
    @Inject(IAdminConfigRepository)
    private readonly admin: IAdminConfigRepository,
  ) {}

  public async handle(
    command: ISetMeritUnitActiveCommand,
  ): Promise<IMeritUnitView> {
    if (!(await this.admin.hasPermission(command.actorUserId, WritePermission)))
      throw new ForbiddenException();

    const updated = await this.repository.setUnitActive({
      unitId: command.unitId,
      isActive: command.isActive,
    });
    if (!updated) throw new MeritUnitNotFoundException();

    return toView(this.repository, updated);
  }
}

@Injectable()
export class DeleteMeritUnitUseCase implements IDeleteMeritUnitUseCase {
  public constructor(
    @Inject(IMeritRepository) private readonly repository: IMeritRepository,
    @Inject(IAdminConfigRepository)
    private readonly admin: IAdminConfigRepository,
  ) {}

  public async handle(
    command: IDeleteMeritUnitCommand,
  ): Promise<IDeleteMeritUnitResult> {
    if (!(await this.admin.hasPermission(command.actorUserId, WritePermission)))
      throw new ForbiddenException();

    // Xoá MỀM. Sổ vàng của một đơn vị là lịch sử phát tâm của người dùng — xoá cứng là
    // `ON DELETE CASCADE` gỡ sạch những hàng đó.
    if (!(await this.repository.softDeleteUnit(command.unitId)))
      throw new MeritUnitNotFoundException();

    return { deleted: true };
  }
}

@Injectable()
export class DeclareMeritUseCase implements IDeclareMeritUseCase {
  public constructor(
    @Inject(IMeritRepository) private readonly repository: IMeritRepository,
  ) {}

  public async handle(
    command: IDeclareMeritCommand,
  ): Promise<IDeclareMeritResult> {
    const gaps = meritDeclarationGaps({
      declaredAmount: command.declaredAmount,
      status: command.status,
      note: command.note,
    });
    if (gaps.length > 0) throw new ValidationFailedException(gaps);

    // Chỉ khai được cho đơn vị đang HIỆN. Đơn vị đã tắt là đơn vị Admin đã rút khỏi danh
    // sách — nhận lời khai cho nó là để người dùng chuyển tiền vào một tài khoản mà hệ
    // thống vừa thôi bảo đảm.
    const unit = await this.repository.findPublicUnitByIdOrSlug(command.unitId);
    if (!unit) throw new MeritUnitNotFoundException();

    const declaration = await this.repository.createDeclaration({
      unitId: unit.globalId,
      userId: command.actorUserId,
      declaredAmount: command.declaredAmount,
      status: command.status as MeritDeclarationStatus,
      isAnonymous: command.isAnonymous ?? false,
      note: command.note?.trim().slice(0, MaxMeritNoteLength) || null,
    });

    return {
      declaration,
      // Mã QR LẦN NÀY có gắn số tiền vừa khai. Không gắn thì người dùng phải tự nhập trong
      // app ngân hàng, và con số trên Sổ vàng lệch với con số thật ngay từ bước đầu.
      vietQrUrl: buildVietQrUrl({
        bankBin: unit.bankBin,
        accountNumber: unit.bankAccountNumber,
        accountName: unit.bankAccountName,
        amount: declaration.declaredAmount,
        note: declaration.note,
      }),
    };
  }
}

@Injectable()
export class CompleteMeritDeclarationUseCase implements ICompleteMeritDeclarationUseCase {
  public constructor(
    @Inject(IMeritRepository) private readonly repository: IMeritRepository,
  ) {}

  public async handle(
    command: ICompleteMeritDeclarationCommand,
  ): Promise<IMeritDeclaration> {
    const completed = await this.repository.markDeclarationCompleted({
      declarationId: command.declarationId,
      userId: command.actorUserId,
    });
    if (completed) return completed;

    // Không đổi được thì phân biệt hai ca, vì chúng nói hai điều khác nhau cho người dùng.
    //
    // Phép kiểm chủ sở hữu nằm trong `WHERE` của câu `UPDATE`, nên lượt đọc dưới đây CHỈ để
    // chọn thông báo — không phải để quyết định có cho ghi hay không. Đặt nó trước câu ghi
    // mới là mở một khe TOCTOU.
    const existing = await this.repository.findDeclarationByGlobalId(
      command.declarationId,
    );
    // Lời khai của NGƯỜI KHÁC cũng trả "không tìm thấy": sự tồn tại của một lời khai ẩn
    // danh là thứ không nên dò được bằng cách thử id.
    if (!existing || existing.userId !== command.actorUserId)
      throw new MeritUnitNotFoundException();

    throw new MeritDeclarationAlreadyCompletedException();
  }
}

@Injectable()
export class ListOwnMeritDeclarationsUseCase implements IListOwnMeritDeclarationsUseCase {
  public constructor(
    @Inject(IMeritRepository) private readonly repository: IMeritRepository,
  ) {}

  public async handle(
    command: IListOwnMeritDeclarationsCommand,
  ): Promise<IListOwnMeritDeclarationsResult> {
    // KHÔNG ẩn danh ở đây — họ xem lịch sử của chính mình. `is_anonymous` là tuỳ chọn hiển
    // thị trên Sổ vàng công khai, không phải một lệnh xoá dữ liệu.
    return this.repository.listOwnDeclarations({
      userId: command.actorUserId,
      limit: command.limit,
      offset: command.offset,
    });
  }
}
