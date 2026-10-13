import { spawnSync } from 'node:child_process';
import { cwd } from './paths.mjs';
export function requireExit(result, label) {
 if (result.error || result.signal !== null || result.status !== 0) throw new Error(label + ' failed (' + (result.error?.code ?? result.signal ?? result.status) + ')');
 if (typeof result.stdout !== 'string' || typeof result.stderr !== 'string') throw new Error(label + ' output missing');
 return result;
}
export function run(command, args, options = {}) {
 const result = spawnSync(command, args, { cwd, env: process.env, encoding: 'utf8', timeout: 120_000, maxBuffer: 32 * 1024 * 1024, ...options });
 process.stdout.write(result.stdout ?? ''); process.stderr.write(result.stderr ?? '');
 return requireExit(result, command);
}

/** Parse actual node:test TAP results, not case labels in comment/output text.
 * Each suite uses test(), not describe(): suites=0 and counts reconcile all
 * nested test results. Unknown output, contradictory summaries/plans and every
 * skip/TODO/cancel/failure are rejected. Subprocess success is mandatory too.
 */
export function parseTap(result, expectedNames) {
 requireExit(result, 'node:test');
 const lines = result.stdout.replace(/\r\n/g, '\n').trimEnd().split('\n');
 if (lines[0] !== 'TAP version 13' || lines.filter(x => x === 'TAP version 13').length !== 1) throw new Error('One TAP13 stream required');
 const top = [], results = []; const summaries = new Map(); const plans = [];
 const contexts = new Map([[0, { count: 0, pending: null, planned: false }]]);
 let diagnosticIndent = null;
 for (const line of lines.slice(1)) {
  if (diagnosticIndent !== null) {
   if (line === ' '.repeat(diagnosticIndent) + '...') { diagnosticIndent = null; continue; }
   if (line.trim() && line.search(/\S/) < diagnosticIndent) throw new Error('Malformed TAP diagnostic');
   continue;
  }
  const diagnostic = /^(\s+)---$/.exec(line);
  if (diagnostic) { diagnosticIndent = diagnostic[1].length; continue; }
  if (/^\s*Bail out!/i.test(line) || /^\s*not ok\b/.test(line) || /^\s*(?:ok|not ok).*#\s*(SKIP|TODO)\b/i.test(line)) throw new Error('Failed/skipped/TODO TAP');
  const subtest = /^(\s*)# Subtest: (.+)$/.exec(line);
  if (subtest) {
   const indent = subtest[1].length;
   if (indent % 4 !== 0) throw new Error('Invalid node:test indentation');
   if (indent && !contexts.get(indent - 4)?.pending) throw new Error('Orphan nested TAP test');
   const context = contexts.get(indent) ?? { count: 0, pending: null, planned: false };
   if (context.pending !== null || context.planned) throw new Error('Unfinished/already planned TAP test');
   context.pending = subtest[2]; contexts.set(indent, context); continue;
  }
  const passed = /^(\s*)ok ([1-9]\d*) - (.+)$/.exec(line);
  if (passed) {
   const indent = passed[1].length, context = contexts.get(indent), child = contexts.get(indent + 4);
   if (!context || context.planned || context.pending !== passed[3] || Number(passed[2]) !== context.count + 1
    || (child && (!child.planned || child.pending !== null))) throw new Error('TAP result/subtest/number mismatch');
   contexts.delete(indent + 4); context.pending = null; context.count++;
   results.push({ indent, number: Number(passed[2]), name: passed[3], parent: indent ? contexts.get(0).pending : null });
   if (!passed[1]) top.push(results.at(-1));
   continue;
  }
  const plan = /^(\s*)1\.\.([1-9]\d*)$/.exec(line);
  if (plan) {
   const context = contexts.get(plan[1].length);
   if (!context || context.pending !== null || context.planned || context.count !== Number(plan[2])) throw new Error('TAP nested/final plan mismatch');
   context.planned = true;
   if (!plan[1]) plans.push(Number(plan[2])); continue;
  }
  const summary = /^# (tests|suites|pass|fail|cancelled|skipped|todo) (\d+)$/.exec(line);
  if (summary) {
   if (summaries.has(summary[1])) throw new Error('Duplicate TAP summary');
   summaries.set(summary[1], Number(summary[2])); continue;
  }
  if (/^\s*#/.test(line) || line === '') continue;
  throw new Error('Unrecognized TAP record');
 }
 if (diagnosticIndent !== null || contexts.size !== 1 || !contexts.get(0).planned || plans.length !== 1 || plans[0] !== top.length || !top.length) throw new Error('Nonempty complete TAP plan required');
 if (summaries.size !== 7 || summaries.get('tests') !== results.length || summaries.get('pass') !== results.length || !results.length
  || ['suites', 'fail', 'cancelled', 'skipped', 'todo'].some(key => summaries.get(key) !== 0)) throw new Error('Contradictory TAP summary');
 if (top.some((r, i) => r.number !== i + 1)) throw new Error('Invalid top-level TAP numbering');
 const names = top.map(r => r.name);
 if (new Set(names).size !== names.length || expectedNames.length !== names.length
  || expectedNames.some(expected => names.filter(n => n === expected || n.startsWith(expected + ' / ')).length !== 1)) throw new Error('Exact mandatory executed identities required');
 const finalPlan = lines.findIndex(line => /^1\.\./.test(line));
 if (lines.slice(finalPlan + 1).some(line => /^ok |^\s*# Subtest:/.test(line))) throw new Error('TAP test after final plan');
 return Object.freeze({ tests: results.length, cases: Object.freeze(names), variants: Object.freeze(results.filter(r => r.indent > 0).map(r => r.name)), executions: Object.freeze(results), fail: 0, cancelled: 0, skipped: 0, todo: 0 });
}
