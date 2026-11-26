#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { parseTrace, parseCriteria, evaluate, format } from '../src/gate.mjs';

const [criteriaPath, tracePath] = process.argv.slice(2);
if (!criteriaPath || !tracePath) {
  console.error('usage: agent-gate <criteria-file> <trace.jsonl>');
  process.exit(2);
}
try {
  const report = evaluate(parseCriteria(readFileSync(criteriaPath, 'utf8')), parseTrace(readFileSync(tracePath, 'utf8')));
  console.log(format(report));
  process.exit(report.ok ? 0 : 1);
} catch (e) {
  console.error(`error: ${e.message}`);
  process.exit(2);
}
