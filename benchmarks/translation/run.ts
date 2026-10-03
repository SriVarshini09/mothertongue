#!/usr/bin/env tsx
/**
 * Translation benchmark runner.
 *
 *   npm run benchmark:translation -- --smoke
 *   npm run benchmark:translation -- --langs=Telugu,Tamil,Hindi --adapters=current-gpt
 *   npm run benchmark:translation -- --limit=20 --no-judge
 *
 * Flags:
 *   --smoke            10 cases x Te/Ta/Hi x all available adapters
 *   --langs=a,b        restrict target languages (default: all in the set)
 *   --adapters=a,b     restrict adapters (default: all available)
 *   --limit=N          max cases per language (default: all)
 *   --no-judge         skip the LLM judge (structural signals only, $0)
 *   --judge-model=ID   judge model (default gpt-4o-mini)
 *   --out=DIR          results dir (default benchmarks/translation/results)
 *
 * Needs OPENAI_API_KEY for the GPT adapter + judge. SARVAM_API_KEY and
 * local HF models are optional — missing ones skip gracefully.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { getOpenAI } from '@/lib/ai/client';
import type {
  BenchmarkCase,
  BenchmarkReport,
  CaseResult,
  JudgeScore,
} from './types';
import type { TranslationAdapter } from './adapters/types';
import { currentGptAdapter } from './adapters/current-gpt';
import { sarvamAdapter } from './adapters/sarvam';
import { indictrans2Adapter, stopIndicTrans2 } from './adapters/indictrans2';
import { nllbAdapter, stopNllb } from './adapters/nllb';
import { analyzeSensitivity, structuralFlags } from './evaluators/structural';
import { judgeCase } from './evaluators/llm-judge';
import { compositeScore } from './score';
import { breakdown, summarizeAdapter, writeOutputs } from './report';

const ROOT = __dirname;

function loadEnvLocal(): void {
  const file = path.join(ROOT, '..', '..', '.env.local');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf-8').split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
}

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.slice(name.length + 3);
}
function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function loadCases(): BenchmarkCase[] {
  const out: BenchmarkCase[] = [];
  for (const f of ['cases-te.json', 'cases-ta.json', 'cases-hi.json', 'cases-subsets.json']) {
    out.push(...(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf-8')) as BenchmarkCase[]));
  }
  return out;
}

function errorCategory(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/missing-key|invalid_api_key|401|403/i.test(msg)) return 'auth';
  if (/timeout/i.test(msg)) return 'timeout';
  if (/unsupported-language/i.test(msg)) return 'unsupported-language';
  if (/empty translation/i.test(msg)) return 'empty';
  if (/ENOTFOUND|EAI_AGAIN|fetch failed|network/i.test(msg)) return 'network';
  return 'unknown';
}

async function main(): Promise<void> {
  loadEnvLocal();
  const smoke = flag('smoke');
  const noJudge = flag('no-judge');
  const judgeModel = arg('judge-model') ?? 'gpt-4o-mini';
  const outDir = arg('out') ?? path.join(ROOT, 'results');
  const langFilter = arg('langs')?.split(',').map((s) => s.trim());
  const adapterFilter = arg('adapters')?.split(',').map((s) => s.trim());
  const limit = arg('limit') ? Number(arg('limit')) : undefined;

  let cases = loadCases();
  if (smoke) {
    const pick = (prefix: string, n: number) => cases.filter((c) => c.id.startsWith(prefix)).slice(0, n);
    cases = [...pick('te-', 4), ...pick('ta-', 3), ...pick('hi-', 3)];
  }
  if (langFilter) cases = cases.filter((c) => langFilter.includes(c.targetLanguage));
  if (limit) {
    const seen: Record<string, number> = {};
    cases = cases.filter((c) => {
      seen[c.targetLanguage] ??= 0;
      if (seen[c.targetLanguage] >= limit) return false;
      seen[c.targetLanguage]++;
      return true;
    });
  }

  const allAdapters: TranslationAdapter[] = [
    currentGptAdapter,
    sarvamAdapter,
    indictrans2Adapter,
    nllbAdapter,
  ];
  const adapters = allAdapters.filter((a) => !adapterFilter || adapterFilter.includes(a.id));
  const availability = new Map(adapters.map((a) => [a.id, a.isAvailable()]));
  console.log(`Cases: ${cases.length} | Adapters: ${adapters.map((a) => a.id).join(', ')}`);

  const results: CaseResult[] = [];
  const latencies: Record<string, number[]> = Object.fromEntries(adapters.map((a) => [a.id, [] as number[]]));
  const costs: Record<string, { inTokens: number; outTokens: number; usd: number }> = Object.fromEntries(
    adapters.map((a) => [a.id, { inTokens: 0, outTokens: 0, usd: 0 }])
  );
  let judgeIn = 0;
  let judgeOut = 0;

  const openai = !noJudge && process.env.OPENAI_API_KEY ? getOpenAI() : null;
  if (!noJudge && !openai) console.log('NOTE: no OPENAI_API_KEY — judge scores will be empty.');

  let done = 0;
  for (const c of cases) {
    const outputs: Record<string, string> = {};
    const failures: Record<string, string> = {};
    for (const a of adapters) {
      const avail = availability.get(a.id)!;
      if (!avail.available) {
        failures[a.id] = `unavailable: ${avail.reason}`;
        continue;
      }
      if (!a.supportedLanguages.includes(c.targetLanguage)) {
        failures[a.id] = 'unsupported: language not covered by adapter';
        continue;
      }
      try {
        const r = await a.translate(c.source, c.targetLanguage);
        outputs[a.id] = r.translation;
        latencies[a.id].push(r.latencyMs);
        const inT = r.inputTokens ?? Math.ceil((c.source.length + 400) / 4);
        const outT = r.outputTokens ?? Math.ceil(r.translation.length / 4);
        costs[a.id].inTokens += inT;
        costs[a.id].outTokens += outT;
        if (a.id === 'current-gpt') {
          costs[a.id].usd += (inT / 1e6) * 0.15 + (outT / 1e6) * 0.6;
        }
      } catch (err) {
        failures[a.id] = `failed: ${errorCategory(err)}`;
      }
    }

    // Blind judge: one call per case across all OK outputs, labels shuffled.
    const okIds = Object.keys(outputs);
    const shuffled = [...okIds].sort(() => Math.random() - 0.5);
    const labels = shuffled.map((_, i) => `Model ${String.fromCharCode(65 + i)}`);
    const idToLabel = Object.fromEntries(shuffled.map((id, i) => [id, labels[i]]));
    let judge: Record<string, JudgeScore | null> = Object.fromEntries(okIds.map((id) => [id, null]));
    if (openai && okIds.length > 0 && !noJudge) {
      try {
        const r = await judgeCase(
          openai,
          judgeModel,
          c.source,
          c.targetLanguage,
          shuffled.map((id) => ({ label: idToLabel[id], translation: outputs[id] }))
        );
        judgeIn += r.inputTokens;
        judgeOut += r.outputTokens;
        for (const id of okIds) judge[id] = r.scores[idToLabel[id]] ?? null;
      } catch {
        /* judge failure must not kill the run */
      }
    }

    const structural: CaseResult['structural'] = {};
    const composite: CaseResult['composite'] = {};
    for (const id of okIds) {
      structural[id] = structuralFlags(c.source, outputs[id], c.targetLanguage, c.category);
      composite[id] = compositeScore(judge[id], structural[id], outputs[id]);
    }
    for (const id of Object.keys(failures)) {
      if (!outputs[id]) {
        structural[id] = structuralFlags(c.source, '', c.targetLanguage, c.category);
        composite[id] = null;
      }
    }
    results.push({
      caseId: c.id,
      targetLanguage: c.targetLanguage,
      category: c.category,
      source: c.source,
      sensitivity: analyzeSensitivity(c.source, c.category),
      outputs,
      failures,
      latencies: Object.fromEntries(okIds.map((id) => [id, latencies[id][latencies[id].length - 1]])),
      judge,
      structural,
      composite,
    });
    done++;
    if (done % 10 === 0 || done === cases.length) console.log(`  ${done}/${cases.length}`);
  }

  const judgeUsd = (judgeIn / 1e6) * 0.15 + (judgeOut / 1e6) * 0.6;
  const summaries = adapters.map((a) => {
    const avail = availability.get(a.id)!;
    const cost = { ...costs[a.id], usd: costs[a.id].usd + (a.id === 'current-gpt' ? 0 : 0) };
    return summarizeAdapter(a.id, a.label, avail.available, avail.reason, results, latencies[a.id], cost);
  });

  const activeIds = adapters.filter((a) => availability.get(a.id)!.available).map((a) => a.id);
  const report: BenchmarkReport = {
    generatedAt: new Date().toISOString(),
    adapters: summaries,
    byLanguage: breakdown(results, (c) => c.targetLanguage, activeIds),
    byCategory: breakdown(results, (c) => c.category, activeIds),
    routingSimulation: buildRoutingNote(summaries),
    cases: results,
  };
  (report as Record<string, unknown>).judgeCostUsd = Math.round(judgeUsd * 10000) / 10000;
  writeOutputs(report, outDir);

  console.log('\n=== Summary (composite / 100) ===');
  for (const s of summaries) {
    console.log(
      `${s.id}: ${s.avgComposite ?? 'n/a'} | ok ${s.ok}/${s.cases} | critical ${s.criticalErrors} | ` +
        `answered ${s.answeredInstead} | pronoun-err ${s.pronounRoleErrors} | ` +
        `p50 ${s.p50Ms ?? '?'}ms p95 ${s.p95Ms ?? '?'}ms | $${s.estCostUsd} (+judge $${(report as Record<string, unknown>).judgeCostUsd})`
    );
  }
  console.log(`Wrote ${outDir}/latest.json, latest.csv, human-review.csv, report.md`);

  stopNllb();
  stopIndicTrans2();
}

function buildRoutingNote(summaries: Array<{ id: string; avgComposite: number | null }>): string[] {
  const ran = summaries.filter((s) => s.avgComposite !== null);
  if (ran.length < 2) {
    return [
      'Only one adapter produced scores in this run — routing simulation needs 2+ scored adapters.',
      'Hypothesis to test later: Indic targets (Te/Ta/Hi/Kn/Ml) via Sarvam or IndicTrans2; global targets (Ja/Ko/Es) via the current GPT path.',
    ];
  }
  const sorted = [...ran].sort((a, b) => (b.avgComposite ?? 0) - (a.avgComposite ?? 0));
  return [
    `By composite alone the order would be: ${sorted.map((s) => `${s.id} (${s.avgComposite})`).join(' > ')}.`,
    'Do not switch production on composite alone — compare critical errors, pronoun errors, latency, and cost per language first (see tables above).',
  ];
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Benchmark failed:', err instanceof Error ? err.message : err);
    stopNllb();
    stopIndicTrans2();
    process.exit(1);
  });
