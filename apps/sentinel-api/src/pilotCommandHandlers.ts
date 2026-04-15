import type {
  PricingRecordPayload,
  PricingValidatePayload,
  ReportGeneratePayload,
  SentinelCommandHandler,
  WorkflowBottleneckAnalyzePayload,
  WorkflowStepRecordPayload,
} from './sentinelCommandTypes.js';
import {
  analyzeWorkflowBottlenecks,
  detectPricingOutliers,
  generatePilotReport,
  recordWorkflowStep,
  validatePricingRecords,
} from './trigentPilot.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseConditionGrade(value: unknown): PricingRecordPayload['conditionGrade'] {
  return value === 'A' || value === 'B' || value === 'C' || value === 'D' || value === 'R2V3' || value === 'R2V5'
    ? value
    : 'unknown';
}

function parsePricingRecord(value: unknown): PricingRecordPayload {
  if (!isRecord(value)) {
    throw new Error('pricing record must be an object');
  }

  const assetId = typeof value.assetId === 'string' ? value.assetId.trim() : '';
  const category = typeof value.category === 'string' ? value.category.trim() : '';
  const quotedPrice = typeof value.quotedPrice === 'number' && Number.isFinite(value.quotedPrice) ? value.quotedPrice : NaN;

  if (!assetId) {
    throw new Error('assetId is required for every pricing record');
  }
  if (!category) {
    throw new Error('category is required for every pricing record');
  }
  if (!Number.isFinite(quotedPrice)) {
    throw new Error('quotedPrice must be a finite number for every pricing record');
  }

  return {
    assetId,
    category,
    conditionGrade: parseConditionGrade(value.conditionGrade),
    quotedPrice,
    historicalMeanPrice:
      typeof value.historicalMeanPrice === 'number' && Number.isFinite(value.historicalMeanPrice)
        ? value.historicalMeanPrice
        : undefined,
    actualDispositionPrice:
      typeof value.actualDispositionPrice === 'number' && Number.isFinite(value.actualDispositionPrice)
        ? value.actualDispositionPrice
        : undefined,
    workflowStage: typeof value.workflowStage === 'string' ? value.workflowStage.trim() || undefined : undefined,
  };
}

function parsePricingValidatePayload(payload: Record<string, unknown>): PricingValidatePayload {
  const records = Array.isArray(payload.records) ? payload.records.map(parsePricingRecord) : [];
  if (records.length === 0) {
    throw new Error('records must contain at least one pricing record');
  }

  return {
    datasetName: typeof payload.datasetName === 'string' ? payload.datasetName.trim() || undefined : undefined,
    records,
  };
}

function parseWorkflowStepRecord(value: unknown): WorkflowStepRecordPayload {
  if (!isRecord(value)) {
    throw new Error('workflow step must be an object');
  }

  const workflowId = typeof value.workflowId === 'string' ? value.workflowId.trim() : '';
  const stage = typeof value.stage === 'string' ? value.stage.trim() : '';
  const status =
    value.status === 'pending' || value.status === 'in_progress' || value.status === 'completed' || value.status === 'blocked'
      ? value.status
      : null;

  if (!workflowId) {
    throw new Error('workflowId is required');
  }
  if (!stage) {
    throw new Error('stage is required');
  }
  if (!status) {
    throw new Error('status must be pending, in_progress, completed, or blocked');
  }

  return {
    workflowId,
    assetId: typeof value.assetId === 'string' ? value.assetId.trim() || undefined : undefined,
    stage,
    status,
    operator: typeof value.operator === 'string' ? value.operator.trim() || undefined : undefined,
    durationMinutes:
      typeof value.durationMinutes === 'number' && Number.isFinite(value.durationMinutes)
        ? value.durationMinutes
        : undefined,
    recordedAt: typeof value.recordedAt === 'string' ? value.recordedAt : undefined,
  };
}

function parseWorkflowBottleneckAnalyzePayload(payload: Record<string, unknown>): WorkflowBottleneckAnalyzePayload {
  return {
    workflowId: typeof payload.workflowId === 'string' ? payload.workflowId.trim() || undefined : undefined,
    steps: Array.isArray(payload.steps) ? payload.steps.map(parseWorkflowStepRecord) : undefined,
  };
}

