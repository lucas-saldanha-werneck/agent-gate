import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { parseTrace, parseCriteria, evaluate } from '../src/gate.mjs';

const call = (tool, args = {}, ok = true) => ({ type: 'tool_call', tool, args, ok });
const msg = (text) => ({ type: 'message', text });
const run = (criteria, events) => evaluate(parseCriteria(`Scenario: t\n  Then ${criteria}`), events);

test('never call: passes and fails', () => {
  assert.equal(run('never call rm', [call('ls')]).ok, true);
  const r = run('never call rm', [call('ls'), call('rm')]);
  assert.equal(r.ok, false);
  assert.match(r.results[0].checks[0].detail, /step 2/);
});

test('at most N calls of a tool', () => {
  assert.equal(run('call ls at most 2 times', [call('ls'), call('ls')]).ok, true);
  assert.equal(run('call ls at most 1 time', [call('ls'), call('ls')]).ok, false);
});

test('call A before B', () => {
  assert.equal(run('call a before b', [call('a'), call('b')]).ok, true);
  assert.equal(run('call a before b', [call('b'), call('a')]).ok, false);
  assert.equal(run('call a before b', [call('b')]).ok, false);
  assert.equal(run('call a before b', [call('c')]).ok, true, 'vacuous when b never runs');
});

test('every edit must be preceded by read on the same path', () => {
  const rule = 'every edit must be preceded by read on the same path';
  assert.equal(run(rule, [call('read', { path: 'x' }), call('edit', { path: 'x' })]).ok, true);
  assert.equal(run(rule, [call('read', { path: 'x' }), call('edit', { path: 'y' })]).ok, false);
  assert.equal(run(rule, [call('edit', { path: 'x' })]).ok, false);
});

test('failure counts', () => {
  const ev = [call('a', {}, false), call('b')];
  assert.equal(run('no call fails', ev).ok, false);
  assert.equal(run('at most 1 call fail', ev).ok, true);
  assert.equal(run('at most 0 calls fail', ev).ok, false);
});

test('step limit counts tool calls only', () => {
  const ev = [call('a'), msg('hi'), call('b')];
  assert.equal(run('the run takes at most 2 steps', ev).ok, true);
  assert.equal(run('the run takes at most 1 steps', ev).ok, false);
});

test('final message checks use the last message, case-insensitive', () => {
  const ev = [msg('all green'), msg('I ran the Tests.')];
  assert.equal(run('the final message contains "tests"', ev).ok, true);
  assert.equal(run('the final message does not contain "all green"', ev).ok, true);
  assert.equal(run('the final message contains "x"', []).ok, false);
});

test('parser errors name the line', () => {
  assert.throws(() => parseCriteria('Scenario: a\n  Then sing a song'), /line 2.*unknown rule/);
  assert.throws(() => parseCriteria('Then never call x'), /line 1/);
  assert.throws(() => parseCriteria('# only a comment'), /no Scenario/);
  assert.throws(() => parseTrace('{"a":1}\nnot json'), /line 2/);
});

test('comments and blank lines are ignored; And continues a Scenario', () => {
  const s = parseCriteria('# c\n\nScenario: a\n  Then never call x\n  And never call y\n');
  assert.equal(s[0].checks.length, 2);
});

test('bundled examples: good passes, bad fails', () => {
  const sc = parseCriteria(readFileSync('examples/changes.criteria', 'utf8'));
  const good = evaluate(sc, parseTrace(readFileSync('examples/good.jsonl', 'utf8')));
  const bad = evaluate(sc, parseTrace(readFileSync('examples/bad.jsonl', 'utf8')));
  assert.equal(good.ok, true);
  assert.equal(good.total, 7);
  assert.equal(bad.ok, false);
  assert.equal(bad.failed, 5);
});

test('CLI exit codes: 0 pass, 1 fail, 2 usage/parse error', () => {
  const cli = (...a) => spawnSync('node', ['bin/agent-gate.mjs', ...a], { encoding: 'utf8' });
  assert.equal(cli('examples/changes.criteria', 'examples/good.jsonl').status, 0);
  const bad = cli('examples/changes.criteria', 'examples/bad.jsonl');
  assert.equal(bad.status, 1);
  assert.match(bad.stdout, /FAIL/);
  assert.equal(cli().status, 2);
  assert.equal(cli('nope.criteria', 'nope.jsonl').status, 2);
});
