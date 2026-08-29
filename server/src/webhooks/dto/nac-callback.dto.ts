import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';

import { CongestionLevel, QosStatus, QosStatusInfo } from '../../common/domain/enums';

/**
 * CAMARA callbacks are CloudEvents: envelope metadata plus a `data` payload.
 * Only the fields FlowGuard acts on are validated; the rest is carried through
 * to the decision log untouched.
 */
class CloudEventEnvelope {
  @IsOptional()
  @IsString()
  id?: string;

  @IsOptional()
  @IsString()
  source?: string;

  /** e.g. org.camaraproject.quality-on-demand.v1.qos-status-changed */
  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsISO8601()
  time?: string;
}

export class QodStatusDataDto {
  @IsString()
  @MinLength(1)
  sessionId!: string;

  @IsEnum(QosStatus)
  qosStatus!: QosStatus;

  @IsOptional()
  @IsEnum(QosStatusInfo)
  statusInfo?: QosStatusInfo;
}

export class QodCallbackDto extends CloudEventEnvelope {
  @ValidateNested()
  @Type(() => QodStatusDataDto)
  @IsObject()
  data!: QodStatusDataDto;
}

export class CongestionDataDto {
  @IsEnum(CongestionLevel)
  congestionLevel!: CongestionLevel;

  @IsOptional()
  @IsString()
  subscriptionId?: string;
}

export class CongestionCallbackDto extends CloudEventEnvelope {
  @ValidateNested()
  @Type(() => CongestionDataDto)
  @IsObject()
  data!: CongestionDataDto;
}

export class DeviceStatusDataDto {
  @IsOptional()
  @IsBoolean()
  reachable?: boolean;

  @IsOptional()
  @IsBoolean()
  roaming?: boolean;

  @IsOptional()
  @IsString()
  subscriptionId?: string;
}

export class DeviceStatusCallbackDto extends CloudEventEnvelope {
  @ValidateNested()
  @Type(() => DeviceStatusDataDto)
  @IsObject()
  data!: DeviceStatusDataDto;
}
