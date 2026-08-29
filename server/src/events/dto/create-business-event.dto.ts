import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

import { AssetType } from '../../common/domain/enums';

export class DeviceRefDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  id!: string;

  /** E.164, e.g. +99999991000 (Nokia sandbox simulated device). */
  @IsOptional()
  @IsString()
  @Matches(/^\+[1-9]\d{6,14}$/, { message: 'phoneNumber must be E.164, e.g. +99999991000' })
  phoneNumber?: string;

  @IsOptional()
  @IsString()
  ipv4Address?: string;

  @IsOptional()
  @IsString()
  ipv6Address?: string;
}

export class CreateBusinessEventDto {
  /**
   * Caller-supplied idempotency key. Re-submitting the same id adopts the
   * running workflow instead of starting a second one (S7), which is what
   * prevents one operation from holding two paid QoD sessions.
   */
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  id!: string;

  @IsEnum(AssetType)
  assetType!: AssetType;

  @ValidateNested()
  @Type(() => DeviceRefDto)
  device!: DeviceRefDto;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  operation!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsInt()
  @Min(1)
  expectedDurationSeconds!: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  site?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @IsOptional()
  @IsISO8601()
  occurredAt?: string;
}
