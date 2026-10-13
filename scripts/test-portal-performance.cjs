const assert = require("node:assert/strict");
const { readFileSync, existsSync } = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
function loader(mocks = {}, globals = {}) {
  const modules = new Map();
  function load(file) {
    if (modules.has(file)) return modules.get(file);
    const module = { exports: {} };
    const source = readFileSync(path.join(root, file), "utf8");
    const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    const localRequire = (name) => {
      if (Object.hasOwn(mocks, name)) return mocks[name];
      if (name === "server-only") return {};
      if (name.startsWith("@/")) {
        const base = name.slice(2);
        return load(base + (existsSync(path.join(root, base + ".ts")) ? ".ts" : ".tsx"));
      }
      return require(name);
    };
    new Function("require", "module", "exports", ...Object.keys(globals), compiled)(localRequire, module, module.exports, ...Object.values(globals));
    modules.set(file, module.exports);
    return module.exports;
  }
  return load;
}

const load = loader();
const { normalizePortalRanges, parsePortalRangeQuery, portalRangeQuery } = load("lib/portal-date-range.ts");
const { fetchPagedRows } = load("lib/paged-query.ts");

test("date ranges reject invalid/injected/unbounded input and merge overlaps", () => {
  for (const value of [[], [{ start: "2026-02-30", end: "2026-03-01" }], [{ start: "2025-01-01", end: "2026-12-31" }], [{ start: "2026-10-14),id.neq.0", end: "2026-10-15" }]]) {
    assert.throws(() => normalizePortalRanges(value));
  }
  const input = [{ start: "2026-10-14", end: "2026-10-14" }, { start: "2026-10-01", end: "2026-10-31" }];
  assert.deepEqual(parsePortalRangeQuery(new URLSearchParams(portalRangeQuery(input))), [{ start: "2026-10-01", end: "2026-10-31" }]);
});

test("pagination retains all rows beyond old limits, even with a lower server cap", async () => {
  const source = Array.from({ length: 1203 }, (_, id) => ({ id }));
  const starts = [];
  const result = await fetchPagedRows(async (from, to) => {
    starts.push(from);
    return { data: source.slice(from, Math.min(to + 1, from + 200)), error: null, count: from === 0 ? source.length : null };
  });
  assert.deepEqual(result.rows, source);
  assert.deepEqual(starts, [0, 200, 400, 600, 800, 1000, 1200]);
  let calls = 0;
  await fetchPagedRows(async () => { calls++; return { data: [{ id: 1 }], count: 1, error: null }; });
  assert.equal(calls, 1, "small datasets must not add a second query wave");
});

test("pagination surfaces a failed page instead of presenting a partial report", async () => {
  const result = await fetchPagedRows(async (from) => from === 0
    ? { data: [{ id: 1 }], count: 2, error: null }
    : { data: null, error: { message: "network failure" } });
  assert.deepEqual(result, { rows: [], error: "network failure" });
});

function mockClient(log, name) {
  return { from(table) {
    const operations = [];
    const query = { then(resolve, reject) {
      log.push({ name, table, operations });
      return Promise.resolve({ data: [], error: null, count: 0 }).then(resolve, reject);
    } };
    for (const method of ["select", "order", "range", "eq", "or"]) query[method] = (...args) => { operations.push([method, ...args]); return query; };
    return query;
  } };
}

test("data loading scopes privileged roster reads to the authenticated staff or branch", async () => {
  const log = [];
  const sessionClient = mockClient(log, "session");
  const adminClient = mockClient(log, "admin");
  const data = loader({ "@/lib/supabase/admin": { createAdminClient: () => adminClient } })("lib/portal-range-data.ts");
  const ranges = [{ start: "2026-10-01", end: "2026-10-31" }];
  for (const role of ["staff", "branch_pic", "hr", "super_admin", "operation"]) {
    log.length = 0;
    const context = { supabase: sessionClient, role, staff: { id: "staff-1", branch_id: "branch-1", full_name: "Synthetic", ic_no: "must-not-ship" }, profile: { branch_id: "wrong-branch" } };
    await data.loadAttendanceRange(context, ranges);
    const roster = log.find(row => row.table === "rosters");
    if (role === "staff" || role === "branch_pic") {
      const restriction = ["eq", role === "staff" ? "staff_id" : "branch_id", role === "staff" ? "staff-1" : "branch-1"];
      assert.equal(roster.name, "admin");
      for (const query of log) assert.ok(query.operations.some(op => JSON.stringify(op) === JSON.stringify(restriction)));
    } else {
      assert.equal(roster.name, "session", "administrative pages must retain session RLS");
    }
    const directory = await data.loadPortalStaff(context);
    if (role === "staff") assert.equal(directory.rows[0].ic_no, undefined);
  }
  log.length = 0;
  await data.loadAttendanceRange({ supabase: sessionClient, role: "staff", staff: null, profile: null }, ranges);
  await data.loadRosterRange({ supabase: sessionClient, role: "branch_pic", staff: null, profile: null }, ranges);
  assert.equal(log.length, 0, "missing staff/branch identity must fail closed");
});

