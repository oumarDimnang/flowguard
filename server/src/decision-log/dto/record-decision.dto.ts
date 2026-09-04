import { Type } from 'class-transformer';
import {
  IsArray,
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
 * One read-only tool call the agent chose to make while gathering evidence
 * — which CAMARA signal it decided to look at, and what it saw.
 */
export class ToolCallDto {
  @IsString()
  @MaxLength(80)
  name!: string;

  @IsOptional()
  @IsObject()
  arguments?: Record<string, unknown>;

  // Deliberately untyped: each of the four read tools returns a different
  // shape (a plain string summary for some, a structured object for
  // others), mirroring the dynamic dict the agent actually sends.
  @IsOptional()
  result?: unknown;

  @IsOptional()
  @IsBoolean()
  failed?: boolean;
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

  // The path the LangGraph assessment took (e.g. "classify" -> "gather_evidence"
  // -> "escalate" -> "validate"), shown alongside `reasoning` so the dashboard
  // can evidence *how* the judgement was reached, not just what it concluded.
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  graphTrace?: string[];

  // Which read-only CAMARA signals the agent chose to consult as evidence,
  // and what they returned. Always empty for a low-confidence-free
  // classification; the toolbox itself has no write capability regardless.
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ToolCallDto)
  toolCalls?: ToolCallDto[];

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
