import {
  MaxMeritDeclaredAmount,
  MaxMeritNoteLength,
  MaxMeritUnitNameLength,
  MaxMeritUnitPurposeLength,
  MeritDeclarationStatuses,
  MeritUnitTypes,
  MinMeritDeclaredAmount,
} from '@chantam.vn/chantam.core-lib/models';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDefined,
  IsIn,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class WriteMeritUnitDto {
  @ApiProperty({
    example: 'Chùa Vĩnh Nghiêm',
    maxLength: MaxMeritUnitNameLength,
  })
  @IsString()
  @Length(3, MaxMeritUnitNameLength)
  name: string;

  @ApiPropertyOptional({ example: 'chua-vinh-nghiem' })
  @IsOptional()
  @IsString()
  @Length(1, 200)
  slug?: string;

  @ApiProperty({ enum: MeritUnitTypes })
  @IsIn(MeritUnitTypes as readonly string[])
  unitType: string;

  @ApiProperty({
    maxLength: MaxMeritUnitPurposeLength,
    description:
      'Mục đích trợ duyên (UI-MERIT-01). Đây là thứ người dùng đọc TRƯỚC khi chuyển tiền, ' +
      'nên tối thiểu 10 ký tự.',
  })
  @IsString()
  @Length(10, MaxMeritUnitPurposeLength)
  purpose: string;

  @ApiPropertyOptional({ maxLength: 20_000 })
  @IsOptional()
  @IsString()
  @Length(1, 20_000)
  description?: string;

  @ApiPropertyOptional({ description: 'Bắt buộc `https://` nếu có gửi.' })
  @IsOptional()
  @IsString()
  @Length(1, 2_000)
  coverUrl?: string;

  @ApiPropertyOptional({ example: '339 Nam Kỳ Khởi Nghĩa, Quận 3' })
  @IsOptional()
  @IsString()
  @Length(1, 255)
  addressLabel?: string;

  @ApiPropertyOptional({
    example: 10.7897,
    description:
      'Phải gửi CÙNG `lng`. Bỏ cả hai nếu không gắn vị trí lên Map Discovery.',
  })
  @IsOptional()
  @IsLatitude()
  lat?: number;

  @ApiPropertyOptional({
    example: 106.6836,
    description: 'Phải gửi CÙNG `lat`.',
  })
  @IsOptional()
  @IsLongitude()
  lng?: number;

  @ApiProperty({
    example: '970415',
    description:
      'BIN ngân hàng theo chuẩn Napas, đúng sáu chữ số. KHÔNG kiểm xem BIN có thật — danh ' +
      'sách BIN thay đổi khi có ngân hàng mới, và một allowlist chép tay sẽ chặn đúng ngân ' +
      'hàng mới đó. Sai BIN thì mã QR không quét được, và đó là lỗi người dùng thấy ngay.',
  })
  @IsString()
  @Length(6, 6)
  bankBin: string;

  @ApiProperty({ example: '113366668888' })
  @IsString()
  @Length(4, 50)
  bankAccountNumber: string;

  @ApiProperty({
    example: 'CHUA VINH NGHIEM',
    description:
      'Tên thụ hưởng. Người chuyển đối chiếu tên này trước khi bấm xác nhận trong app ngân hàng.',
  })
  @IsString()
  @Length(1, 200)
  bankAccountName: string;

  @ApiPropertyOptional({ example: 'VietinBank' })
  @IsOptional()
  @IsString()
  @Length(1, 200)
  bankName?: string;

  @ApiPropertyOptional({ minimum: 0, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  displayOrder?: number;
}

export class WriteMeritUnitBodyDto {
  @ApiProperty({ type: () => WriteMeritUnitDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => WriteMeritUnitDto)
  unit: WriteMeritUnitDto;
}

export class PatchMeritUnitDto {
  @ApiPropertyOptional({ maxLength: MaxMeritUnitNameLength })
  @IsOptional()
  @IsString()
  @Length(3, MaxMeritUnitNameLength)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 200)
  slug?: string;

  @ApiPropertyOptional({ enum: MeritUnitTypes })
  @IsOptional()
  @IsIn(MeritUnitTypes as readonly string[])
  unitType?: string;

  @ApiPropertyOptional({ maxLength: MaxMeritUnitPurposeLength })
  @IsOptional()
  @IsString()
  @Length(10, MaxMeritUnitPurposeLength)
  purpose?: string;

  @ApiPropertyOptional({ maxLength: 20_000 })
  @IsOptional()
  @IsString()
  @Length(0, 20_000)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 2_000)
  coverUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 255)
  addressLabel?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsLatitude()
  lat?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsLongitude()
  lng?: number;

  @ApiPropertyOptional({
    description:
      'Đổi được, nhưng đây là quyền nhạy nhất — mọi lượt sửa vào audit log.',
  })
  @IsOptional()
  @IsString()
  @Length(6, 6)
  bankBin?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(4, 50)
  bankAccountNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 200)
  bankAccountName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 200)
  bankName?: string;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  displayOrder?: number;
}

