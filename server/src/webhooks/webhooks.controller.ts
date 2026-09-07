import { Body, Controller, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';

import {
  CongestionCallbackDto,
  DeviceStatusCallbackDto,
  QodCallbackDto,
} from './dto/nac-callback.dto';
import { Public } from '../auth/decorators/public.decorator';
import { WebhookAuthGuard } from './webhook-auth.guard';
import { WebhooksService, type DispatchResult } from './webhooks.service';

/**
 * The single public sink for Nokia Network as Code callbacks (D7 / S8).
 *
 * Every CAMARA notification terminates here and is relayed inward as a Temporal
 * signal. The Python worker has no inbound port at all, which means exactly one
 * TLS surface and one tunnel to expose on demo day.
 *
 * The controller stays thin on purpose: guard, validate, delegate. Business
 * logic belongs in the workflow.
 */
@Controller('webhooks/nac')
@Public()
@UseGuards(WebhookAuthGuard)
export class WebhooksController {
  constructor(private readonly webhooks: WebhooksService) {}

  /**
   * Quality on Demand status transitions (D8).
   *
   * The operation ID is in the path because the activity registers a
   * per-session sink of `/webhooks/nac/qod/{operationId}` when creating the
   * session — the callback arrives already correlated.
   */
  @Post('qod/:operationId')
  @HttpCode(HttpStatus.OK)
  qod(
    @Param('operationId') operationId: string,
    @Body() callback: QodCallbackDto,
  ): Promise<DispatchResult> {
    return this.webhooks.qodStatusChanged(operationId, callback);
  }

  /** Device reachability / roaming transitions. */
  @Post('device-status/:operationId/:deviceId')
  @HttpCode(HttpStatus.OK)
  deviceStatus(
    @Param('operationId') operationId: string,
    @Param('deviceId') deviceId: string,
    @Body() callback: DeviceStatusCallbackDto,
  ): Promise<DispatchResult> {
    return this.webhooks.deviceStatusChanged(operationId, deviceId, callback);
  }

  /** Congestion Insights notifications — device-scoped, fans out (D7). */
  @Post('congestion/:deviceId')
  @HttpCode(HttpStatus.OK)
  congestion(
    @Param('deviceId') deviceId: string,
    @Body() callback: CongestionCallbackDto,
  ): Promise<DispatchResult> {
    return this.webhooks.congestionUpdated(deviceId, callback);
  }
}
