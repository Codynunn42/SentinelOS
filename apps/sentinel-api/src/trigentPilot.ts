export type TrigentConditionGrade = 'A' | 'B' | 'C' | 'D' | 'R2V3' | 'R2V5' | 'unknown';

export type PricingRecord = {
  assetId: string;
  category: string;
  conditionGrade: TrigentConditionGrade;
  quotedPrice: number;
  historicalMeanPrice?: number;
  actualDispositionPrice?: number;
  workflowStage?: string;
};

export type WorkflowStepRecord = {
  workflowId: string;
  assetId?: string;
  stage: string;
  status: 'pending' | 'in_progress' | 'completed' | 'blocked';
  operator?: string;
  durationMinutes?: number;
  recordedAt: string;
};

type PricingValidationIssue = {
  assetId: string;
  severity: 'info' | 'warning' | 'critical';
  code:
    | 'PRICE_NON_POSITIVE'
    | 'CONDITION_UNKNOWN'
    | 'QUOTE_DEVIATES_FROM_HISTORY'
    | 'MARGIN_OPPORTUNITY'
    | 'UNDERPRICED_DISPOSITION';
  message: string;
};

type PricingSummary = {
  datasetSize: number;
  averageQuotedPrice: number;
  averageHistoricalPrice: number | null;
  averageDispositionPrice: number | null;
  accuracyRate: number | null;
  issueCounts: {
    critical: number;
    warning: number;
    info: number;
  };
};

type WorkflowBottleneck = {
  stage: string;
  averageDurationMinutes: number;
  occurrences: number;
  risk: 'normal' | 'watch' | 'critical';
};