export class PatchMeritUnitBodyDto {
  @ApiProperty({ type: () => PatchMeritUnitDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => PatchMeritUnitDto)
  unit: PatchMeritUnitDto;
}

export class ListMeritUnitsQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ minimum: 0, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}

export class ListAdminMeritUnitsQueryDto extends ListMeritUnitsQueryDto {
  @ApiPropertyOptional({
    default: false,
    description:
      'Gồm cả đơn vị đã tắt. Mặc định `false` để khớp đường công khai.',
  })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  includeInactive?: boolean;
}

export class MeritUnitIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  id: string;
}

export class DeclareMeritDto {
  @ApiProperty({
    minimum: MinMeritDeclaredAmount,
    maximum: MaxMeritDeclaredAmount,
    example: 500_000,
    description:
      'Số tiền người dùng **TỰ KHAI**, đơn vị VNĐ. Hệ thống KHÔNG xác minh giao dịch ngân ' +
      'hàng (UI-MERIT-01) — con số này là lời khai, không phải một giao dịch đã đối chiếu, ' +
      'và nó KHÔNG sinh điểm.',
  })
  @Type(() => Number)
  @IsInt()
  @Min(MinMeritDeclaredAmount)
  @Max(MaxMeritDeclaredAmount)
  declaredAmount: number;

  @ApiProperty({
    enum: MeritDeclarationStatuses,
    description:
      '`INTENDED` dự định chuyển · `COMPLETED` đã chuyển. Cả hai đều là LỜI KHAI — ' +
      '`COMPLETED` không nghĩa là hệ thống đã xác minh.',
  })
  @IsIn(MeritDeclarationStatuses as readonly string[])
  status: string;

  @ApiPropertyOptional({
    default: false,
    description:
      'Ẩn danh trên Sổ vàng (UI-MERIT-01). Ẩn TÊN ở đường đọc công khai, không xoá hàng — ' +
      'bạn vẫn xem lại được ở `GET /merit-units/declarations/mine`.',
  })
  @IsOptional()
  @IsBoolean()
  isAnonymous?: boolean;

  @ApiPropertyOptional({ maxLength: MaxMeritNoteLength })
  @IsOptional()
  @IsString()
  @Length(1, MaxMeritNoteLength)
  note?: string;
}

export class DeclareMeritBodyDto {
  @ApiProperty({ type: () => DeclareMeritDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => DeclareMeritDto)
  declaration: DeclareMeritDto;
}

export class SetMeritUnitActiveDto {
  @ApiProperty()
  @IsBoolean()
  isActive: boolean;
}

export class SetMeritUnitActiveBodyDto {
  @ApiProperty({ type: () => SetMeritUnitActiveDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => SetMeritUnitActiveDto)
  unit: SetMeritUnitActiveDto;
}

export class MeritUnitResponseDto {
  @ApiProperty() globalId: string;
  @ApiProperty() name: string;
  @ApiProperty() slug: string;

  @ApiProperty({ enum: MeritUnitTypes })
  unitType: string;

  @ApiProperty() purpose: string;
  @ApiProperty({ nullable: true }) description: string | null;
  @ApiProperty({ nullable: true }) coverUrl: string | null;
  @ApiProperty({ nullable: true }) addressLabel: string | null;
  @ApiProperty({ nullable: true }) lat: number | null;
  @ApiProperty({ nullable: true }) lng: number | null;
  @ApiProperty() bankBin: string;
  @ApiProperty() bankAccountNumber: string;
  @ApiProperty() bankAccountName: string;
  @ApiProperty({ nullable: true }) bankName: string | null;
  @ApiProperty() displayOrder: number;
  @ApiProperty() isActive: boolean;

