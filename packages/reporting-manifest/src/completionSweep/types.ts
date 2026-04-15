export type SweepScope = 'active' | 'hibernated' | 'unified';

export type Counts = {
  attempted: number;
  completed: number;
  failed: number;
  skipped: number;
};

export type SweepErrorsItem = {
  code: string;
  message: string;
  scope: 'active' | 'hibernated' | 'system';
};

export type CompletionSweepReport = {
  report_type: 'completion_sweep_report';
  run_id: string;
  run_date: string; // YYYY-MM-DD
  run_timestamp_utc: string; // ISO-8601
  sweep_scope: SweepScope;
  counts: Counts;
  by_scope: {
    active: Counts;
    hibernated: Counts;
  };
  status: 'success' | 'partial' | 'empty' | 'error';
  errors: SweepErrorsItem[];
  metadata: {
    system: 'Sentinel';
    environment: 'prod' | 'staging' | 'dev';
    version: string;
  };
};