const workflowStepStore: WorkflowStepRecord[] = [];

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function average(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  return round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function deviationRatio(actual: number, baseline: number): number {
  if (baseline <= 0) {
    return 0;
  }

  return Math.abs(actual - baseline) / baseline;
}

export function validatePricingRecords(records: PricingRecord[]): {
  summary: PricingSummary;
  issues: PricingValidationIssue[];
} {
  const issues: PricingValidationIssue[] = [];
  const historicalPrices: number[] = [];
  const dispositionPrices: number[] = [];
  const quotedPrices: number[] = [];
  let accurateCount = 0;
  let accuracyDenominator = 0;

  for (const record of records) {
    quotedPrices.push(record.quotedPrice);

    if (record.historicalMeanPrice !== undefined) {
      historicalPrices.push(record.historicalMeanPrice);
      const ratio = deviationRatio(record.quotedPrice, record.historicalMeanPrice);
      if (ratio > 0.2) {
        issues.push({
          assetId: record.assetId,
          severity: ratio > 0.35 ? 'critical' : 'warning',
          code: 'QUOTE_DEVIATES_FROM_HISTORY',
          message: `Quoted price deviates ${round(ratio * 100)}% from historical average.`,
        });
      }
    }

    if (record.actualDispositionPrice !== undefined) {
      dispositionPrices.push(record.actualDispositionPrice);
      accuracyDenominator += 1;
      if (deviationRatio(record.quotedPrice, record.actualDispositionPrice) <= 0.1) {
        accurateCount += 1;
      } else if (record.actualDispositionPrice > record.quotedPrice * 1.15) {
        issues.push({
          assetId: record.assetId,
          severity: 'warning',
          code: 'MARGIN_OPPORTUNITY',
          message: 'Disposition value materially exceeded quoted price, indicating missed margin.',
        });
      } else if (record.actualDispositionPrice < record.quotedPrice * 0.85) {
        issues.push({
          assetId: record.assetId,
          severity: 'warning',
          code: 'UNDERPRICED_DISPOSITION',
          message: 'Quoted price materially exceeded realized disposition value.',
        });
      }
    }

    if (record.quotedPrice <= 0) {
      issues.push({
        assetId: record.assetId,
        severity: 'critical',
        code: 'PRICE_NON_POSITIVE',
        message: 'Quoted price must be greater than zero.',
      });
    }

    if (record.conditionGrade === 'unknown') {
      issues.push({
        assetId: record.assetId,
        severity: 'info',
        code: 'CONDITION_UNKNOWN',
        message: 'Condition grade is unknown and may reduce pricing confidence.',
      });
    }
  }

  return {
    summary: {
      datasetSize: records.length,
      averageQuotedPrice: average(quotedPrices) ?? 0,
      averageHistoricalPrice: average(historicalPrices),
      averageDispositionPrice: average(dispositionPrices),
      accuracyRate: accuracyDenominator > 0 ? round((accurateCount / accuracyDenominator) * 100) : null,
      issueCounts: {
        critical: issues.filter((issue) => issue.severity === 'critical').length,
        warning: issues.filter((issue) => issue.severity === 'warning').length,
        info: issues.filter((issue) => issue.severity === 'info').length,
      },
    },
    issues,
  };
}

export function detectPricingOutliers(records: PricingRecord[]): {
  groupsAnalyzed: number;
  outliers: Array<{
    assetId: string;
    category: string;
    conditionGrade: string;
    quotedPrice: number;
    groupAveragePrice: number;
    deviationPercent: number;
  }>;
} {
  const groups = new Map<string, PricingRecord[]>();

  for (const record of records) {
    const key = `${record.category}::${record.conditionGrade}`;
    const existing = groups.get(key);
    if (existing) {
      existing.push(record);
    } else {
      groups.set(key, [record]);
    }
  }

  const outliers: Array<{
    assetId: string;
    category: string;
    conditionGrade: string;
    quotedPrice: number;
    groupAveragePrice: number;
    deviationPercent: number;
  }> = [];

  for (const [key, group] of groups.entries()) {
    const groupAverage = average(group.map((record) => record.quotedPrice));
    if (groupAverage === null || groupAverage <= 0) {
      continue;
    }

    const [category, conditionGrade] = key.split('::');
    for (const record of group) {
      const deviationPercent = round(deviationRatio(record.quotedPrice, groupAverage) * 100);
      if (deviationPercent >= 30) {
        outliers.push({
          assetId: record.assetId,
          category,
          conditionGrade,
          quotedPrice: record.quotedPrice,
          groupAveragePrice: groupAverage,
          deviationPercent,
        });
      }
    }
  }

  return {
    groupsAnalyzed: groups.size,
    outliers,
  };
}

export function recordWorkflowStep(step: WorkflowStepRecord): WorkflowStepRecord {
  workflowStepStore.push(step);
  return step;
}

export function analyzeWorkflowBottlenecks(args: {
  workflowId?: string;
  steps?: WorkflowStepRecord[];
}): {
  totalSteps: number;
  bottlenecks: WorkflowBottleneck[];
  longestStage: WorkflowBottleneck | null;
} {
  const input =
    args.steps && args.steps.length > 0
      ? args.steps
      : workflowStepStore.filter((step) => !args.workflowId || step.workflowId === args.workflowId);

  const byStage = new Map<string, number[]>();
  for (const step of input) {
    if (typeof step.durationMinutes !== 'number' || !Number.isFinite(step.durationMinutes)) {
      continue;
    }
    const existing = byStage.get(step.stage);
    if (existing) {
      existing.push(step.durationMinutes);
    } else {
      byStage.set(step.stage, [step.durationMinutes]);
    }
  }

  const bottlenecks: WorkflowBottleneck[] = Array.from(byStage.entries())
    .map(([stage, durations]) => {
      const avg = average(durations) ?? 0;
      return {
        stage,
        averageDurationMinutes: avg,
        occurrences: durations.length,
        risk: avg >= 120 ? 'critical' : avg >= 45 ? 'watch' : 'normal',
      };
    })
    .sort((a, b) => b.averageDurationMinutes - a.averageDurationMinutes);

  return {
    totalSteps: input.length,
    bottlenecks,
    longestStage: bottlenecks[0] ?? null,
  };
}

export function generatePilotReport(args: {
  pricingRecords: PricingRecord[];
  workflowSteps: WorkflowStepRecord[];
}): {
  pricing: ReturnType<typeof validatePricingRecords>['summary'];
  workflow: ReturnType<typeof analyzeWorkflowBottlenecks>;
  recommendations: string[];
} {
  const pricing = validatePricingRecords(args.pricingRecords).summary;
  const workflow = analyzeWorkflowBottlenecks({ steps: args.workflowSteps });
  const recommendations: string[] = [];

  if ((pricing.accuracyRate ?? 100) < 85) {
    recommendations.push('Review pricing rules for categories with lower-than-target quote accuracy.');
  }
  if (pricing.issueCounts.warning > 0 || pricing.issueCounts.critical > 0) {
    recommendations.push('Audit flagged records to recover missed margin and reduce inconsistent quotes.');
  }
  if ((workflow.longestStage?.averageDurationMinutes ?? 0) >= 45) {
    recommendations.push(`Reduce time spent in ${workflow.longestStage?.stage ?? 'the longest stage'} through automation or operator handoff rules.`);
  }
  if (recommendations.length === 0) {
    recommendations.push('Pilot data is healthy; expand sample size to validate the same trends at production volume.');
  }

  return {
    pricing,
    workflow,
    recommendations,
  };
}

export function resetTrigentPilotState(): void {
  workflowStepStore.length = 0;
}
