import type {
  SentinelCommandEnvelope,
  SentinelCommandHandler,
  SentinelOperation,
} from './sentinelCommandTypes.js';
import {
  handleRepoOptimize,
  handleCiPrComment,
  handleCiPrStatus,
  handleCiPrSummarizeFailures,
  handleCiRunsCancelStale,
  handleCiRunsQuery,
  handleCiRunsRerunFailed,
} from './ciCommandHandlers.js';
import {
  handlePricingOutliersDetect,
  handlePricingValidate,
  handleReportGenerate,
  handleWorkflowBottleneckAnalyze,
  handleWorkflowStepRecord,
} from './pilotCommandHandlers.js';

type SentinelCommandDefinition = {
  roles: string[];
  otpRequired: boolean;
  handler?: SentinelCommandHandler;
};

function getPayloadArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === 'string');
}

function normalizeEnvelope(
  envelope: SentinelCommandEnvelope,
  defaults: { role: string[]; ack?: boolean; auth?: boolean; otp?: boolean }
): SentinelCommandEnvelope {
  return {
    ...envelope,
    requires: {
      ...envelope.requires,
      auth: defaults.auth ?? envelope.requires?.auth ?? true,
      ack: defaults.ack ?? envelope.requires?.ack ?? true,
      otp: defaults.otp ?? envelope.requires?.otp ?? false,
      role: defaults.role,
    },
  };
}

const handleBillingReportsQuery: SentinelCommandHandler = async ({ envelope, identity, ack }) => {
  const status = typeof envelope.payload.status === 'string' ? envelope.payload.status : null;
  const limit = typeof envelope.payload.limit === 'number' ? envelope.payload.limit : 25;

  return {
    status: 'accepted',
    data: {
      ack,
      operation: 'billing.reports.query',
      filters: {
        status,
        limit,
      },
      reports: [],
      meta: {
        actorId: identity.actorId,
        operator: identity.operator,
      },
    },
  };
};

const handleBillingReportsRetry: SentinelCommandHandler = async ({ envelope, identity, ack }) => {
  return {
    status: 'accepted',
    data: {
      ack,
      operation: 'billing.reports.retry',
      identifiers: getPayloadArray(envelope.payload.identifiers),
      request: envelope.payload,
      meta: {
        actorId: identity.actorId,
        operator: identity.operator,
      },
    },
  };
};

const handleBillingReportsReconcile: SentinelCommandHandler = async ({ envelope, identity, ack }) => {
  return {
    status: 'accepted',
    data: {
      ack,
      operation: 'billing.reports.reconcile',
      identifiers: getPayloadArray(envelope.payload.identifiers),
      dryRun: envelope.payload.dryRun === true,
      request: envelope.payload,
      meta: {
        actorId: identity.actorId,
        operator: identity.operator,
      },
    },
  };
};

const handleGovernanceApprove: SentinelCommandHandler = async ({ envelope, identity, ack }) => {
  return {
    status: 'accepted',
    data: {
      ack,
      operation: 'governance.approve',
      message: 'Governance approval command accepted for future execution flow.',
      request: envelope.payload,
      meta: {
        actorId: identity.actorId,
        operator: identity.operator,
      },
    },
  };
};

export const commandRegistry: Record<SentinelOperation, SentinelCommandDefinition> = {
  'billing.finalize_usage': {
    roles: [],
    otpRequired: false,
  },
  'billing.reports.query': {
    roles: ['billing.operator', 'billing.admin'],
    otpRequired: false,
    handler: handleBillingReportsQuery,
  },
  'billing.reports.retry': {
    roles: ['billing.admin'],
    otpRequired: false,
    handler: handleBillingReportsRetry,
  },
  'pricing.validate': {
    roles: ['billing.operator', 'billing.admin'],
    otpRequired: false,
    handler: handlePricingValidate,
  },
  'pricing.outliers.detect': {
    roles: ['billing.operator', 'billing.admin'],
    otpRequired: false,
    handler: handlePricingOutliersDetect,
  },
  'workflow.step.record': {
    roles: ['billing.operator', 'billing.admin'],
    otpRequired: false,
    handler: handleWorkflowStepRecord,
  },
  'workflow.bottleneck.analyze': {
    roles: ['billing.operator', 'billing.admin'],
    otpRequired: false,
    handler: handleWorkflowBottleneckAnalyze,
  },
  'report.generate': {
    roles: ['billing.operator', 'billing.admin'],
    otpRequired: false,
    handler: handleReportGenerate,
  },
  'repo.optimize': {
    roles: ['billing.admin'],
    otpRequired: true,
    handler: handleRepoOptimize,
  },
  'billing.reports.reconcile': {
    roles: ['billing.admin'],
    otpRequired: false,
    handler: handleBillingReportsReconcile,
  },
  'ci.runs.query': {
    roles: ['billing.operator', 'billing.admin'],
    otpRequired: false,
    handler: handleCiRunsQuery,
  },
  'ci.runs.rerun_failed': {
    roles: ['billing.admin'],
    otpRequired: false,
    handler: handleCiRunsRerunFailed,
  },
  'ci.pr.status': {
    roles: ['billing.operator', 'billing.admin'],
    otpRequired: false,
    handler: handleCiPrStatus,
  },
  'ci.pr.summarize_failures': {
    roles: ['billing.operator', 'billing.admin'],
    otpRequired: false,
    handler: handleCiPrSummarizeFailures,
  },
  'ci.pr.comment': {
    roles: ['billing.operator', 'billing.admin'],
    otpRequired: false,
    handler: handleCiPrComment,
  },
  'ci.runs.cancel_stale': {
    roles: ['billing.admin'],
    otpRequired: false,
    handler: handleCiRunsCancelStale,
  },
  'vault.write': {
    roles: [],
    otpRequired: true,
  },
  'dns.update': {
    roles: [],
    otpRequired: true,
  },
  'payroll.run': {
    roles: [],
    otpRequired: true,
  },
  'docs.generate': {
    roles: [],
    otpRequired: false,
  },
  'governance.approve': {
    roles: ['billing.admin'],
    otpRequired: true,
    handler: handleGovernanceApprove,
  },
};

export function getCommandHandler(operation: SentinelOperation): SentinelCommandHandler | null {
  return commandRegistry[operation].handler ?? null;
}

export function hydrateEnvelopeRequirements(envelope: SentinelCommandEnvelope): SentinelCommandEnvelope {
  const definition = commandRegistry[envelope.op];

  return normalizeEnvelope(envelope, {
    role: definition.roles,
    otp: definition.otpRequired,
  });
}
