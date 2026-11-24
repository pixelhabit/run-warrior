// Tiny in-browser test runner (no Node or npm needed).
// Open tests/index.html through a local server to run all tests.

const results = [];

export function test(name, fn) {
  results.push({ name, fn });
}

export function todo(name) {
  results.push({ name, todo: true });
}

export function assertEqual(actual, expected, msg = '') {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg} expected ${e}, got ${a}`.trim());
}

export async function run(outEl) {
  let pass = 0, fail = 0, todos = 0;
  for (const t of results) {
    const li = document.createElement('li');
    if (t.todo) {
      todos++;
      li.textContent = `TODO  ${t.name}`;
      li.className = 'todo';
    } else {
      try {
        await t.fn();
        pass++;
        li.textContent = `PASS  ${t.name}`;
        li.className = 'pass';
      } catch (err) {
        fail++;
        li.textContent = `FAIL  ${t.name}: ${err.message}`;
        li.className = 'fail';
      }
    }
    outEl.appendChild(li);
  }
  document.title = fail ? `FAIL (${fail})` : `PASS (${pass})`;
  return { pass, fail, todos };
}
