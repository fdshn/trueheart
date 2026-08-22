import { IGeoPoint } from '@chantam/service.persistency-lib/geo';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsLatitude, IsLongitude } from 'class-validator';

/** DTO toạ độ dùng chung cho mọi resource có vị trí. */
export class GeoPointDto implements IGeoPoint {
  @ApiProperty({ example: 10.7724, description: 'Vĩ độ' })
  @Type(() => Number)
  @IsLatitude()
  lat: number;

  @ApiProperty({ example: 106.698, description: 'Kinh độ' })
  @Type(() => Number)
  @IsLongitude()
  lng: number;
}
