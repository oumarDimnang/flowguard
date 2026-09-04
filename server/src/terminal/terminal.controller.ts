import { Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';

import type { BERTH } from './berth.definitions';
import type { ContainerMove } from './domain/container-move';
import { TerminalService } from './terminal.service';

/**
 * The stand-in TOS surface.
 *
 * These are the controls a terminal supervisor would have: look at the berth
 * plan, dispatch the next move, abort one that has gone wrong. Nothing here
 * mentions workflows, connectivity or the network — a real TOS does not know
 * FlowGuard exists, and neither does this one.
 */
@Controller('terminal')
export class TerminalController {
  constructor(private readonly terminal: TerminalService) {}

  @Get('berth')
  berth(): typeof BERTH {
    return this.terminal.berth();
  }

  @Get('moves')
  moves(): ContainerMove[] {
    return this.terminal.list();
  }

  @Get('moves/:moveId')
  move(@Param('moveId') moveId: string): ContainerMove {
    return this.terminal.get(moveId);
  }

  /** 202: the move unfolds over time; watch it on the WebSocket. */
  @Post('moves/:moveId/dispatch')
  @HttpCode(HttpStatus.ACCEPTED)
  dispatch(@Param('moveId') moveId: string): Promise<ContainerMove> {
    return this.terminal.dispatch(moveId);
  }

  @Post('moves/:moveId/abort')
  @HttpCode(HttpStatus.ACCEPTED)
  abort(@Param('moveId') moveId: string): Promise<ContainerMove> {
    return this.terminal.abort(moveId);
  }

  /** Restore the berth plan so the demo can be run again without a restart. */
  @Post('reset')
  reset(): ContainerMove[] {
    return this.terminal.reset();
  }
}
