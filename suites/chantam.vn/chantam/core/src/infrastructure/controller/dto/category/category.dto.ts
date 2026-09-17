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
  IsBoolean,
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
    format: 'uuid',
    description: 'Danh mục cha. Bỏ trống là node gốc.',
  })
  @IsOptional()
  @IsUUID()
  parentId?: string;
}
export class CreateCategoryBodyDto implements ICreateCategoryBodyDto {
  @ApiProperty({ type: () => CreateCategoryDto })
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
  @ApiProperty({ type: () => [CategoryDto] }) children: ICategoryDto[];
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
