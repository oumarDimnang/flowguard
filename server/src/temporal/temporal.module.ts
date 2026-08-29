import { Global, Module } from '@nestjs/common';

import { TemporalOrchestratorAdapter } from './adapters/temporal-orchestrator.adapter';
import { WorkflowOrchestratorPort } from './ports/workflow-orchestrator.port';
import { TemporalConnectionProvider } from './temporal-connection.provider';

/**
 * Binds the orchestration contract to its Temporal implementation (S1, S2).
 *
 * Consumers inject WorkflowOrchestratorPort. Replacing Temporal, or
 * substituting a fake in tests, means changing useClass here and nothing else.
 *
 * Global because both the events and webhooks modules need it, and neither
 * should have to know where it comes from.
 */
@Global()
@Module({
  providers: [
    TemporalConnectionProvider,
    { provide: WorkflowOrchestratorPort, useClass: TemporalOrchestratorAdapter },
  ],
  exports: [WorkflowOrchestratorPort, TemporalConnectionProvider],
})
export class TemporalModule {}
