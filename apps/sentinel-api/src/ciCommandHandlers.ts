import { defaultGithubCiProvider } from './githubCiProvider.js';
import type {
  CiPrCommentPayload,
  CiPrStatusPayload,
  CiPrSummarizeFailuresPayload,
  CiRunsCancelStalePayload,
  CiRunsQueryPayload,
  CiRunsRerunFailedPayload,
  RepoOptimizeAction,
  RepoOptimizePayload,
  SentinelCommandHandler,
} from './sentinelCommandTypes.js';

const ALLOWED_REPO_OPTIMIZE_ACTIONS: RepoOptimizeAction[] = ['analyze', 'lint-fix', 'test', 'commit', 'report'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseRepo(payload: Record<string, unknown>): string {
  const repo = typeof payload.repo === 'string' ? payload.repo.trim() : '';
  if (!repo) {
    throw new Error('repo is required');
  }
  return repo;
}

function parseCiRunsQueryPayload(payload: Record<string, unknown>): CiRunsQueryPayload {
  return {
    repo: parseRepo(payload),
    workflow: typeof payload.workflow === 'string' ? payload.workflow : undefined,
    branch: typeof payload.branch === 'string' ? payload.branch : undefined,
    status:
      payload.status === 'queued' || payload.status === 'in_progress' || payload.status === 'completed'
        ? payload.status
        : undefined,
    limit: typeof payload.limit === 'number' && Number.isFinite(payload.limit) ? payload.limit : undefined,
  };
}

function parseCiPrStatusPayload(payload: Record<string, unknown>): CiPrStatusPayload {
  const prNumber = typeof payload.prNumber === 'number' ? Math.trunc(payload.prNumber) : NaN;
  if (!Number.isFinite(prNumber) || prNumber <= 0) {
    throw new Error('prNumber must be a positive number');
  }
  return {
    repo: parseRepo(payload),
    prNumber,
  };
}

function parseCiRunsRerunFailedPayload(payload: Record<string, unknown>): CiRunsRerunFailedPayload {
  const runIds = Array.isArray(payload.runIds)
    ? payload.runIds
        .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
        .map((value) => Math.trunc(value))
    : undefined;
  const prNumber =
    typeof payload.prNumber === 'number' && Number.isFinite(payload.prNumber)
      ? Math.trunc(payload.prNumber)
      : undefined;

  if (!prNumber && (!runIds || runIds.length === 0)) {
    throw new Error('prNumber or runIds is required');
  }

  return {
    repo: parseRepo(payload),
    prNumber,
    runIds,
    workflow: typeof payload.workflow === 'string' ? payload.workflow : undefined,
  };
}

function parseCiPrSummarizeFailuresPayload(payload: Record<string, unknown>): CiPrSummarizeFailuresPayload {
  const statusPayload = parseCiPrStatusPayload(payload);
  return {
    ...statusPayload,
    includeRunning: payload.includeRunning === true,
  };
}

function parseCiPrCommentPayload(payload: Record<string, unknown>): CiPrCommentPayload {
  const body = typeof payload.body === 'string' ? payload.body.trim() : '';
  if (!body) {
    throw new Error('body is required');
  }
  return {
    ...parseCiPrStatusPayload(payload),
    body,
  };
}

function parseCiRunsCancelStalePayload(payload: Record<string, unknown>): CiRunsCancelStalePayload {
  return {
    repo: parseRepo(payload),
    workflow: typeof payload.workflow === 'string' ? payload.workflow : undefined,
    branch: typeof payload.branch === 'string' ? payload.branch : undefined,
    keepLatest:
      typeof payload.keepLatest === 'number' && Number.isFinite(payload.keepLatest)
        ? Math.trunc(payload.keepLatest)
        : undefined,
  };
}

function parseRepoOptimizePayload(payload: Record<string, unknown>): RepoOptimizePayload {
  const actions = Array.isArray(payload.actions)
    ? payload.actions.filter(
        (value): value is RepoOptimizeAction =>
          typeof value === 'string' &&
          (ALLOWED_REPO_OPTIMIZE_ACTIONS as string[]).includes(value)
      )
    : [];

  if (actions.length === 0) {
    throw new Error(`actions must include at least one of: ${ALLOWED_REPO_OPTIMIZE_ACTIONS.join(', ')}`);
  }

  if (Array.isArray(payload.actions) && actions.length !== payload.actions.length) {
    throw new Error(`actions may only include: ${ALLOWED_REPO_OPTIMIZE_ACTIONS.join(', ')}`);
  }

  return {
    repo: parseRepo(payload),
    ref: typeof payload.ref === 'string' ? payload.ref.trim() || undefined : undefined,
    actions,
    summary: typeof payload.summary === 'string' ? payload.summary.trim() || undefined : undefined,
    requestedBy: typeof payload.requestedBy === 'string' ? payload.requestedBy.trim() || undefined : undefined,
  };
}

export const handleCiRunsQuery: SentinelCommandHandler = async ({ envelope, ack, identity }) => {
  const payload = parseCiRunsQueryPayload(isRecord(envelope.payload) ? envelope.payload : {});
  const limit = Math.max(1, Math.min(payload.limit ?? 10, 50));
  const runs = await defaultGithubCiProvider.listRuns({
    repo: payload.repo,
    workflow: payload.workflow,
    branch: payload.branch,
    status: payload.status,
    limit,
  });

  return {
    status: 'accepted',
    data: {
      ack,
      operation: 'ci.runs.query',
      count: runs.length,
      runs,
      meta: {
        actorId: identity.actorId,
        operator: identity.operator,
      },
    },
  };
};

export const handleRepoOptimize: SentinelCommandHandler = async ({ envelope, ack, identity }) => {
  const payload = parseRepoOptimizePayload(isRecord(envelope.payload) ? envelope.payload : {});
  const dispatch = await defaultGithubCiProvider.triggerRepositoryDispatch({
    repo: payload.repo,
    eventType: 'sentinel-command',
    clientPayload: {
      op: 'repo.optimize',
      ack,
      repo: payload.repo,
      ref: payload.ref,
      actions: payload.actions,
      summary: payload.summary,
      requestedBy: payload.requestedBy ?? identity.operator ?? identity.actorId,
      actorId: identity.actorId,
      operator: identity.operator,
      tenantId: identity.tenantId,
    },
  });

  return {
    status: 'executed',
    data: {
      ack,
      operation: 'repo.optimize',
      repo: payload.repo,
      ref: payload.ref ?? null,
      actions: payload.actions,
      dispatch,
      triggeredWorkflow: true,
      meta: {
        actorId: identity.actorId,
        operator: identity.operator,
      },
    },
  };
};

export const handleCiPrStatus: SentinelCommandHandler = async ({ envelope, ack, identity }) => {
  const payload = parseCiPrStatusPayload(isRecord(envelope.payload) ? envelope.payload : {});
  const status = await defaultGithubCiProvider.getPullRequestStatus({
    repo: payload.repo,
    prNumber: payload.prNumber,
  });

  return {
    status: 'accepted',
    data: {
      ack,
      operation: 'ci.pr.status',
      repo: payload.repo,
      prNumber: payload.prNumber,
      headSha: status.headSha,
      checks: status.checks,
      meta: {
        actorId: identity.actorId,
        operator: identity.operator,
      },
    },
  };
};

export const handleCiRunsRerunFailed: SentinelCommandHandler = async ({ envelope, ack, identity }) => {
  const payload = parseCiRunsRerunFailedPayload(isRecord(envelope.payload) ? envelope.payload : {});
  const rerun = await defaultGithubCiProvider.rerunFailedRuns({
    repo: payload.repo,
    prNumber: payload.prNumber,
    runIds: payload.runIds,
    workflow: payload.workflow,
  });

  return {
    status: 'accepted',
    data: {
      ack,
      operation: 'ci.runs.rerun_failed',
      repo: payload.repo,
      prNumber: payload.prNumber ?? null,
      rerun,
      count: rerun.length,
      meta: {
        actorId: identity.actorId,
        operator: identity.operator,
      },
    },
  };
};

export const handleCiPrSummarizeFailures: SentinelCommandHandler = async ({ envelope, ack, identity }) => {
  const payload = parseCiPrSummarizeFailuresPayload(isRecord(envelope.payload) ? envelope.payload : {});
  const status = await defaultGithubCiProvider.getPullRequestStatus({
    repo: payload.repo,
    prNumber: payload.prNumber,
  });
  const failed = status.checks.filter(
    (check) => check.conclusion === 'failure' || check.conclusion === 'timed_out'
  );
  const running = status.checks.filter(
    (check) => check.status === 'in_progress' || check.status === 'queued'
  );

  return {
    status: 'accepted',
    data: {
      ack,
      operation: 'ci.pr.summarize_failures',
      repo: payload.repo,
      prNumber: payload.prNumber,
      headSha: status.headSha,
      failed,
      running: payload.includeRunning ? running : [],
      summary:
        failed.length === 0
          ? 'No failed checks.'
          : `${failed.length} failed check(s), ${running.length} still running.`,
      meta: {
        actorId: identity.actorId,
        operator: identity.operator,
      },
    },
  };
};

export const handleCiPrComment: SentinelCommandHandler = async ({ envelope, ack, identity }) => {
  const payload = parseCiPrCommentPayload(isRecord(envelope.payload) ? envelope.payload : {});
  const comment = await defaultGithubCiProvider.addPullRequestComment({
    repo: payload.repo,
    prNumber: payload.prNumber,
    body: payload.body,
  });

  return {
    status: 'accepted',
    data: {
      ack,
      operation: 'ci.pr.comment',
      repo: payload.repo,
      prNumber: payload.prNumber,
      comment,
      meta: {
        actorId: identity.actorId,
        operator: identity.operator,
      },
    },
  };
};

export const handleCiRunsCancelStale: SentinelCommandHandler = async ({ envelope, ack, identity }) => {
  const payload = parseCiRunsCancelStalePayload(isRecord(envelope.payload) ? envelope.payload : {});
  const runs = await defaultGithubCiProvider.listRuns({
    repo: payload.repo,
    workflow: payload.workflow,
    branch: payload.branch,
    status: 'in_progress',
    limit: 50,
  });
  const keepLatest = Math.max(1, payload.keepLatest ?? 1);
  const sorted = [...runs].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const toCancel = sorted.slice(keepLatest);

  for (const run of toCancel) {
    await defaultGithubCiProvider.cancelRun({
      repo: payload.repo,
      runId: run.id,
    });
  }

  return {
    status: 'accepted',
    data: {
      ack,
      operation: 'ci.runs.cancel_stale',
      count: toCancel.length,
      cancelled: toCancel.map((run) => ({
        id: run.id,
        name: run.name,
        branch: run.headBranch,
      })),
      meta: {
        actorId: identity.actorId,
        operator: identity.operator,
      },
    },
  };
};
