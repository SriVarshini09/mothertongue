import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  AdapterSummary,
  BenchmarkReport,
  CaseResult,
} from './types';
import { compositeScore, pronounRoleError } from './score';

export const GPT_INPUT_PER_M = 0.15;
export const GPT_OUTPUT_PER_M = 0.6;

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[i];
}

function avg(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10;
}

function round1(n: number | null): number | null {
  return n === null ? null : Math.round(n * 10) / 10;
}

export function summarizeAdapter(
  id: string,
  label: string,
  available: boolean,
  reason: string | undefined,
  cases: CaseResult[],
  latencies: number[],
  cost: { inTokens: number; outTokens: number; usd: number }
): AdapterSummary {
  const scored = cases.filter((c) => c.composite[id] !== null && c.composite[id] !== undefined);
  const comps = scored.map((c) => c.composite[id] as number);
  const judges = cases.map((c) => c.judge[id]).filter(Boolean);
  const sorted = [...latencies].sort((a, b) => a - b);
  let criticalErrors = 0;
  let answeredInstead = 0;
  let pronounRoleErrors = 0;
  for (const c of cases) {
    const j = c.judge[id];
    if (j?.criticalError) criticalErrors++;
    if (j?.answeredInsteadOfTranslated || c.structural[id]?.answerPatternFound) answeredInstead++;
    if (c.structural[id] && pronounRoleError(j ?? null, c.structural[id])) pronounRoleErrors++;
  }
  const ok = cases.filter((c) => c.outputs[id]).length;
  const failed = cases.filter((c) => c.failures[id] && !c.outputs[id]).length;
  return {
    id,
    label,
    available,
    unavailableReason: reason,
    cases: cases.length,
    ok,
    failed,
    skipped: Math.max(0, cases.length - ok - failed),
    avgComposite: avg(comps),
    criticalErrors,
    answeredInstead,
    pronounRoleErrors,
    avgNaturalness: avg(judges.map((j) => j!.naturalness)),
    avgConversational: avg(judges.map((j) => j!.conversationalQuality)),
    p50Ms: percentile(sorted, 50),
    p95Ms: percentile(sorted, 95),
    avgMs: avg(latencies),
    estCostUsd: Math.round(cost.usd * 10000) / 10000,
    estInputTokens: cost.inTokens,
    estOutputTokens: cost.outTokens,
  };
}

export function breakdown(
  cases: CaseResult[],
  key: (c: CaseResult) => string,
  adapterIds: string[]
): Record<string, Record<string, { avgComposite: number | null; n: number }>> {
  const out: Record<string, Record<string, { avgComposite: number | null; n: number }>> = {};
  for (const c of cases) {
    const group = key(c);
    out[group] ??= {};
    for (const id of adapterIds) {
      out[group][id] ??= { avgComposite: null, n: 0 };
      const v = c.composite[id];
      if (typeof v === 'number') {
        const cell = out[group][id];
        cell.avgComposite = round1(((cell.avgComposite ?? 0) * cell.n + v) / (cell.n + 1));
        cell.n++;
      }
    }
  }
  return out;
}

function csvCell(v: string | number | boolean | null | undefined): string {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function writeOutputs(report: BenchmarkReport, dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'latest.json'), JSON.stringify(report, null, 2));

  const header = [
    'case_id', 'source', 'target_language', 'category', 'model',
    'translation', 'composite', 'fidelity', 'semantic_roles', 'naturalness',
    'conversation', 'critical_error', 'judge_notes',
  ];
  const rows: string[] = [header.join(',')];
  for (const c of report.cases) {
    for (const a of report.adapters) {
      if (!a.available) continue;
      const j = c.judge[a.id];
      rows.push(
        [
          c.caseId, c.source, c.targetLanguage, c.category, a.id,
          c.outputs[a.id] ?? c.failures[a.id] ?? '',
          c.composite[a.id] ?? '', j?.fidelity ?? '', j?.semanticRoles ?? '',
          j?.naturalness ?? '', j?.conversationalQuality ?? '',
          j?.criticalError ?? '', j?.notes ?? '',
        ].map(csvCell).join(',')
      );
    }
  }
  const csv = rows.join('\n');
  fs.writeFileSync(path.join(dir, 'latest.csv'), csv);
  fs.writeFileSync(path.join(dir, 'human-review.csv'), csv);

  const md: string[] = [
    '# Translation benchmark report',
    '',
    `_Generated ${report.generatedAt}. Scores are composite/100 (higher is better). Tradeoffs below — no automatic production switch._`,
    '',
    '## Models',
    '',
    '| Model | Cases (ok) | Composite | Critical | Answered-instead | Pronoun errors | Natural | Conversational | p50 | p95 | Est. cost |',
    '|---|---|---|---|---|---|---|---|---|---|---|',
  ];
  for (const a of report.adapters) {
    md.push(
      `| ${a.label} | ${a.ok}/${a.cases} | ${a.avgComposite ?? 'n/a'} | ${a.criticalErrors} | ${a.answeredInstead} | ${a.pronounRoleErrors} | ${a.avgNaturalness ?? 'n/a'} | ${a.avgConversational ?? 'n/a'} | ${a.p50Ms ?? 'n/a'}ms | ${a.p95Ms ?? 'n/a'}ms | $${a.estCostUsd} |`
    );
  }
  md.push('', '## By language (composite)', '');
  for (const [lang, cells] of Object.entries(report.byLanguage)) {
    md.push(`- **${lang}**: ` + Object.entries(cells).map(([id, c]) => `${id} ${c.avgComposite ?? 'n/a'} (n=${c.n})`).join(' · '));
  }
  md.push('', '## By category (composite)', '');
  for (const [cat, cells] of Object.entries(report.byCategory)) {
    md.push(`- **${cat}**: ` + Object.entries(cells).map(([id, c]) => `${id} ${c.avgComposite ?? 'n/a'} (n=${c.n})`).join(' · '));
  }
  md.push('', '## Routing simulation (optional, not applied)', '');
  for (const line of report.routingSimulation) md.push(`- ${line}`);
  md.push('', '## Notes', '- BLEU/ROUGE intentionally excluded; multiple valid translations exist per case.', '- See human-review.csv for manual inspection of difficult cases.');
  fs.writeFileSync(path.join(dir, 'report.md'), md.join('\n'));
}
