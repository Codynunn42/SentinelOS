import * as assert from 'node:assert/strict';
import { getInMemoryCommandReceipt } from '../sentinelCommandLedger.js';
import { resetGithubCiProvider } from '../githubCiProvider.js';
import { SENTINEL_COMM } from '../sentinelCommandTypes.js';
import { resetTrigentPilotState } from '../trigentPilot.js';

type JsonRecord = Record<string, unknown>;

function buildEnvelope(args: {
  session: string;
  op: string;
  action: string;
  role: string[];
  payload: Record<string, unknown>;
  otp?: string;
}) {
  return {
    comm: SENTINEL_COMM,
    session: args.session,
    lane: 'command',
    op: args.op,
    action: args.action,
    requires: {
      auth: true,
      role: args.role,
      ack: true,
      otp: Boolean(args.otp),
    },
    otp: args.otp,
    payload: args.payload,
  };
}

async function postCommand(args: {
  port: number;
  envelope: Record<string, unknown>;
  roleHeader: string;
}) {
  const response = await fetch(`http://127.0.0.1:${args.port}/v1/command`, {
    method: 'POST',
    signal: AbortSignal.timeout(3000),
    headers: {
      'content-type': 'application/json',
      'x-sentinel-smoke-role': args.roleHeader,
      'x-sentinel-smoke-actor': 'sentinel-test-actor',
      'x-sentinel-smoke-tenant': 'sentinel-test-tenant',
    },
    body: JSON.stringify(args.envelope),
  });

  const json = (await response.json()) as JsonRecord;
  return { response, json };
}

