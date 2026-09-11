import type { Model } from 'mongoose';
import { describe, expect, it, vi } from 'vitest';

import { DecisionStep, type DecisionRecord } from '../domain/decision-record';
import type { DecisionRecordDocument } from '../schemas/decision-record.schema';
import { MongoDecisionLogRepository } from './mongo-decision-log.repository';

// The adapter only needs the entity name for its injection decorator. Schema
// construction is outside these tests; the SWC test transform infers enum
// metadata differently from the application's TypeScript build.
vi.mock('../schemas/decision-record.schema', () => ({
  DecisionRecordEntity: class DecisionRecordEntity {},
}));

const occurredAt = new Date('2026-09-10T12:00:00.000Z');
const recordedAt = new Date('2026-09-10T12:00:01.000Z');

function decision(): Omit<DecisionRecord, 'recordedAt'> {
  return {
    idempotencyKey: 'run-1:CRITICALITY_ASSESSED:2026-09-10T12:00:00.000Z',
    organizationId: 'org-demo',
    operationId: 'incident-1',
    workflowId: 'operation-org-demo-incident-1',
    runId: 'run-1',
    step: DecisionStep.CRITICALITY_ASSESSED,
    reasoning: 'Location evidence supports the incident report.',
    graphTrace: ['classify', 'gather_evidence', 'validate'],
    toolCalls: [{
      name: 'verify_device_location',
      arguments: { latitude: 26.1655, longitude: 50.547 },
      result: { verificationResult: 'TRUE' },
      failed: false,
    }],
    rule: 'SAFETY_CRITICAL_CONGESTED_SLICE',
    modelId: 'offline-test-classifier',
    occurredAt,
  };
}

// Only the database boundary is mocked. Every assertion exercises the real
// repository's public methods and mapper, without connecting to MongoDB.
function harness(document: Record<string, unknown>) {
  const query = {
    sort: vi.fn().mockReturnThis(),
    skip: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    lean: vi.fn().mockReturnThis(),
    exec: vi.fn().mockResolvedValue([document]),
  };
  const duplicateQuery = {
    lean: vi.fn().mockReturnThis(),
    exec: vi.fn().mockResolvedValue(document),
  };
  const model = {
    create: vi.fn().mockResolvedValue({ toObject: () => document }),
    find: vi.fn().mockReturnValue(query),
    findOne: vi.fn().mockReturnValue(duplicateQuery),
    countDocuments: vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue(1) }),
  };
  return {
    repository: new MongoDecisionLogRepository(model as unknown as Model<DecisionRecordDocument>),
    model,
    query,
  };
}

describe('MongoDecisionLogRepository evidence mapping', () => {
  it('returns the full evidence from append without Mongo bookkeeping', async () => {
    const input = decision();
    const { repository, model } = harness({ ...input, recordedAt, _id: 'mongo-id', __v: 0 });

    const result = await repository.append(input);

    expect(model.create).toHaveBeenCalledWith(input);
    expect(result).toEqual({ record: { ...input, recordedAt }, inserted: true });
  });

  it('preserves evidence when returning an existing record after a retry', async () => {
    const input = decision();
    const { repository, model } = harness({ ...input, recordedAt, _id: 'mongo-id', __v: 0 });
    model.create.mockRejectedValueOnce({ code: 11000 });

    const result = await repository.append(input);

    expect(model.findOne).toHaveBeenCalledWith({
      organizationId: input.organizationId,
      idempotencyKey: input.idempotencyKey,
    });
    expect(result).toEqual({ record: { ...input, recordedAt }, inserted: false });
  });

  it('returns evidence for the requested organization and operation', async () => {
    const input = decision();
    const { repository, model } = harness({ ...input, recordedAt, _id: 'mongo-id', __v: 0 });

    const records = await repository.findByOperation(input.organizationId, input.operationId);

    expect(model.find).toHaveBeenCalledWith({
      organizationId: input.organizationId,
      operationId: input.operationId,
    });
    expect(records).toEqual([{ ...input, recordedAt }]);
  });

  it('preserves evidence and scopes both the page and its total to the organization', async () => {
    const input = decision();
    const { repository, model, query } = harness({ ...input, recordedAt, _id: 'mongo-id', __v: 0 });

    const page = await repository.findAll(input.organizationId, { skip: 2, limit: 5 });

    expect(model.find).toHaveBeenCalledWith({ organizationId: input.organizationId });
    expect(model.countDocuments).toHaveBeenCalledWith({ organizationId: input.organizationId });
    expect(query.skip).toHaveBeenCalledWith(2);
    expect(query.limit).toHaveBeenCalledWith(5);
    expect(page).toEqual({ items: [{ ...input, recordedAt }], total: 1, skip: 2, limit: 5 });
  });

  it('uses occurredAt for older records without recordedAt', async () => {
    const input = decision();
    const { repository } = harness({ ...input, _id: 'mongo-id', __v: 0 });

    expect(await repository.findByOperation(input.organizationId, input.operationId))
      .toEqual([{ ...input, recordedAt: occurredAt }]);
  });

  it('propagates database failures rather than reporting them as duplicate decisions', async () => {
    const { repository, model } = harness({ ...decision(), recordedAt });
    const failure = new Error('Simulated database failure');
    model.create.mockRejectedValueOnce(failure);

    await expect(repository.append(decision())).rejects.toBe(failure);
    expect(model.findOne).not.toHaveBeenCalled();
  });
});
