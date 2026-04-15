export type GithubWorkflowRun = {
  id: number;
  name: string;
  workflowName?: string;
  headBranch: string;
  headSha: string;
  status: string;
  conclusion?: string | null;
  htmlUrl: string;
  createdAt: string;
  updatedAt: string;
};

export type GithubCheckSummary = {
  name: string;
  status: string;
  conclusion?: string | null;
};

export type GithubPullRequestComment = {
  id: number;
  body: string;
  createdAt: string;
};

export type GithubRepositoryDispatch = {
  id: string;
  eventType: string;
  repo: string;
  ref?: string;
  actions: string[];
  summary?: string;
  createdAt: string;
};

export interface GithubCiProvider {
  listRuns(args: {
    repo: string;
    workflow?: string;
    branch?: string;
    status?: string;
    limit: number;
  }): Promise<GithubWorkflowRun[]>;
  getPullRequestStatus(args: {
    repo: string;
    prNumber: number;
  }): Promise<{
    headSha: string;
    checks: GithubCheckSummary[];
  }>;
  rerunFailedRuns(args: {
    repo: string;
    prNumber?: number;
    runIds?: number[];
    workflow?: string;
  }): Promise<GithubWorkflowRun[]>;
  addPullRequestComment(args: {
    repo: string;
    prNumber: number;
    body: string;
  }): Promise<GithubPullRequestComment>;
  triggerRepositoryDispatch(args: {
    repo: string;
    eventType: string;
    clientPayload: Record<string, unknown>;
  }): Promise<GithubRepositoryDispatch>;
  cancelRun(args: {
    repo: string;
    runId: number;
  }): Promise<void>;
}

type ProviderState = {
  runs: GithubWorkflowRun[];
  pullRequests: Record<string, { headSha: string; checks: GithubCheckSummary[]; comments: GithubPullRequestComment[] }>;
  dispatches: GithubRepositoryDispatch[];
};

function createInitialState(): ProviderState {
  return {
    runs: [
      {
        id: 24002484359,
        name: 'Sentinel Deploy',
        workflowName: 'sentinel-deploy.yml',
        headBranch: 'sentinel-deploy-sync',
        headSha: '9ffb70337deecabc53fae7ec0ef7e25bf0f286d7',
        status: 'completed',
        conclusion: 'success',
        htmlUrl: 'https://github.com/Codynunn42/nunncorp-global-mono/actions/runs/24002484359',
        createdAt: '2026-04-05T13:26:57Z',
        updatedAt: '2026-04-05T13:36:23Z',
      },
      {
        id: 24008702399,
        name: 'Adversarial (retry/backoff)',
        workflowName: 'c-layer-adversarial-retry.yml',
        headBranch: 'sentinel-deploy-sync',
        headSha: '3bbc9f24c160fc4dc12eb136615c308f58e5db8d',
        status: 'in_progress',
        conclusion: null,
        htmlUrl: 'https://github.com/Codynunn42/nunncorp-global-mono/actions/runs/24008702399',
        createdAt: '2026-04-05T19:24:26Z',
        updatedAt: '2026-04-05T19:24:28Z',
      },
      {
        id: 24008702383,
        name: 'Adversarial Matrix',
        workflowName: 'c-layer-adversarial.yml',
        headBranch: 'sentinel-deploy-sync',
        headSha: '3bbc9f24c160fc4dc12eb136615c308f58e5db8d',
        status: 'in_progress',
        conclusion: null,
        htmlUrl: 'https://github.com/Codynunn42/nunncorp-global-mono/actions/runs/24008702383',
        createdAt: '2026-04-05T19:24:27Z',
        updatedAt: '2026-04-05T19:24:27Z',
      },
      {
        id: 23990775232,
        name: 'Sentinel Deploy',
        workflowName: 'sentinel-deploy.yml',
        headBranch: 'sentinel-deploy-sync',
        headSha: '827c8bc30f8d04d064989d33f6ed377ac2bd739c',
        status: 'in_progress',
        conclusion: null,
        htmlUrl: 'https://github.com/Codynunn42/nunncorp-global-mono/actions/runs/23990775232',
        createdAt: '2026-04-05T00:30:59Z',
        updatedAt: '2026-04-05T00:31:20Z',
      },
      {
        id: 23989180886,
        name: 'Sentinel Deploy',
        workflowName: 'sentinel-deploy.yml',
        headBranch: 'sentinel-deploy-sync',
        headSha: '827c8bc30f8d04d064989d33f6ed377ac2bd739c',
        status: 'queued',
        conclusion: null,
        htmlUrl: 'https://github.com/Codynunn42/nunncorp-global-mono/actions/runs/23989180886',
        createdAt: '2026-04-04T22:44:39Z',
        updatedAt: '2026-04-04T22:44:39Z',
      },
    ],
    pullRequests: {
      'Codynunn42/nunncorp-global-mono#225': {
        headSha: '3bbc9f24c160fc4dc12eb136615c308f58e5db8d',
        checks: [
          { name: 'Prepare', status: 'completed', conclusion: 'success' },
          { name: 'Vercel Preview Comments', status: 'completed', conclusion: 'success' },
          { name: 'build', status: 'in_progress', conclusion: null },
          { name: 'Adversarial Matrix (20.x, 14)', status: 'in_progress', conclusion: null },
          { name: 'Adversarial Matrix (20.x, 15)', status: 'completed', conclusion: 'success' },
          { name: 'Adversarial Matrix (20.x, 16)', status: 'completed', conclusion: 'success' },
          { name: 'Adversarial (retry/backoff) (20.x, 14)', status: 'in_progress', conclusion: null },
          { name: 'Agent', status: 'in_progress', conclusion: null },
        ],
        comments: [],
      },
    },
    dispatches: [],
  };
}