  @ApiProperty({
    description:
      'Mã VietQR dựng sẵn ở backend. Ở đây CHƯA gắn số tiền — trang danh sách và chi tiết ' +
      'chưa biết người dùng định chuyển bao nhiêu. Mã có số tiền trả về từ ' +
      '`POST /merit-units/:id/declarations`.',
  })
  vietQrUrl: string;

  @ApiProperty({
    description:
      'Tổng số tiền ĐÃ KHAI của các lượt `COMPLETED`. Đây **không** phải số tiền đơn vị đã ' +
      'nhận — hệ thống không đối chiếu với ngân hàng. Mọi chỗ hiển thị phải nói rõ đó là ' +
      'lời khai của người dùng.',
  })
  totalDeclaredAmount: number;

  @ApiProperty({ description: 'Số lượt khai đã đánh dấu hoàn tất.' })
  completedCount: number;

  @ApiProperty({ nullable: true }) createdBy: string | null;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}

export class MeritLedgerEntryResponseDto {
  @ApiProperty() globalId: string;

  @ApiProperty({
    description:
      'Tên hiện trên Sổ vàng, hoặc "Người ẩn danh". Tên thật của người ẩn danh KHÔNG ra ' +
      'khỏi tầng repository — câu SQL không kéo nó về.',
  })
  donorLabel: string;

  @ApiProperty() declaredAmount: number;

  @ApiProperty({ enum: MeritDeclarationStatuses })
  status: string;

  @ApiProperty({ nullable: true }) note: string | null;
  @ApiProperty() declaredAt: Date;
}

export class MeritDeclarationResponseDto {
  @ApiProperty() globalId: string;
  @ApiProperty() unitId: string;
  @ApiProperty() userId: string;
  @ApiProperty() declaredAmount: number;

  @ApiProperty({ enum: MeritDeclarationStatuses })
  status: string;

  @ApiProperty() isAnonymous: boolean;
  @ApiProperty({ nullable: true }) note: string | null;
  @ApiProperty() declaredAt: Date;
  @ApiProperty({ nullable: true }) completedAt: Date | null;
}

export class MeritUnitDetailResponseDto {
  @ApiProperty({ type: () => MeritUnitResponseDto })
  unit: MeritUnitResponseDto;

  @ApiProperty({ type: () => [MeritLedgerEntryResponseDto] })
  ledger: MeritLedgerEntryResponseDto[];

  @ApiProperty() ledgerTotal: number;
}

export class ListMeritUnitsResponseDto {
  @ApiProperty({ type: () => [MeritUnitResponseDto] })
  items: MeritUnitResponseDto[];

  @ApiProperty() total: number;
}

export class MeritUnitWrapperResponseDto {
  @ApiProperty({ type: () => MeritUnitResponseDto })
  unit: MeritUnitResponseDto;
}

export class DeclareMeritResponseDto {
  @ApiProperty({ type: () => MeritDeclarationResponseDto })
  declaration: MeritDeclarationResponseDto;

  @ApiProperty({
    description:
      'Mã VietQR đã gắn ĐÚNG số tiền vừa khai. Đây là lý do lời khai đi trước khi mở app ' +
      'ngân hàng: không có nó thì người dùng tự nhập số tiền, và con số trên Sổ vàng lệch ' +
      'với con số thật ngay từ bước đầu.',
  })
  vietQrUrl: string;
}

export class MeritDeclarationWrapperResponseDto {
  @ApiProperty({ type: () => MeritDeclarationResponseDto })
  declaration: MeritDeclarationResponseDto;
}

export class ListOwnMeritDeclarationsResponseDto {
  @ApiProperty({ type: () => [MeritDeclarationResponseDto] })
  items: MeritDeclarationResponseDto[];

  @ApiProperty() total: number;
}

export class DeleteMeritUnitResponseDto {
  @ApiProperty() deleted: boolean;
}