test("unread badge requests a recipient-scoped count, including legacy null flags", async () => {
  const log = [];
  await load("lib/data.ts").fetchUnreadNotificationCount(mockClient(log, "session"), "profile-1");
  assert.deepEqual(log[0].operations, [
    ["select", "id", { count: "exact", head: true }],
    ["eq", "recipient_profile_id", "profile-1"],
    ["or", "is_read.eq.false,is_read.is.null"],
  ]);
});

test("report filters preserve branch precedence, leave and correction semantics", () => {
  const { buildAttendanceReportRows } = load("lib/attendance-report.ts");
  const input = {
    attendanceRows: [{ id: "a", staff_id: "s", branch_id: "attendance-branch", attendance_date: "2026-10-01", check_in_at: "2026-10-01T08:00:00+08:00", check_out_at: "2026-10-01T17:00:00+08:00" }],
    rosterRows: [{ id: "r", staff_id: "s", branch_id: "roster-branch", roster_date: "2026-10-01", shift_template_id: "day" }],
    staffRows: [{ id: "s", branch_id: "staff-branch", full_name: "Synthetic" }],
    branchRows: [{ id: "roster-branch", name: "Roster branch", code: "PUTATAN" }],
    adjustmentRows: [{ attendance_record_id: "a", status: "approved", reason: "Correction" }],
    leaveRows: [{ staff_id: "s", status: "approved", start_date: "2026-10-01", end_date: "2026-10-01", leave_type: "medical_leave", reason: "Leave" }],
    settingRows: [], shiftTemplateRows: [{ id: "day", name: "Day", start_time: "08:00", end_time: "17:00" }],
    filters: { fromDate: "2026-10-01", toDate: "2026-10-31" },
  };
  const all = buildAttendanceReportRows(input);
  assert.equal(all.length, 1);
  assert.equal(all[0].attendanceStatus, "mc");
  assert.equal(all[0].correctionStatus, "approved");
  assert.equal(all[0].remarks, "Leave | Correction");
  assert.deepEqual(buildAttendanceReportRows({ ...input, filters: { ...input.filters, branchId: "roster-branch", staffId: "s" } }), all);
  assert.equal(buildAttendanceReportRows({ ...input, filters: { ...input.filters, branchId: "attendance-branch" } }).length, 0);
  assert.equal(buildAttendanceReportRows({ ...input, filters: { ...input.filters, branchScopeId: "other" } }).length, 0);
});