export class InMemoryGithubCiProvider implements GithubCiProvider {
  private state: ProviderState;

  constructor(initialState: ProviderState = createInitialState()) {
    this.state = initialState;
  }

  reset(): void {
    this.state = createInitialState();
  }

  async listRuns(args: {
    repo: string;
    workflow?: string;
    branch?: string;
    status?: string;
    limit: number;
  }): Promise<GithubWorkflowRun[]> {
    let runs = this.state.runs.filter(() => args.repo.length > 0);

    if (args.workflow) {
      runs = runs.filter((run) => run.workflowName === args.workflow || run.name === args.workflow);
    }
    if (args.branch) {
      runs = runs.filter((run) => run.headBranch === args.branch);
    }
    if (args.status) {
      runs = runs.filter((run) => run.status === args.status);
    }

    return runs.slice(0, Math.max(1, args.limit));
  }

  async getPullRequestStatus(args: {
    repo: string;
    prNumber: number;
  }): Promise<{ headSha: string; checks: GithubCheckSummary[] }> {
    const key = `${args.repo}#${args.prNumber}`;
    const pr = this.state.pullRequests[key];
    if (!pr) {
      throw new Error(`No pull request status found for ${key}`);
    }
    return {
      headSha: pr.headSha,
      checks: pr.checks.map((check) => ({ ...check })),
    };
  }

  async rerunFailedRuns(args: {
    repo: string;
    prNumber?: number;
    runIds?: number[];
    workflow?: string;
  }): Promise<GithubWorkflowRun[]> {
    if (!args.repo) {
      throw new Error('Repository is required');
    }

    let targetRuns: GithubWorkflowRun[];
    if (args.runIds && args.runIds.length > 0) {
      const ids = new Set(args.runIds);
      targetRuns = this.state.runs.filter((run) => ids.has(run.id));
    } else {
      const prHeadSha =
        typeof args.prNumber === 'number'
          ? this.state.pullRequests[`${args.repo}#${args.prNumber}`]?.headSha
          : undefined;

      targetRuns = this.state.runs.filter((run) => {
        const sameHead = prHeadSha ? run.headSha === prHeadSha : true;
        const sameWorkflow = args.workflow ? run.workflowName === args.workflow || run.name === args.workflow : true;
        return sameHead && sameWorkflow && run.conclusion === 'failure';
      });
    }

    for (const run of targetRuns) {
      run.status = 'queued';
      run.conclusion = null;
      run.updatedAt = '2026-04-05T20:05:00Z';
    }

    return targetRuns.map((run) => ({ ...run }));
  }

  async addPullRequestComment(args: {
    repo: string;
    prNumber: number;
    body: string;
  }): Promise<GithubPullRequestComment> {
    const key = `${args.repo}#${args.prNumber}`;
    const pr = this.state.pullRequests[key];
    if (!pr) {
      throw new Error(`No pull request found for ${key}`);
    }
    const comment: GithubPullRequestComment = {
      id: pr.comments.length + 1,
      body: args.body,
      createdAt: '2026-04-05T20:05:00Z',
    };
    pr.comments.push(comment);
    return { ...comment };
  }

