import { CompletionSweepReport } from '../completionSweep/types.js';

function formatSlackMessage(report: CompletionSweepReport) {
  return {
    text: `Completion Sweep Report — ${report.status.toUpperCase()}`,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text:
            `*Run ID:* ${report.run_id}\n` +
            `*Status:* ${report.status}\n` +
            `*Attempted:* ${report.counts.attempted}\n` +
            `*Completed:* ${report.counts.completed}`,
        },
      },
      ...(report.errors && report.errors.length
        ? [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `*Errors:*\n• ${report.errors.map((e) => e.message).join('\n• ')}`,
              },
            },
          ]
        : []),
    ],
  };
}

export async function deliverSlack(webhookUrl: string, report: CompletionSweepReport) {
  const body = formatSlackMessage(report);
  if (typeof (globalThis as any).fetch === 'function') {
    const res = await (globalThis as any).fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errorBody = await res.text();
      throw new Error(
        `Slack delivery failed with status ${res.status} ${res.statusText}${errorBody ? `: ${errorBody}` : ''}`,
      );
    }
    return res;
  }
  throw new Error('fetch not available for Slack delivery');
}
