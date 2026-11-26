// agent-gate: parse plain-text acceptance criteria and check them against a trace.
// A trace is a list of events. Tool calls look like:
//   {"type":"tool_call","tool":"edit_file","args":{"path":"a.js"},"ok":true}
// Messages look like: {"type":"message","text":"..."}

export function parseTrace(jsonl) {
  const events = [];
  jsonl.split(/\r?\n/).forEach((line, i) => {
    if (!line.trim()) return;
    try {
      events.push(JSON.parse(line));
    } catch {
      throw new Error(`trace line ${i + 1}: not valid JSON`);
    }
  });
  return events;
}

const STEP = /^(?:then|and)\s+(.*)$/i;

// Each rule: [regex, builder]. The builder gets the regex match and returns a check.
const RULES = [
  [/^never call (\S+)$/i, (m) => ({
    describe: `never call ${m[1]}`,
    run: (ev) => {
      const hit = calls(ev).filter((c) => c.tool === m[1]);
      return hit.length ? fail(`${m[1]} was called ${hit.length} time(s), first at step ${hit[0].step}`) : pass();
    },
  })],
  [/^call (\S+) at most (\d+) times?$/i, (m) => ({
    describe: `call ${m[1]} at most ${m[2]} times`,
    run: (ev) => {
      const n = calls(ev).filter((c) => c.tool === m[1]).length;
      return n > Number(m[2]) ? fail(`${m[1]} was called ${n} times`) : pass();
    },
  })],
  [/^call (\S+) before (\S+)$/i, (m) => ({
    describe: `call ${m[1]} before ${m[2]}`,
    run: (ev) => {
      const all = calls(ev);
      const second = all.find((c) => c.tool === m[2]);
      if (!second) return pass();
      const first = all.find((c) => c.tool === m[1]);
      if (!first) return fail(`${m[2]} was called at step ${second.step} but ${m[1]} never was`);
      return first.step < second.step ? pass() : fail(`${m[1]} (step ${first.step}) came after ${m[2]} (step ${second.step})`);
    },
  })],
  [/^every (\S+) must be preceded by (\S+) on the same (\S+)$/i, (m) => ({
    describe: `every ${m[1]} must be preceded by ${m[2]} on the same ${m[3]}`,
    run: (ev) => {
      const seen = new Set();
      for (const c of calls(ev)) {
        const key = c.args?.[m[3]];
        if (c.tool === m[2] && key !== undefined) seen.add(key);
        if (c.tool === m[1] && !seen.has(key)) {
          return fail(`${m[1]} at step ${c.step} on ${m[3]}=${JSON.stringify(key)} with no earlier ${m[2]}`);
        }
      }
      return pass();
    },
  })],
  [/^no call fails$/i, () => ({
    describe: 'no call fails',
    run: (ev) => {
      const bad = calls(ev).filter((c) => c.ok === false);
      return bad.length ? fail(`${bad.length} failed call(s), first: ${bad[0].tool} at step ${bad[0].step}`) : pass();
    },
  })],
  [/^at most (\d+) calls? fails?$/i, (m) => ({
    describe: `at most ${m[1]} calls fail`,
    run: (ev) => {
      const n = calls(ev).filter((c) => c.ok === false).length;
      return n > Number(m[1]) ? fail(`${n} calls failed`) : pass();
    },
  })],
  [/^the run takes at most (\d+) steps$/i, (m) => ({
    describe: `the run takes at most ${m[1]} steps`,
    run: (ev) => {
      const n = calls(ev).length;
      return n > Number(m[1]) ? fail(`${n} tool calls`) : pass();
    },
  })],
  [/^the final message contains "(.*)"$/i, (m) => ({
    describe: `the final message contains "${m[1]}"`,
    run: (ev) => (finalMessage(ev).toLowerCase().includes(m[1].toLowerCase()) ? pass() : fail('text not found in the final message')),
  })],
  [/^the final message does not contain "(.*)"$/i, (m) => ({
    describe: `the final message does not contain "${m[1]}"`,
    run: (ev) => (finalMessage(ev).toLowerCase().includes(m[1].toLowerCase()) ? fail('text found in the final message') : pass()),
  })],
];

const pass = () => ({ ok: true });
const fail = (detail) => ({ ok: false, detail });

// Tool calls numbered from 1 in trace order.
function calls(events) {
  let step = 0;
  return events.filter((e) => e.type === 'tool_call').map((e) => ({ ...e, step: ++step }));
}

function finalMessage(events) {
  const msgs = events.filter((e) => e.type === 'message');
  return msgs.length ? String(msgs[msgs.length - 1].text ?? '') : '';
}

export function parseCriteria(text) {
  const scenarios = [];
  let current = null;
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith('#')) return;
    const sc = line.match(/^scenario:\s*(.+)$/i);
    if (sc) {
      current = { name: sc[1], checks: [] };
      scenarios.push(current);
      return;
    }
    const st = line.match(STEP);
    if (!st || !current) throw new Error(`criteria line ${i + 1}: expected "Scenario:" or "Then/And ..." after one`);
    const body = st[1].trim();
    const rule = RULES.find(([re]) => re.test(body));
    if (!rule) throw new Error(`criteria line ${i + 1}: unknown rule "${body}"`);
    current.checks.push(rule[1](body.match(rule[0])));
  });
  if (!scenarios.length) throw new Error('criteria file has no Scenario');
  return scenarios;
}

export function evaluate(scenarios, events) {
  const results = scenarios.map((s) => ({
    name: s.name,
    checks: s.checks.map((c) => ({ rule: c.describe, ...c.run(events) })),
  }));
  const failed = results.flatMap((r) => r.checks).filter((c) => !c.ok).length;
  const total = results.flatMap((r) => r.checks).length;
  return { results, failed, total, ok: failed === 0 };
}

export function format(report) {
  const out = [];
  for (const r of report.results) {
    out.push(`Scenario: ${r.name}`);
    for (const c of r.checks) out.push(`  ${c.ok ? 'PASS' : 'FAIL'}  ${c.rule}${c.ok ? '' : `  -> ${c.detail}`}`);
  }
  out.push('', `${report.total - report.failed}/${report.total} criteria passed`);
  return out.join('\n');
}