test("Malaysia shift labels and late minutes agree on UTC servers and Malaysia browsers", () => {
  const originalTimezone = process.env.TZ;
  const utils = load("lib/utils.ts");
  const { buildAttendanceReportRows } = load("lib/attendance-report.ts");
  try {
    for (const timezone of ["UTC", "Asia/Kuala_Lumpur"]) {
      process.env.TZ = timezone;
      assert.equal(utils.formatMalaysiaTime("2026-10-14T15:00:00"), "03:00 pm");
      assert.equal(utils.parseMalaysiaDateTime("2026-10-14T15:00:00").toISOString(), "2026-10-14T07:00:00.000Z");
      assert.equal(utils.parseMalaysiaDateTime("2026-10-14T07:00:00Z").toISOString(), "2026-10-14T07:00:00.000Z");
      assert.equal(utils.parseMalaysiaDateTime("08:00", new Date("2026-10-13T20:30:00Z")).toISOString(), "2026-10-14T00:00:00.000Z");
      const rows = buildAttendanceReportRows({
        attendanceRows: [{ staff_id: "s", attendance_date: "2026-10-14", scheduled_start: "08:00:00", check_in_at: "2026-10-14T08:30:00+08:00" }],
        rosterRows: [], staffRows: [], branchRows: [], shiftTemplateRows: [], leaveRows: [], settingRows: [], adjustmentRows: [],
        filters: { fromDate: "2026-10-14", toDate: "2026-10-14" },
      });
      assert.equal(rows[0].lateMinutes, 20);
    }
  } finally {
    if (originalTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = originalTimezone;
  }
});

function hookHarness() {
  const slots = [];
  let cursor = 0, dirty = false;
  let effects = [];
  const react = {
    useMemo(callback, deps) {
      const index = cursor++;
      if (!slots[index] || deps.some((value, i) => !Object.is(value, slots[index].deps[i]))) slots[index] = { deps, value: callback() };
      return slots[index].value;
    },
    useRef(value) {
      const index = cursor++;
      if (!slots[index]) slots[index] = { current: value };
      return slots[index];
    },
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial;
      return [slots[index], value => { slots[index] = typeof value === "function" ? value(slots[index]) : value; dirty = true; }];
    },
    useEffect(callback, deps) {
      const index = cursor++;
      if (!slots[index] || deps.some((value, i) => !Object.is(value, slots[index].deps[i]))) {
        slots[index]?.cleanup?.();
        slots[index] = { deps };
        effects.push(() => { slots[index].cleanup = callback(); });
      }
    },
  };
  return { react, render(fn) {
    let result;
    for (let i = 0; i < 20; i++) {
      dirty = false; cursor = 0; effects = [];
      result = fn(); effects.forEach(effect => effect());
      if (!dirty) return result;
    }
    throw new Error("Hook render loop");
  }, dispose() { slots.forEach(slot => slot?.cleanup?.()); } };
}

function fakeTimers() {
  const timers = new Map();
  let id = 0;
  return { timers, setTimeout(fn, delay) { timers.set(++id, { fn, delay }); return id; }, clearTimeout(id) { timers.delete(id); }, run() {
    const [id, timer] = timers.entries().next().value;
    timers.delete(id);
    return timer.fn();
  } };
}

test("minute clock ticks at boundaries, resumes immediately and cleans up", () => {
  const harness = hookHarness(), timers = fakeTimers();
  let now = 61_000, resume;
  const document = { visibilityState: "visible", addEventListener(_event, fn) { resume = fn; }, removeEventListener() { resume = null; } };
  const { useMinuteNow } = loader({ react: harness.react }, { ...timers, Date: { now: () => now }, document })("components/use-minute-now.ts");
  assert.equal(harness.render(useMinuteNow), 61_000);
  assert.equal([...timers.timers.values()][0].delay, 59_020);
  now = 120_020; timers.run();
  assert.equal(harness.render(useMinuteNow), now);
  now = 350_000; resume();
  assert.equal(harness.render(useMinuteNow), now);
  assert.equal(timers.timers.size, 1);
  harness.dispose();
  assert.equal(timers.timers.size, 0);
  assert.equal(resume, null);
});

test("date loading avoids duplicate initial fetches and rejects stale responses", async () => {
  const harness = hookHarness(), timers = fakeTimers(), requests = [];
  const initial = { rows: [{ id: "initial" }], error: null };
  const initialRanges = [{ start: "2026-10-01", end: "2026-10-31" }];
  let ranges = initialRanges;
  const fetch = (_url, options) => new Promise(resolve => requests.push({ resolve, signal: options.signal }));
  const { useRangeData } = loader({ react: harness.react }, { ...timers, fetch })("components/use-range-data.ts");
  const render = () => harness.render(() => useRangeData("/api/roster/data", initial, initialRanges, ranges));
  assert.equal(render().loading, false);
  assert.equal(timers.timers.size, 0);
  ranges = [{ start: "2026-09-01", end: "2026-09-30" }];
  assert.equal(render().loading, true);
  const oldRequest = timers.run();
  ranges = [{ start: "2026-08-01", end: "2026-08-31" }];
  render();
  assert.equal(requests[0].signal.aborted, true);
  const latestRequest = timers.run();
  requests[1].resolve({ ok: true, json: async () => ({ rows: [{ id: "latest" }], error: null }) });
  await latestRequest;
  assert.equal(render().data.rows[0].id, "latest");
  requests[0].resolve({ ok: true, json: async () => ({ rows: [{ id: "stale" }], error: null }) });
  await oldRequest;
  assert.equal(render().data.rows[0].id, "latest");
  assert.equal(render().loading, false);
  harness.dispose();
});

