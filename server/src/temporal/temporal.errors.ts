/**
 * Domain-level errors raised by the orchestrator adapter.
 *
 * Deliberately NOT NestJS HttpExceptions: an infrastructure adapter should not
 * know it is behind HTTP. Services translate these into transport errors.
 */
export class OperationWorkflowNotFoundError extends Error {
  constructor(public readonly workflowId: string) {
    super(`No workflow execution found for '${workflowId}'`);
    this.name = 'OperationWorkflowNotFoundError';
  }
}

export class OrchestratorUnavailableError extends Error {
  constructor(cause: string) {
    super(`Workflow orchestrator unavailable: ${cause}`);
    this.name = 'OrchestratorUnavailableError';
  }
}
