export const SENTINEL_COMM = 'Sentinel AI by Cody Nunn | Nunn Cloud' as const;

export type SentinelLane = 'conversational' | 'command';

export type SentinelOperation =
  | 'billing.finalize_usage'
  | 'billing.reports.query'
  | 'billing.reports.retry'
  | 'billing.reports.reconcile'
  | 'pricing.validate'
  | 'pricing.outliers.detect'
  | 'workflow.step.record'
  | 'workflow.bottleneck.analyze'
  | 'report.generate'
  | 'repo.optimize'
  | 'ci.runs.query'
  | 'ci.runs.rerun_failed'
  | 'ci.pr.status'
  | 'ci.pr.summarize_failures'
  | 'ci.pr.comment'
  | 'ci.runs.cancel_stale'
  | 'vault.write'
  | 'dns.update'
  | 'payroll.run'
  | 'docs.generate'
  | 'governance.approve';

export type CiRunsQueryPayload = {
  repo: string;
  workflow?: string;
  branch?: string;
  status?: 'queued' | 'in_progress' | 'completed';
  limit?: number;
};

export type CiPrStatusPayload = {
  repo: string;
  prNumber: number;
};

export type CiRunsRerunFailedPayload = {
  repo: string;
  prNumber?: number;
  runIds?: number[];
  workflow?: string;
};

export type CiPrSummarizeFailuresPayload = {
  repo: string;
  prNumber: number;
  includeRunning?: boolean;
};

export type CiPrCommentPayload = {
  repo: string;
  prNumber: number;
  body: string;
};

export type CiRunsCancelStalePayload = {
  repo: string;
  workflow?: string;
  branch?: string;
  keepLatest?: number;
};

export type RepoOptimizeAction = 'analyze' | 'lint-fix' | 'test' | 'commit' | 'report';

export type RepoOptimizePayload = {
  repo: string;
  ref?: string;
  actions: RepoOptimizeAction[];
  summary?: string;
  requestedBy?: string;
};

export type PricingRecordPayload = {
  assetId: string;
  category: string;
  conditionGrade: 'A' | 'B' | 'C' | 'D' | 'R2V3' | 'R2V5' | 'unknown';
  quotedPrice: number;
  historicalMeanPrice?: number;
  actualDispositionPrice?: number;
  workflowStage?: string;
};

export type PricingValidatePayload = {
  datasetName?: string;
  records: PricingRecordPayload[];
};

export type PricingOutlierDetectPayload = PricingValidatePayload;

export type WorkflowStepRecordPayload = {
  workflowId: string;
  assetId?: string;
  stage: string;
  status: 'pending' | 'in_progress' | 'completed' | 'blocked';
  operator?: string;
  durationMinutes?: number;
  recordedAt?: string;
};

export type WorkflowBottleneckAnalyzePayload = {
  workflowId?: string;
  steps?: WorkflowStepRecordPayload[];
};

export type ReportGeneratePayload = {
  pricingRecords: PricingRecordPayload[];
  workflowSteps: WorkflowStepRecordPayload[];
};

export type SentinelCommandRequirements = {
  auth?: boolean;
  role?: string[];
  otp?: boolean;
  ack?: boolean;
};

export type SentinelCommandEnvelope = {
  comm: typeof SENTINEL_COMM;
  session: string;
  kid?: string;
  lane: SentinelLane;
  op: SentinelOperation;
  action: string;
  requires?: SentinelCommandRequirements;
  otp?: string;
  payload: Record<string, unknown>;
};

export type SentinelCommandStatus = 'accepted' | 'denied' | 'executed' | 'failed';

export type SentinelCommandReceipt = {
  ack: string;
  receiptId: string;
  session: string;
  lane: SentinelLane;
  op: SentinelOperation;
  action: string;

  actorId: string;
  operator: string;
  tenantId: string;
  authSource: 'azure';

  payloadHash: string;
  resultHash?: string | null;

  status: SentinelCommandStatus;
  requiresOtp: boolean;
  otpVerified: boolean;

  errorCode?: string | null;
  errorMessage?: string | null;

  createdAt: string;
  executedAt?: string | null;
};

export interface SentinelCommandStore {
  insert(receipt: SentinelCommandReceipt): Promise<void>;
  getByAck(ack: string): Promise<SentinelCommandReceipt | null>;
  list(limit: number): Promise<SentinelCommandReceipt[]>;
  updateStatus(args: {
    ack: string;
    status: SentinelCommandStatus;
    resultHash?: string | null;
    executedAt?: string | null;
    errorCode?: string | null;
    errorMessage?: string | null;
  }): Promise<void>;
}

export type SentinelCommandSuccess = {
  ok: true;
  comm: typeof SENTINEL_COMM;
  op: SentinelOperation;
  status: 'accepted' | 'executed';
  ack: string;
  data: unknown;
  meta: {
    timestamp: string;
    operator: string | null;
    tenantId: string;
    actorId: string;
    lane: SentinelLane;
    receiptId: string;
    roles: string[];
  };
};

export type SentinelCommandDenied = {
  ok: false;
  comm: typeof SENTINEL_COMM;
  op: SentinelOperation;
  status: 'denied' | 'failed';
  ack: string;
  error: {
    code: string;
    message: string;
  };
  meta: {
    timestamp: string;
    operator?: string | null;
    tenantId?: string;
    actorId?: string;
    lane: SentinelLane;
    receiptId: string;
    roles?: string[];
  };
};

export type SentinelCommandResponse = SentinelCommandSuccess | SentinelCommandDenied;

export type SentinelCommandHandlerResult = {
  status: 'accepted' | 'executed';
  data: unknown;
};

export type SentinelCommandHandler = (args: {
  envelope: SentinelCommandEnvelope;
  identity: Express.SentinelIdentity;
  ack: string;
}) => Promise<SentinelCommandHandlerResult>;