function elements(node, predicate) {
  if (Array.isArray(node)) return node.flatMap(child => elements(child, predicate));
  if (!node || typeof node !== "object") return [];
  return [...(predicate(node) ? [node] : []), ...elements(node.props?.children, predicate)];
}

test("Attendance absence totals advance with time without changing data or filters", () => {
  const harness = hookHarness();
  let now = new Date("2026-10-14T08:30:00+08:00").getTime();
  const day = load("lib/utils.ts").getMalaysiaDateString(new Date(now));
  const initialRangeData = { attendanceRows: [], adjustmentRows: [], leaveRows: [], error: null, rosterRows: [{ id: "r", staff_id: "s", branch_id: "b", roster_date: day, custom_start_time: "08:00", custom_end_time: "17:00" }] };
  const { AttendancePage } = loader({
    react: harness.react,
    "next/navigation": { useRouter: () => ({}) },
    "@/lib/supabase/client": { createClient: () => null },
    "@/components/use-minute-now": { useMinuteNow: () => now },
    "@/components/use-range-data": { useRangeData: () => ({ data: initialRangeData, loading: false, error: null }) },
  })("components/attendance-page.tsx");
  const props = { initialRangeData, initialRanges: [{ start: day, end: day }], role: "hr", profile: { id: "p", role: "hr" }, currentStaff: null, staffRows: [{ id: "s", branch_id: "b", full_name: "Synthetic" }], branchRows: [{ id: "b", name: "Synthetic", code: "RANAU" }], settingRows: [], shiftTemplateRows: [], networkRows: [] };
  const render = () => harness.render(() => AttendancePage(props));
  const absentCount = tree => {
    const card = elements(tree, node => node.type === "button" && elements(node, child => child.type === "p" && child.props.children === "Absent Today").length)[0];
    return elements(card, node => node.type === "p" && typeof node.props.children === "number")[0].props.children;
  };
  assert.equal(absentCount(render()), 0);
  now = new Date("2026-10-14T09:01:00+08:00").getTime();
  assert.equal(absentCount(render()), 1);
  harness.dispose();
});

test("roster date loading preserves drafts and clears them when a new empty builder day finishes loading", () => {
  const harness = hookHarness();
  const initialRosterData = { rows: [{ id: "r", staff_id: "s", branch_id: "b", roster_date: "2026-10-14", notes: "Saved note", role_on_shift: "staff" }], error: null };
  let result = { data: initialRosterData, loading: false, error: null };
  const { RosterManagementPage } = loader({
    react: harness.react,
    "next/navigation": { useRouter: () => ({}) },
    "@/lib/supabase/client": { createClient: () => null },
    "@/components/use-range-data": { useRangeData: () => result },
  })("components/roster-management-page.tsx");
  const props = { initialRosterData, initialRanges: [{ start: "2026-10-14", end: "2026-10-27" }], role: "hr", profile: { id: "p", role: "hr" }, currentStaff: null, branches: [{ id: "b", name: "Synthetic" }], staff: [{ id: "s", branch_id: "b", status: "active", position: "Assistant" }], shiftTemplates: [] };
  const render = () => harness.render(() => RosterManagementPage(props));
  const note = tree => elements(tree, node => node.type === "textarea" && node.props.placeholder === "Notes for this shift")[0];
  note(render()).props.onChange({ target: { value: "Unsaved draft" } });
  assert.equal(note(render()).props.value, "Unsaved draft");
  result = { ...result, loading: true }; render();
  result = { data: { rows: initialRosterData.rows.map(row => ({ ...row })), error: null }, loading: false, error: null };
  assert.equal(note(render()).props.value, "Unsaved draft");
  const dateInput = elements(render(), node => node.type === "input" && node.props.type === "date").at(-1);
  dateInput.props.onChange({ target: { value: "2026-10-15" } });
  result = { ...result, loading: true };
  const save = elements(render(), node => node.type === "button" && node.props.type === "submit")[0];
  assert.equal(save.props.disabled, true);
  result = { data: { rows: [], error: null }, loading: false, error: null };
  assert.equal(note(render()), undefined);
  harness.dispose();
});
