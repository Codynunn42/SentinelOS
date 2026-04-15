import {
  detectPricingOutliers,
  generatePilotReport,
  type PricingRecord,
  type WorkflowStepRecord,
} from './trigentPilot.js';

export const trigentDemoPricingRecords: PricingRecord[] = [
  {
    assetId: 'tri-asset-001',
    category: 'laptop',
    conditionGrade: 'A',
    quotedPrice: 420,
    historicalMeanPrice: 405,
    actualDispositionPrice: 438,
    workflowStage: 'intake',
  },
  {
    assetId: 'tri-asset-002',
    category: 'laptop',
    conditionGrade: 'B',
    quotedPrice: 190,
    historicalMeanPrice: 285,
    actualDispositionPrice: 304,
    workflowStage: 'grading',
  },
  {
    assetId: 'tri-asset-003',
    category: 'server',
    conditionGrade: 'C',
    quotedPrice: 780,
    historicalMeanPrice: 760,
    actualDispositionPrice: 750,
    workflowStage: 'disposition',
  },
  {
    assetId: 'tri-asset-004',
    category: 'server',
    conditionGrade: 'unknown',
    quotedPrice: 0,
    historicalMeanPrice: 120,
    workflowStage: 'triage',
  },
];

export const trigentDemoWorkflowSteps: WorkflowStepRecord[] = [
  {
    workflowId: 'wf-trigent-demo-001',
    assetId: 'tri-asset-001',
    stage: 'intake',
    status: 'completed',
    operator: 'Geek of Kolachi',
    durationMinutes: 18,
    recordedAt: '2026-04-14T08:00:00.000Z',
  },
  {
    workflowId: 'wf-trigent-demo-001',
    assetId: 'tri-asset-002',
    stage: 'grading',
    status: 'completed',
    operator: 'Lady DEV',
    durationMinutes: 72,
    recordedAt: '2026-04-14T08:45:00.000Z',
  },
  {
    workflowId: 'wf-trigent-demo-001',
    assetId: 'tri-asset-003',
    stage: 'disposition',
    status: 'blocked',
    operator: 'Ops Queue',
    durationMinutes: 133,
    recordedAt: '2026-04-14T11:10:00.000Z',
  },
];

export function buildTrigentPilotDemo() {
  const report = generatePilotReport({
    pricingRecords: trigentDemoPricingRecords,
    workflowSteps: trigentDemoWorkflowSteps,
  });
  const outliers = detectPricingOutliers(trigentDemoPricingRecords);

  return {
    pilot: {
      name: 'Trigent ITAD Pilot Demo',
      focusAreas: ['pricing intelligence', 'workflow execution'],
      targetOutcomes: [
        'Improve pricing accuracy',
        'Reduce manual workflow time',
        'Identify missed margin opportunities',
      ],
    },
    dataset: {
      pricingRecords: trigentDemoPricingRecords,
      workflowSteps: trigentDemoWorkflowSteps,
    },
    analysis: {
      report,
      outliers,
    },
    sampleCommands: {
      pricingValidate: {
        comm: 'Sentinel AI by Cody Nunn | Nunn Cloud',
        session: 'sess_trigent_pricing_validate_001',
        lane: 'command',
        op: 'pricing.validate',
        action: 'validate_pricing_dataset',
        payload: {
          datasetName: 'Trigent pilot dataset',
          records: trigentDemoPricingRecords,
        },
      },
      workflowAnalyze: {
        comm: 'Sentinel AI by Cody Nunn | Nunn Cloud',
        session: 'sess_trigent_workflow_001',
        lane: 'command',
        op: 'workflow.bottleneck.analyze',
        action: 'analyze_workflow_bottlenecks',
        payload: {
          workflowId: 'wf-trigent-demo-001',
          steps: trigentDemoWorkflowSteps,
        },
      },
      reportGenerate: {
        comm: 'Sentinel AI by Cody Nunn | Nunn Cloud',
        session: 'sess_trigent_report_001',
        lane: 'command',
        op: 'report.generate',
        action: 'generate_pilot_report',
        payload: {
          pricingRecords: trigentDemoPricingRecords,
          workflowSteps: trigentDemoWorkflowSteps,
        },
      },
    },
  };
}
