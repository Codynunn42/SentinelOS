import * as fs from 'node:fs';
import * as path from 'node:path';
import { CompletionSweepReport } from './types.js';

const RECEIPTS_DIR = path.resolve(process.cwd(), 'receipts');
const NDJSON_PATH = path.join(RECEIPTS_DIR, 'completion-sweep.ndjson');
const CSV_PATH = path.join(RECEIPTS_DIR, 'sweep_counts.csv');

function ensureDir(): void {
  if (!fs.existsSync(RECEIPTS_DIR)) fs.mkdirSync(RECEIPTS_DIR, { recursive: true });
}

function writeAndFsync(filePath: string, content: string): void {
  // Open file descriptor for append, write, fsync, close
  const fd = fs.openSync(filePath, 'a');
  try {
    fs.writeSync(fd, content, undefined, 'utf8');
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

export function persistReportToNdjson(report: CompletionSweepReport): void {
  ensureDir();
  const line = JSON.stringify(report) + '\n';
  writeAndFsync(NDJSON_PATH, line);
}

function escapeCsv(s: string): string {
  if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function appendCountsCsv(report: CompletionSweepReport): void {
  ensureDir();
  const header = 'run_id,run_date,status,attempted,completed,failed,skipped\n';
  if (!fs.existsSync(CSV_PATH)) {
    writeAndFsync(CSV_PATH, header);
  }
  const line = `${escapeCsv(report.run_id)},${report.run_date},${report.status},${report.counts.attempted},${report.counts.completed},${report.counts.failed},${report.counts.skipped}\n`;
  writeAndFsync(CSV_PATH, line);
}

export function persistReport(report: CompletionSweepReport): void {
  persistReportToNdjson(report);
  appendCountsCsv(report);
}