function parseReportGeneratePayload(payload: Record<string, unknown>): ReportGeneratePayload {
  const pricingRecords = Array.isArray(payload.pricingRecords) ? payload.pricingRecords.map(parsePricingRecord) : [];
  const workflowSteps = Array.isArray(payload.workflowSteps) ? payload.workflowSteps.map(parseWorkflowStepRecord) : [];

  if (pricingRecords.length === 0) {
    throw new Error('pricingRecords must contain at least one record');
  }
  if (workflowSteps.length === 0) {
    throw new Error('workflowSteps must contain at least one step');
  }

  return {
    pricingRecords,
    workflowSteps,
  };
}

export const handlePricingValidate: SentinelCommandHandler = async ({ envelope, ack, identity }) => {
  const payload = parsePricingValidatePayload(isRecord(envelope.payload) ? envelope.payload : {});
  const validation = validatePricingRecords(payload.records);

  return {
    status: 'accepted',
    data: {
      ack,
      operation: 'pricing.validate',
      datasetName: payload.datasetName ?? null,
      summary: validation.summary,
      issues: validation.issues,
      meta: {
        actorId: identity.actorId,
        operator: identity.operator,
      },
    },
  };
};

export const handlePricingOutliersDetect: SentinelCommandHandler = async ({ envelope, ack, identity }) => {
  const payload = parsePricingValidatePayload(isRecord(envelope.payload) ? envelope.payload : {});
  const outliers = detectPricingOutliers(payload.records);

  return {
    status: 'accepted',
    data: {
      ack,
      operation: 'pricing.outliers.detect',
      datasetName: payload.datasetName ?? null,
      groupsAnalyzed: outliers.groupsAnalyzed,
      outliers: outliers.outliers,
      meta: {
        actorId: identity.actorId,
        operator: identity.operator,
      },
    },
  };
};

export const handleWorkflowStepRecord: SentinelCommandHandler = async ({ envelope, ack, identity }) => {
  const payload = parseWorkflowStepRecord(isRecord(envelope.payload) ? envelope.payload : {});
  const recorded = recordWorkflowStep({
    ...payload,
    operator: payload.operator ?? identity.operator ?? identity.actorId,
    recordedAt: payload.recordedAt ?? new Date().toISOString(),
  });

  return {
    status: 'executed',
    data: {
      ack,
      operation: 'workflow.step.record',
      step: recorded,
      meta: {
        actorId: identity.actorId,
        operator: identity.operator,
      },
    },
  };
};

export const handleWorkflowBottleneckAnalyze: SentinelCommandHandler = async ({ envelope, ack, identity }) => {
  const payload = parseWorkflowBottleneckAnalyzePayload(isRecord(envelope.payload) ? envelope.payload : {});
  const analysis = analyzeWorkflowBottlenecks({
    workflowId: payload.workflowId,
    steps: payload.steps?.map((step) => ({
      ...step,
      recordedAt: step.recordedAt ?? new Date().toISOString(),
    })),
  });

  return {
    status: 'accepted',
    data: {
      ack,
      operation: 'workflow.bottleneck.analyze',
      workflowId: payload.workflowId ?? null,
      analysis,
      meta: {
        actorId: identity.actorId,
        operator: identity.operator,
      },
    },
  };
};

export const handleReportGenerate: SentinelCommandHandler = async ({ envelope, ack, identity }) => {
  const payload = parseReportGeneratePayload(isRecord(envelope.payload) ? envelope.payload : {});
  const report = generatePilotReport({
    pricingRecords: payload.pricingRecords,
    workflowSteps: payload.workflowSteps.map((step) => ({
      ...step,
      recordedAt: step.recordedAt ?? new Date().toISOString(),
    })),
  });

  return {
    status: 'accepted',
    data: {
      ack,
      operation: 'report.generate',
      report,
      meta: {
        actorId: identity.actorId,
        operator: identity.operator,
      },
    },
  };
};