  async triggerRepositoryDispatch(args: {
    repo: string;
    eventType: string;
    clientPayload: Record<string, unknown>;
  }): Promise<GithubRepositoryDispatch> {
    if (!args.repo) {
      throw new Error('Repository is required');
    }

    const createdAt = '2026-04-05T20:05:00Z';
    const dispatch: GithubRepositoryDispatch = {
      id: `dispatch_${this.state.dispatches.length + 1}`,
      eventType: args.eventType,
      repo: args.repo,
      ref: typeof args.clientPayload.ref === 'string' ? args.clientPayload.ref : undefined,
      actions: Array.isArray(args.clientPayload.actions)
        ? args.clientPayload.actions.filter((value): value is string => typeof value === 'string')
        : [],
      summary: typeof args.clientPayload.summary === 'string' ? args.clientPayload.summary : undefined,
      createdAt,
    };
    this.state.dispatches.push(dispatch);
    return { ...dispatch };
  }

  async cancelRun(args: {
    repo: string;
    runId: number;
  }): Promise<void> {
    if (!args.repo) {
      throw new Error('Repository is required');
    }
    const run = this.state.runs.find((item) => item.id === args.runId);
    if (!run) {
      throw new Error(`Run ${args.runId} not found`);
    }
    run.status = 'completed';
    run.conclusion = 'cancelled';
    run.updatedAt = '2026-04-05T20:00:00Z';
  }
}

class HybridGithubCiProvider implements GithubCiProvider {
  constructor(private readonly fallback: InMemoryGithubCiProvider) {}

  private getConfiguredToken(): string | null {
    const token = process.env.SENTINEL_GITHUB_TOKEN?.trim();
    return token ? token : null;
  }

  private getApiBaseUrl(): string {
    return process.env.SENTINEL_GITHUB_API_URL?.trim() || 'https://api.github.com';
  }

  private async postJson(path: string, body: Record<string, unknown>): Promise<Response> {
    const token = this.getConfiguredToken();
    if (!token) {
      throw new Error('SENTINEL_GITHUB_TOKEN is required for live GitHub dispatch');
    }

    const response = await fetch(`${this.getApiBaseUrl()}${path}`, {
      method: 'POST',
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        'user-agent': 'sentinel-control-plane',
      },
      body: JSON.stringify(body),
    });

    return response;
  }

  async listRuns(args: {
    repo: string;
    workflow?: string;
    branch?: string;
    status?: string;
    limit: number;
  }): Promise<GithubWorkflowRun[]> {
    return this.fallback.listRuns(args);
  }

  async getPullRequestStatus(args: {
    repo: string;
    prNumber: number;
  }): Promise<{ headSha: string; checks: GithubCheckSummary[] }> {
    return this.fallback.getPullRequestStatus(args);
  }

  async rerunFailedRuns(args: {
    repo: string;
    prNumber?: number;
    runIds?: number[];
    workflow?: string;
  }): Promise<GithubWorkflowRun[]> {
    return this.fallback.rerunFailedRuns(args);
  }

  async addPullRequestComment(args: {
    repo: string;
    prNumber: number;
    body: string;
  }): Promise<GithubPullRequestComment> {
    return this.fallback.addPullRequestComment(args);
  }

  async triggerRepositoryDispatch(args: {
    repo: string;
    eventType: string;
    clientPayload: Record<string, unknown>;
  }): Promise<GithubRepositoryDispatch> {
    if (!this.getConfiguredToken()) {
      return this.fallback.triggerRepositoryDispatch(args);
    }

    const [owner, repoName] = args.repo.split('/');
    if (!owner || !repoName) {
      throw new Error('repo must be in owner/name format');
    }

    const response = await this.postJson(`/repos/${owner}/${repoName}/dispatches`, {
      event_type: args.eventType,
      client_payload: args.clientPayload,
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`GitHub repository dispatch failed (${response.status}): ${body || response.statusText}`);
    }

    return {
      id: `dispatch_${Date.now()}`,
      eventType: args.eventType,
      repo: args.repo,
      ref: typeof args.clientPayload.ref === 'string' ? args.clientPayload.ref : undefined,
      actions: Array.isArray(args.clientPayload.actions)
        ? args.clientPayload.actions.filter((value): value is string => typeof value === 'string')
        : [],
      summary: typeof args.clientPayload.summary === 'string' ? args.clientPayload.summary : undefined,
      createdAt: new Date().toISOString(),
    };
  }

  async cancelRun(args: {
    repo: string;
    runId: number;
  }): Promise<void> {
    return this.fallback.cancelRun(args);
  }
}

const inMemoryGithubCiProvider = new InMemoryGithubCiProvider();

export const defaultGithubCiProvider = new HybridGithubCiProvider(inMemoryGithubCiProvider);

export function resetGithubCiProvider(): void {
  inMemoryGithubCiProvider.reset();
}
