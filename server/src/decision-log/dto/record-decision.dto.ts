import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsISO8601,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

import {
  CongestionLevel,
  Criticality,
  NetworkAction,
  QosStatus,
  QosStatusInfo,
} from '../../common/domain/enums';
import { DecisionStep } from '../domain/decision-record';

export class NetworkCallTraceDto {
  @IsEnum(['CONGESTION_INSIGHTS', 'DEVICE_STATUS', 'QUALITY_ON_DEMAND', 'NETWORK_SLICE'] as const)
  api!: 'CONGESTION_INSIGHTS' | 'DEVICE_STATUS' | 'QUALITY_ON_DEMAND' | 'NETWORK_SLICE';

  @IsString()
  @MaxLength(120)
  operation!: string;

  @IsOptional()
  @IsObject()
  request?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  response?: Record<string, unknown>;

  @IsOptional()
  @IsNumber()
  @Min(0)
  durationMs?: number;
}

/**
 * Payload the Python activities POST to /internal/decisions.
 *
 * Cross-language contract — mirrored by
 * agent/src/flowguard_agent/activities/emit.py.
 */
export class RecordDecisionDto {
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  operationId!: string;

  @IsString()
  @MinLength(1)
  workflowId!: string;

  @IsString()
  @MinLength(1)
  runId!: string;

  @IsEnum(DecisionStep)
  step!: DecisionStep;

  @IsOptional()
  @IsEnum(Criticality)
  criticality?: Criticality;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  criticalityConfidence?: number;

  @IsOptional()
  @IsEnum(CongestionLevel)
  congestion?: CongestionLevel;

  @IsOptional()
  @IsBoolean()
  deviceReachable?: boolean;

  @IsOptional()
  @IsEnum(NetworkAction)
  action?: NetworkAction;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  reasoning?: string;

  @IsOptional()
  @IsString()
  qodSessionId?: string;

  @IsOptional()
  @IsEnum(QosStatus)
  qosStatus?: QosStatus;

  @IsOptional()
  @IsEnum(QosStatusInfo)
  qosStatusInfo?: QosStatusInfo;

  @IsOptional()
  @IsString()
  sliceId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => NetworkCallTraceDto)
  networkCall?: NetworkCallTraceDto;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  error?: string;

  @IsOptional()
  @IsISO8601()
  occurredAt?: string;
}
