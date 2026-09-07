import { Body, Controller, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';

import { OrgId } from '../auth/decorators/current-user.decorator';
import { RequireRole } from '../auth/decorators/roles.decorator';
import { Role } from '../common/domain/tenancy';

import type { OperationAccepted } from './domain/business-event';
import { CreateBusinessEventDto } from './dto/create-business-event.dto';
import { EventsService } from './events.service';

/**
 * Business event ingress — the boundary a partner facility integrates against.
 *
 * Deliberately thin: validate, delegate, return. All decision logic lives in
 * the workflow, which is what makes the same endpoint work for a crane, a
 * drone, or an ambulance without change.
 */
@Controller('events')
export class EventsController {
  constructor(private readonly events: EventsService) {}

  /**
   * 202 Accepted, not 201: the decision has not been made yet. The workflow has
   * been durably started and will run to completion independently of this
   * request.
   */
  @Post()
  @RequireRole(Role.OPERATOR)
  @HttpCode(HttpStatus.ACCEPTED)
  create(
    @OrgId() organizationId: string,
    @Body() dto: CreateBusinessEventDto,
  ): Promise<OperationAccepted> {
    return this.events.accept(organizationId, dto);
  }

  /** The facility reports the operation finished — triggers release. */
  @Post(':operationId/complete')
  @RequireRole(Role.OPERATOR)
  @HttpCode(HttpStatus.ACCEPTED)
  complete(@OrgId() organizationId: string, @Param('operationId') operationId: string) {
    return this.events.complete(organizationId, operationId);
  }
}
