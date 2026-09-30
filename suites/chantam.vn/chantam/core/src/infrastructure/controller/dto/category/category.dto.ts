import {
  GenericMvpPostTypes,
  PostTypes,
} from '@chantam.vn/chantam.core-lib/consts';
import {
  ICategoryDto,
  ICreateCategoryBodyDto,
  ICreateCategoryDto,
  ICreateCategoryResponseDto,
  IGetCategoryTreeResponseDto,
  IUpdateCategoryBodyDto,
  IUpdateCategoryDto,
  IUpdateCategoryResponseDto,
} from '@chantam.vn/chantam.core-lib/dto';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsDefined,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreateCategoryDto implements ICreateCategoryDto {
  @ApiProperty({ example: 'Sách', description: 'Tên hiển thị.' })
  @IsString()
  @Length(1, 100)
  name: string;
  @ApiPropertyOptional({
    example: 'sach',
    description: 'URL slug. Bỏ trống sẽ tự sinh từ name.',
  })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  slug?: string;
  @ApiPropertyOptional({
    example: 'book',
    description: 'Tên icon do client tự render.',
  })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  icon?: string;
  @ApiPropertyOptional({ default: 0, description: 'Thứ tự tăng dần.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;
  @ApiPropertyOptional({
    isArray: true,
    enum: GenericMvpPostTypes,
    description:
      'Loại bài dùng được danh mục này. Bỏ trống là dùng cho mọi loại.',
  })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(PostTypes, { each: true })
  postTypes?: PostTypes[];
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Danh mục cha. Bỏ trống là node gốc.',
  })
  @IsOptional()
  @IsUUID()
  parentId?: string;
}
export class CreateCategoryBodyDto implements ICreateCategoryBodyDto {
  @ApiProperty({ type: () => CreateCategoryDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => CreateCategoryDto)
  category: ICreateCategoryDto;
}
export class UpdateCategoryDto implements IUpdateCategoryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 100)
  name?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 100)
  slug?: string;
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  icon?: string | null;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  parentId?: string | null;
}
export class UpdateCategoryBodyDto implements IUpdateCategoryBodyDto {
  @ApiProperty({ type: () => UpdateCategoryDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => UpdateCategoryDto)
  category: IUpdateCategoryDto;
}
export class UpdateCategoryParamsDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() categoryId: string;
}
export class CategoryDto implements ICategoryDto {
  @ApiProperty({ format: 'uuid' }) categoryId: string;
  @ApiProperty() name: string;
  @ApiProperty() slug: string;
  @ApiProperty({ nullable: true }) icon: string | null;
  @ApiProperty() sortOrder: number;
  @ApiProperty() isActive: boolean;
  @ApiProperty({ isArray: true, enum: GenericMvpPostTypes })
  postTypes: PostTypes[];
  @ApiProperty({ type: () => [CategoryDto] }) children: ICategoryDto[];

  @ApiPropertyOptional({
    description:
      'false khi chính nó bật nhưng một TỔ TIÊN đã tắt — người dùng không thấy danh mục này dù isActive là true. Chỉ có nghĩa ở đường Admin.',
  })
  effectivelyActive?: boolean;

  @ApiPropertyOptional({
    description:
      'true khi nút này không nối được về gốc: nhánh của nó có vòng parent_id. Chỉ đường Admin trả về, và đó là cách duy nhất lấy lại categoryId để sửa.',
  })
  orphaned?: boolean;

  @ApiPropertyOptional({
    nullable: true,
    description:
      'Danh mục này đã được gộp vào đâu và vì sao. null nếu chưa gộp. Phân biệt "tắt vì đã gộp" với "tắt tay" — chỉ cái sau bật lại được.',
  })
  mergedInto?: { categoryId: string; reason: string | null } | null;
}

export class MergeCategoryDto {
  @ApiProperty({
    format: 'uuid',
    description:
      'Danh mục NHẬN bài. Phải đang bật, và không nằm trong nhánh con của nguồn.',
  })
  @IsUUID()
  targetCategoryId: string;

  @ApiProperty({
    example: 'Hai danh mục trùng nghĩa, gộp Sách Giáo Khoa vào Sách',
    description:
      'Bắt buộc — hiện trong audit log và trong merge_reason của danh mục nguồn.',
  })
  @IsString()
  @Length(10, 500)
  reason: string;
}

export class MergeCategoryBodyDto {
  @ApiProperty({ type: () => MergeCategoryDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => MergeCategoryDto)
  merge: MergeCategoryDto;
}

export class MergeCategoryResponseDto {
  @ApiProperty({ type: () => CategoryDto })
  category: ICategoryDto;

  @ApiProperty({ description: 'Số bài đã chuyển sang danh mục đích.' })
  movedPosts: number;

  @ApiProperty({
    description: 'Số danh mục con đã chuyển sang làm con của đích.',
  })
  movedChildren: number;
}

export class GetCategoryTreeQueryDto {
  @ApiPropertyOptional({
    enum: GenericMvpPostTypes,
    description:
      'Chỉ lấy danh mục dùng được cho loại bài này. Bỏ trống trả cả cây. ' +
      'Nhánh cha không khớp vẫn được giữ nếu có con khớp, để cây không đứt — ' +
      'đọc postTypes của từng node để biết node nào thật sự chọn được.',
  })
  @IsOptional()
  @IsEnum(PostTypes)
  postType?: PostTypes;
}
export class GetCategoryTreeResponseDto implements IGetCategoryTreeResponseDto {
  @ApiProperty({ type: () => [CategoryDto] }) categories: ICategoryDto[];
}
export class CreateCategoryResponseDto implements ICreateCategoryResponseDto {
  @ApiProperty({ type: () => CategoryDto }) category: ICategoryDto;
}
export class UpdateCategoryResponseDto implements IUpdateCategoryResponseDto {
  @ApiProperty({ type: () => CategoryDto }) category: ICategoryDto;
}
