import {
  IsEnum,
  IsInt,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/**
 * What one live reasoning event is about.
 *
 * Cross-language contract — mirrored by the constants in
 * agent/src/flowguard_agent/graph/trace_sink.py and by `ReasoningTraceKind`
 * in the client.
 */
export const ReasoningTraceKind = {
  NODE_STARTED: 'node_started',
  NODE_FINISHED: 'node_finished',
  TOOL_STARTED: 'tool_started',
  TOOL_FINISHED: 'tool_finished',
} as const;
export type ReasoningTraceKind = (typeof ReasoningTraceKind)[keyof typeof ReasoningTraceKind];

/**
 * One event from inside the agent's assessment graph, POSTed as it happens.
 *
 * Not a decision record and never stored as one. It exists so the dashboard
 * can show the reasoning graph lighting up node by node while the model is
 * still thinking, instead of receiving the whole path as one batch when the
 * CRITICALITY_ASSESSED step lands. That step remains the audited record.
 */
export class ReasoningTraceDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  organizationId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(128)
  operationId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  workflowId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  runId?: string;

  /** Order within one assessment. Monotonic per sink, starting at 1. */
  @IsInt()
  @Min(1)
  seq!: number;

  @IsEnum(ReasoningTraceKind)
  kind!: ReasoningTraceKind;

  /** A graph node name for node events, a tool name for tool events. */
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  node!: string;

  /** The same line the durable `graphTrace` will carry, or a tool's result. */
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  detail?: string;

  /** Structured payload; shape depends on `kind` and `node`. */
  @IsOptional()
  @IsObject()
  data?: Record<string, unknown>;

  @IsISO8601()
  occurredAt!: string;
}