export async function runCommandSmokeTest(): Promise<void> {
  process.env.SENTINEL_SMOKE_AUTH = '1';
  process.env.SENTINEL_COMMAND_OTP = '246810';
  process.env.PORT = '0';
  resetGithubCiProvider();
  resetTrigentPilotState();

  const { default: app } = await import('../index.js');
  const server = await new Promise<import('node:http').Server>((resolve) => {
    const instance = app.listen(0, () => resolve(instance));
  });

  try {
    const addr = server.address();
    const port = typeof addr === 'string' ? 0 : (addr?.port ?? 0);
    assert.notEqual(port, 0);

    console.log('Sentinel command smoke: billing.reports.query');
    const billingQuery = await postCommand({
      port,
      roleHeader: 'billing.operator',
      envelope: buildEnvelope({
        session: 'sess_smoke_001',
        op: 'billing.reports.query',
        action: 'query_reports',
        role: ['billing.operator', 'billing.admin'],
        payload: { limit: 10 },
      }),
    });

    assert.equal(billingQuery.response.status, 200);
    assert.equal(billingQuery.json.comm, SENTINEL_COMM);
    assert.equal(billingQuery.json.op, 'billing.reports.query');
    assert.equal(billingQuery.json.status, 'accepted');
    assert.match(String(billingQuery.json.ack), /^ack_/);
    assert.ok((billingQuery.json.meta as JsonRecord).timestamp);
    const queryReceipt = getInMemoryCommandReceipt(String(billingQuery.json.ack));
    assert.ok(queryReceipt);
    assert.match(String(queryReceipt?.receiptId), /^cmdrcpt_/);
    assert.ok(queryReceipt?.payloadHash);

    console.log('Sentinel command smoke: billing.reports.retry denied');
    const billingRetryDenied = await postCommand({
      port,
      roleHeader: 'billing.operator',
      envelope: buildEnvelope({
        session: 'sess_smoke_002',
        op: 'billing.reports.retry',
        action: 'retry_failed_reports',
        role: ['billing.admin'],
        payload: { identifiers: ['rcpt_test_001'] },
      }),
    });

    assert.equal(billingRetryDenied.response.status, 403);
    assert.equal(billingRetryDenied.json.comm, SENTINEL_COMM);
    assert.equal(billingRetryDenied.json.op, 'billing.reports.retry');
    assert.equal(billingRetryDenied.json.status, 'denied');
    assert.match(String(billingRetryDenied.json.ack), /^ack_/);
    assert.ok((billingRetryDenied.json.meta as JsonRecord).timestamp);
    const retryReceipt = getInMemoryCommandReceipt(String(billingRetryDenied.json.ack));
    assert.ok(retryReceipt);
    assert.equal(retryReceipt?.status, 'denied');
    assert.ok(retryReceipt?.payloadHash);

    console.log('Sentinel command smoke: privileged ops deny without OTP');
    for (const operation of ['vault.write', 'dns.update', 'payroll.run'] as const) {
      const privilegedDenied = await postCommand({
        port,
        roleHeader: 'billing.admin',
        envelope: buildEnvelope({
          session: `sess_smoke_${operation}`,
          op: operation,
          action: `test_${operation.replace('.', '_')}`,
          role: ['billing.admin'],
          payload: { target: `${operation}-target` },
        }),
      });

      assert.equal(privilegedDenied.response.status, 403);
      assert.equal(privilegedDenied.json.comm, SENTINEL_COMM);
      assert.equal(privilegedDenied.json.op, operation);
      assert.equal(privilegedDenied.json.status, 'denied');
      assert.equal((privilegedDenied.json.error as JsonRecord).code, 'SENTINEL_OTP_REQUIRED');
      const privilegedDeniedReceipt = getInMemoryCommandReceipt(String(privilegedDenied.json.ack));
      assert.ok(privilegedDeniedReceipt);
      assert.equal(privilegedDeniedReceipt?.status, 'denied');
      assert.equal(privilegedDeniedReceipt?.otpVerified, false);
    }

    console.log('Sentinel command smoke: privileged ops reach handler gate after OTP');
    for (const operation of ['vault.write', 'dns.update', 'payroll.run'] as const) {
      const privilegedWithOtp = await postCommand({
        port,
        roleHeader: 'billing.admin',
        envelope: buildEnvelope({
          session: `sess_smoke_${operation}_otp`,
          op: operation,
          action: `test_${operation.replace('.', '_')}_otp`,
          role: ['billing.admin'],
          otp: '246810',
          payload: { target: `${operation}-target` },
        }),
      });

      assert.equal(privilegedWithOtp.response.status, 501);
      assert.equal(privilegedWithOtp.json.comm, SENTINEL_COMM);
      assert.equal(privilegedWithOtp.json.op, operation);
      assert.equal(privilegedWithOtp.json.status, 'failed');
      assert.equal((privilegedWithOtp.json.error as JsonRecord).code, 'SENTINEL_OPERATION_UNIMPLEMENTED');
      const privilegedWithOtpReceipt = getInMemoryCommandReceipt(String(privilegedWithOtp.json.ack));
      assert.ok(privilegedWithOtpReceipt);
      assert.equal(privilegedWithOtpReceipt?.status, 'failed');
      assert.equal(privilegedWithOtpReceipt?.otpVerified, true);
    }

    console.log('Sentinel command smoke: governance.approve denied without OTP');
    const governanceDenied = await postCommand({
      port,
      roleHeader: 'billing.admin',
      envelope: buildEnvelope({
        session: 'sess_smoke_003',
        op: 'governance.approve',
        action: 'approve_change',
        role: ['billing.admin'],
        payload: { changeId: 'chg_001' },
      }),
    });

    assert.equal(governanceDenied.response.status, 403);
    assert.equal(governanceDenied.json.comm, SENTINEL_COMM);
    assert.equal(governanceDenied.json.op, 'governance.approve');
    assert.equal(governanceDenied.json.status, 'denied');
    assert.match(String(governanceDenied.json.ack), /^ack_/);
    assert.ok((governanceDenied.json.meta as JsonRecord).timestamp);
    const governanceReceipt = getInMemoryCommandReceipt(String(governanceDenied.json.ack));
    assert.ok(governanceReceipt);
    assert.equal(governanceReceipt?.status, 'denied');

    console.log('Sentinel command smoke: governance.approve accepted with OTP');
    const governanceApproved = await postCommand({
      port,
      roleHeader: 'billing.admin',
      envelope: buildEnvelope({
        session: 'sess_smoke_003b',
        op: 'governance.approve',
        action: 'approve_change',
        role: ['billing.admin'],
        otp: '246810',
        payload: { changeId: 'chg_002', decision: 'approve' },
      }),
    });

    assert.equal(governanceApproved.response.status, 200);
    assert.equal(governanceApproved.json.comm, SENTINEL_COMM);
    assert.equal(governanceApproved.json.op, 'governance.approve');
    assert.equal(governanceApproved.json.status, 'accepted');
    assert.match(String(governanceApproved.json.ack), /^ack_/);
    const governanceApprovedReceipt = getInMemoryCommandReceipt(String(governanceApproved.json.ack));
    assert.ok(governanceApprovedReceipt);
    assert.equal(governanceApprovedReceipt?.status, 'accepted');
    assert.equal(governanceApprovedReceipt?.otpVerified, true);

    const trigentPricingDataset = [
      {
        assetId: 'asset-001',
        category: 'laptop',
        conditionGrade: 'A',
        quotedPrice: 420,
        historicalMeanPrice: 410,
        actualDispositionPrice: 435,
        workflowStage: 'intake',
      },
      {
        assetId: 'asset-002',
        category: 'laptop',
        conditionGrade: 'B',
        quotedPrice: 190,
        historicalMeanPrice: 285,
        actualDispositionPrice: 305,
        workflowStage: 'grading',
      },
      {
        assetId: 'asset-003',
        category: 'server',
        conditionGrade: 'unknown',
        quotedPrice: 0,
        historicalMeanPrice: 120,
        workflowStage: 'triage',
      },
    ];

    console.log('Sentinel command smoke: pricing.validate operator');
    const pricingValidate = await postCommand({
      port,
      roleHeader: 'billing.operator',
      envelope: buildEnvelope({
        session: 'sess_smoke_trigent_001',
        op: 'pricing.validate',
        action: 'validate_pricing_dataset',
        role: ['billing.operator', 'billing.admin'],
        payload: {
          datasetName: 'Trigent pilot dataset',
          records: trigentPricingDataset,
        },
      }),
    });
    assert.equal(pricingValidate.response.status, 200);
    assert.equal(pricingValidate.json.op, 'pricing.validate');
    assert.equal(pricingValidate.json.status, 'accepted');
    assert.equal(typeof ((pricingValidate.json.data as JsonRecord).summary as JsonRecord).datasetSize, 'number');
    assert.equal(Array.isArray((pricingValidate.json.data as JsonRecord).issues), true);

    console.log('Sentinel command smoke: pricing.outliers.detect operator');
    const pricingOutliers = await postCommand({
      port,
      roleHeader: 'billing.operator',
      envelope: buildEnvelope({
        session: 'sess_smoke_trigent_002',
        op: 'pricing.outliers.detect',
        action: 'detect_pricing_outliers',
        role: ['billing.operator', 'billing.admin'],
        payload: {
          datasetName: 'Trigent pilot dataset',
          records: trigentPricingDataset,
        },
      }),
    });
    assert.equal(pricingOutliers.response.status, 200);
    assert.equal(pricingOutliers.json.op, 'pricing.outliers.detect');
    assert.equal(pricingOutliers.json.status, 'accepted');
    assert.equal(Array.isArray((pricingOutliers.json.data as JsonRecord).outliers), true);

    console.log('Sentinel command smoke: workflow.step.record operator');
    const workflowStepRecord = await postCommand({
      port,
      roleHeader: 'billing.operator',
      envelope: buildEnvelope({
        session: 'sess_smoke_trigent_003',
        op: 'workflow.step.record',
        action: 'record_workflow_step',
        role: ['billing.operator', 'billing.admin'],
        payload: {
          workflowId: 'wf-trigent-001',
          assetId: 'asset-002',
          stage: 'grading',
          status: 'completed',
          durationMinutes: 72,
        },
      }),
    });
    assert.equal(workflowStepRecord.response.status, 200);
    assert.equal(workflowStepRecord.json.op, 'workflow.step.record');
    assert.equal(workflowStepRecord.json.status, 'executed');
    assert.equal(typeof ((workflowStepRecord.json.data as JsonRecord).step as JsonRecord).stage, 'string');

    console.log('Sentinel command smoke: workflow.bottleneck.analyze operator');
    const workflowBottleneckAnalyze = await postCommand({
      port,
      roleHeader: 'billing.operator',
      envelope: buildEnvelope({
        session: 'sess_smoke_trigent_004',
        op: 'workflow.bottleneck.analyze',
        action: 'analyze_workflow_bottlenecks',
        role: ['billing.operator', 'billing.admin'],
        payload: {
          workflowId: 'wf-trigent-001',
          steps: [
            {
              workflowId: 'wf-trigent-001',
              stage: 'intake',
              status: 'completed',
              durationMinutes: 18,
            },
            {
              workflowId: 'wf-trigent-001',
              stage: 'grading',
              status: 'completed',
              durationMinutes: 72,
            },
            {
              workflowId: 'wf-trigent-001',
              stage: 'disposition',
              status: 'blocked',
              durationMinutes: 133,
            },
          ],
        },
      }),
    });
    assert.equal(workflowBottleneckAnalyze.response.status, 200);
    assert.equal(workflowBottleneckAnalyze.json.op, 'workflow.bottleneck.analyze');
    assert.equal(workflowBottleneckAnalyze.json.status, 'accepted');
    assert.equal(
      typeof (((workflowBottleneckAnalyze.json.data as JsonRecord).analysis as JsonRecord).totalSteps),
      'number'
    );

    console.log('Sentinel command smoke: report.generate operator');
    const reportGenerate = await postCommand({
      port,
      roleHeader: 'billing.operator',
      envelope: buildEnvelope({
        session: 'sess_smoke_trigent_005',
        op: 'report.generate',
        action: 'generate_pilot_report',
        role: ['billing.operator', 'billing.admin'],
        payload: {
          pricingRecords: trigentPricingDataset,
          workflowSteps: [
            {
              workflowId: 'wf-trigent-001',
              assetId: 'asset-001',
              stage: 'intake',
              status: 'completed',
              durationMinutes: 18,
            },
            {
              workflowId: 'wf-trigent-001',
              assetId: 'asset-002',
              stage: 'grading',
              status: 'completed',
              durationMinutes: 72,
            },
            {
              workflowId: 'wf-trigent-001',
              assetId: 'asset-003',
              stage: 'disposition',
              status: 'blocked',
              durationMinutes: 133,
            },
          ],
        },
      }),
    });
    assert.equal(reportGenerate.response.status, 200);
    assert.equal(reportGenerate.json.op, 'report.generate');
    assert.equal(reportGenerate.json.status, 'accepted');
    assert.equal(
      Array.isArray((((reportGenerate.json.data as JsonRecord).report as JsonRecord).recommendations as unknown[]) ?? []),
      true
    );

    console.log('Sentinel command smoke: repo.optimize denied without OTP');
    const repoOptimizeDenied = await postCommand({
      port,
      roleHeader: 'billing.admin',
      envelope: buildEnvelope({
        session: 'sess_smoke_repo_001',
        op: 'repo.optimize',
        action: 'dispatch_repo_optimize',
        role: ['billing.admin'],
        payload: {
          repo: 'Codynunn42/nunncorp-global-mono',
          ref: 'sentinel-safeerror-fix',
          actions: ['analyze', 'report'],
        },
      }),
    });
    assert.equal(repoOptimizeDenied.response.status, 403);
    assert.equal(repoOptimizeDenied.json.op, 'repo.optimize');
    assert.equal(repoOptimizeDenied.json.status, 'denied');
    assert.equal((repoOptimizeDenied.json.error as JsonRecord).code, 'SENTINEL_OTP_REQUIRED');

    console.log('Sentinel command smoke: repo.optimize executed with OTP');
    const repoOptimizeExecuted = await postCommand({
      port,
      roleHeader: 'billing.admin',
      envelope: buildEnvelope({
        session: 'sess_smoke_repo_002',
        op: 'repo.optimize',
        action: 'dispatch_repo_optimize',
        role: ['billing.admin'],
        otp: '246810',
        payload: {
          repo: 'Codynunn42/nunncorp-global-mono',
          ref: 'sentinel-safeerror-fix',
          actions: ['analyze', 'report'],
          summary: 'Smoke-dispatched repo optimization',
        },
      }),
    });
    assert.equal(repoOptimizeExecuted.response.status, 200);
    assert.equal(repoOptimizeExecuted.json.op, 'repo.optimize');
    assert.equal(repoOptimizeExecuted.json.status, 'executed');
    assert.equal((repoOptimizeExecuted.json.data as JsonRecord).triggeredWorkflow, true);
    assert.equal(
      ((repoOptimizeExecuted.json.data as JsonRecord).dispatch as JsonRecord).eventType,
      'sentinel-command'
    );
    const repoOptimizeReceipt = getInMemoryCommandReceipt(String(repoOptimizeExecuted.json.ack));
    assert.ok(repoOptimizeReceipt);
    assert.equal(repoOptimizeReceipt?.status, 'executed');
    assert.equal(repoOptimizeReceipt?.otpVerified, true);

    console.log('Sentinel command smoke: billing.reports.reconcile admin');
    const billingReconcileAdmin = await postCommand({
      port,
      roleHeader: 'billing.admin',
      envelope: buildEnvelope({
        session: 'sess_smoke_004',
        op: 'billing.reports.reconcile',
        action: 'reconcile_reports',
        role: ['billing.admin'],
        payload: { identifiers: ['rcpt_test_001'], dryRun: true },
      }),
    });

    assert.equal(billingReconcileAdmin.response.status, 200);
    assert.equal(billingReconcileAdmin.json.comm, SENTINEL_COMM);
    assert.equal(billingReconcileAdmin.json.op, 'billing.reports.reconcile');
    assert.equal(billingReconcileAdmin.json.status, 'accepted');
    assert.match(String(billingReconcileAdmin.json.ack), /^ack_/);
    assert.ok((billingReconcileAdmin.json.meta as JsonRecord).timestamp);
    const reconcileReceipt = getInMemoryCommandReceipt(String(billingReconcileAdmin.json.ack));
    assert.ok(reconcileReceipt);
    assert.equal(reconcileReceipt?.status, 'accepted');
    assert.ok(reconcileReceipt?.payloadHash);

    console.log('Sentinel command smoke: ci.runs.query operator');
    const ciRunsQuery = await postCommand({
      port,
      roleHeader: 'billing.operator',
      envelope: buildEnvelope({
        session: 'sess_smoke_ci_001',
        op: 'ci.runs.query',
        action: 'list_workflow_runs',
        role: ['billing.operator', 'billing.admin'],
        payload: {
          repo: 'Codynunn42/nunncorp-global-mono',
          workflow: 'sentinel-deploy.yml',
          branch: 'sentinel-deploy-sync',
          limit: 10,
        },
      }),
    });
    assert.equal(ciRunsQuery.response.status, 200);
    assert.equal(ciRunsQuery.json.op, 'ci.runs.query');
    assert.equal(ciRunsQuery.json.status, 'accepted');
    assert.equal(Array.isArray(((ciRunsQuery.json.data as JsonRecord).runs as unknown[] | undefined) ?? []), true);
    const ciRunsQueryReceipt = getInMemoryCommandReceipt(String(ciRunsQuery.json.ack));
    assert.ok(ciRunsQueryReceipt);
    assert.equal(ciRunsQueryReceipt?.status, 'accepted');

    console.log('Sentinel command smoke: ci.pr.status operator');
    const ciPrStatus = await postCommand({
      port,
      roleHeader: 'billing.operator',
      envelope: buildEnvelope({
        session: 'sess_smoke_ci_002',
        op: 'ci.pr.status',
        action: 'get_pr_status',
        role: ['billing.operator', 'billing.admin'],
        payload: {
          repo: 'Codynunn42/nunncorp-global-mono',
          prNumber: 225,
        },
      }),
    });
    assert.equal(ciPrStatus.response.status, 200);
    assert.equal(ciPrStatus.json.op, 'ci.pr.status');
    assert.equal(ciPrStatus.json.status, 'accepted');
    assert.equal(Array.isArray((((ciPrStatus.json.data as JsonRecord).checks as unknown[]) ?? [])), true);

    console.log('Sentinel command smoke: ci.pr.summarize_failures operator');
    const ciSummarizeFailures = await postCommand({
      port,
      roleHeader: 'billing.operator',
      envelope: buildEnvelope({
        session: 'sess_smoke_ci_003',
        op: 'ci.pr.summarize_failures',
        action: 'summarize_pr_failures',
        role: ['billing.operator', 'billing.admin'],
        payload: {
          repo: 'Codynunn42/nunncorp-global-mono',
          prNumber: 225,
          includeRunning: true,
        },
      }),
    });
    assert.equal(ciSummarizeFailures.response.status, 200);
    assert.equal(ciSummarizeFailures.json.op, 'ci.pr.summarize_failures');
    assert.equal(ciSummarizeFailures.json.status, 'accepted');
    assert.equal(typeof (ciSummarizeFailures.json.data as JsonRecord).summary, 'string');

    console.log('Sentinel command smoke: ci.runs.rerun_failed denied for operator');
    const ciRerunDenied = await postCommand({
      port,
      roleHeader: 'billing.operator',
      envelope: buildEnvelope({
        session: 'sess_smoke_ci_003b',
        op: 'ci.runs.rerun_failed',
        action: 'rerun_failed_runs',
        role: ['billing.admin'],
        payload: {
          repo: 'Codynunn42/nunncorp-global-mono',
          prNumber: 225,
        },
      }),
    });
    assert.equal(ciRerunDenied.response.status, 403);
    assert.equal(ciRerunDenied.json.op, 'ci.runs.rerun_failed');
    assert.equal(ciRerunDenied.json.status, 'denied');

    console.log('Sentinel command smoke: ci.runs.rerun_failed admin');
    const ciRerunFailed = await postCommand({
      port,
      roleHeader: 'billing.admin',
      envelope: buildEnvelope({
        session: 'sess_smoke_ci_003c',
        op: 'ci.runs.rerun_failed',
        action: 'rerun_failed_runs',
        role: ['billing.admin'],
        payload: {
          repo: 'Codynunn42/nunncorp-global-mono',
          prNumber: 225,
        },
      }),
    });
    assert.equal(ciRerunFailed.response.status, 200);
    assert.equal(ciRerunFailed.json.op, 'ci.runs.rerun_failed');
    assert.equal(ciRerunFailed.json.status, 'accepted');
    assert.equal(typeof (ciRerunFailed.json.data as JsonRecord).count, 'number');

    console.log('Sentinel command smoke: ci.pr.comment operator');
    const ciPrComment = await postCommand({
      port,
      roleHeader: 'billing.operator',
      envelope: buildEnvelope({
        session: 'sess_smoke_ci_003d',
        op: 'ci.pr.comment',
        action: 'comment_on_pr',
        role: ['billing.operator', 'billing.admin'],
        payload: {
          repo: 'Codynunn42/nunncorp-global-mono',
          prNumber: 225,
          body: 'Sentinel phase 2 smoke comment',
        },
      }),
    });
    assert.equal(ciPrComment.response.status, 200);
    assert.equal(ciPrComment.json.op, 'ci.pr.comment');
    assert.equal(ciPrComment.json.status, 'accepted');
    assert.equal(typeof ((ciPrComment.json.data as JsonRecord).comment as JsonRecord).body, 'string');

    console.log('Sentinel command smoke: ci.runs.cancel_stale denied for operator');
    const ciCancelDenied = await postCommand({
      port,
      roleHeader: 'billing.operator',
      envelope: buildEnvelope({
        session: 'sess_smoke_ci_004',
        op: 'ci.runs.cancel_stale',
        action: 'cancel_stale_runs',
        role: ['billing.admin'],
        payload: {
          repo: 'Codynunn42/nunncorp-global-mono',
          workflow: 'sentinel-deploy.yml',
          branch: 'sentinel-deploy-sync',
          keepLatest: 1,
        },
      }),
    });
    assert.equal(ciCancelDenied.response.status, 403);
    assert.equal(ciCancelDenied.json.op, 'ci.runs.cancel_stale');
    assert.equal(ciCancelDenied.json.status, 'denied');
    const ciCancelDeniedReceipt = getInMemoryCommandReceipt(String(ciCancelDenied.json.ack));
    assert.ok(ciCancelDeniedReceipt);
    assert.equal(ciCancelDeniedReceipt?.status, 'denied');

    console.log('Sentinel command smoke: ci.runs.cancel_stale admin');
    const ciCancelStale = await postCommand({
      port,
      roleHeader: 'billing.admin',
      envelope: buildEnvelope({
        session: 'sess_smoke_ci_005',
        op: 'ci.runs.cancel_stale',
        action: 'cancel_stale_runs',
        role: ['billing.admin'],
        payload: {
          repo: 'Codynunn42/nunncorp-global-mono',
          workflow: 'sentinel-deploy.yml',
          branch: 'sentinel-deploy-sync',
          keepLatest: 1,
        },
      }),
    });
    assert.equal(ciCancelStale.response.status, 200);
    assert.equal(ciCancelStale.json.op, 'ci.runs.cancel_stale');
    assert.equal(ciCancelStale.json.status, 'accepted');
    assert.equal(typeof (ciCancelStale.json.data as JsonRecord).count, 'number');

    console.log('Sentinel command smoke: command query by ack');
    const queryByAckResponse = await fetch(`http://127.0.0.1:${port}/v1/command/query`, {
      method: 'POST',
      signal: AbortSignal.timeout(3000),
      headers: {
        'content-type': 'application/json',
        'x-sentinel-smoke-role': 'billing.operator',
        'x-sentinel-smoke-actor': 'sentinel-test-actor',
        'x-sentinel-smoke-tenant': 'sentinel-test-tenant',
      },
      body: JSON.stringify({ ack: String(billingQuery.json.ack) }),
    });
    const queryByAckJson = (await queryByAckResponse.json()) as JsonRecord;
    assert.equal(queryByAckResponse.status, 200);
    assert.equal(queryByAckJson.comm, SENTINEL_COMM);
    assert.equal((queryByAckJson.data as JsonRecord).receipt !== undefined, true);

    console.log('Sentinel command smoke: command query list');
    const queryListResponse = await fetch(`http://127.0.0.1:${port}/v1/command/query`, {
      method: 'POST',
      signal: AbortSignal.timeout(3000),
      headers: {
        'content-type': 'application/json',
        'x-sentinel-smoke-role': 'billing.operator',
        'x-sentinel-smoke-actor': 'sentinel-test-actor',
        'x-sentinel-smoke-tenant': 'sentinel-test-tenant',
      },
      body: JSON.stringify({ limit: 10 }),
    });
    const queryListJson = (await queryListResponse.json()) as JsonRecord;
    assert.equal(queryListResponse.status, 200);
    assert.equal(queryListJson.comm, SENTINEL_COMM);
    assert.equal(Array.isArray((queryListJson.data as JsonRecord).receipts), true);

    console.log('Sentinel command smoke: /v1/command cases verified');
  } finally {
    server.close();
    delete process.env.SENTINEL_SMOKE_AUTH;
    delete process.env.SENTINEL_COMMAND_OTP;
    delete process.env.PORT;
  }
}
