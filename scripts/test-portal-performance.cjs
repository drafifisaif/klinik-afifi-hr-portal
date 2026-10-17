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
const { getFeedbackTargetOptions, getSelectableFeedbackStaff, isStaffFeedbackSource } = load("lib/feedback-targets.ts");
const { resolveFeedbackNotificationRecipients } = load("lib/notification-helpers.ts");
const { buildOwnerSummary } = load("lib/owner-summary.ts");
const { canViewFeedbackAttachment, getFeedbackAttachments, isFeedbackAttachmentPath, safeFeedbackFilename } = load("lib/feedback-attachments.ts");

test("feedback attachment metadata and download paths reject malformed files", () => {
  const batch = "97528d32-1b98-450a-8535-03beab78c5a2";
  const owner = "profile-1";
  assert.equal(safeFeedbackFilename("memo: HR/agenda?.pdf"), "agenda_.pdf");
  assert.equal(isFeedbackAttachmentPath(`feedback/${owner}/${batch}/agenda.pdf`, owner), true);
  assert.equal(isFeedbackAttachmentPath(`feedback/another/${batch}/agenda.pdf`, owner), false);
  assert.equal(isFeedbackAttachmentPath(`feedback/${owner}/${batch}/../agenda.pdf`, owner), false);
  assert.deepEqual(getFeedbackAttachments([{ path: "a", name: "a.pdf", size: 10, content_type: "application/pdf" }, { path: null }]), [
    { path: "a", name: "a.pdf", size: 10, content_type: "application/pdf" },
  ]);
});

test("feedback files follow the same viewer scope as feedback cards", () => {
  const feedback = { submitted_by: "owner", assigned_to: "assignee", target_type: "hr", branch_id: "branch-1", is_anonymous: true, category: "salary" };
  const viewer = (id, role = "staff", branchId = "") => ({ role, profile: { id, role, branch_id: branchId }, staffId: "", branchId });
  assert.equal(canViewFeedbackAttachment(feedback, viewer("owner")), true);
  assert.equal(canViewFeedbackAttachment(feedback, viewer("assignee")), true);
  assert.equal(canViewFeedbackAttachment(feedback, viewer("outsider")), false);
  assert.equal(canViewFeedbackAttachment(feedback, viewer("hr-user", "hr")), true);
  assert.equal(canViewFeedbackAttachment(feedback, viewer("operation-user", "operation")), false);
  assert.equal(canViewFeedbackAttachment(feedback, viewer("branch-user", "branch_pic", "branch-1")), false);
});

test("owner summary is aggregate-only and reports measured trends and critical attention", () => {
  const now = new Date("2026-10-14T08:00:00.000Z");
  const summary = buildOwnerSummary({
    now,
    staffRows: [
      { id: "s1", profile_id: "p1", status: "active", created_at: "2026-10-10T00:00:00.000Z", full_name: "Private Name" },
      { id: "s2", profile_id: "p1", status: "active", created_at: "2026-10-12T00:00:00.000Z" },
      { id: "s3", profile_id: "p2", status: "active", created_at: "2026-09-01T00:00:00.000Z" },
      { id: "s4", profile_id: "p3", status: "resigned", created_at: "2026-10-13T00:00:00.000Z" },
    ],
    branchRows: [{ id: "b1" }, { id: "b2" }],
    feedbackRows: [
      { id: "f1", status: "new", priority: "urgent", assigned_to_owner: true, message: "Private feedback" },
      { id: "f2", status: "escalated", priority: "normal", assigned_to_owner: false },
      { id: "f3", status: "resolved", priority: "urgent" },
      { id: "f4", status: "assigned", priority: "high" },
    ],
  });

  assert.deepEqual(summary.workforce, {
    active_people_count: 2,
    configured_clinic_count: 2,
    new_staff_profiles_last_30_days: 2,
    new_staff_profiles_previous_30_days: 1,
    staff_profile_creation_change_vs_previous_30_days: 1,
  });
  assert.equal(summary.attention.critical_open_feedback_count, 2);
  assert.equal(summary.attention.critical_open_feedback_assigned_to_owner_count, 1);
  assert.equal(JSON.stringify(summary).includes("Private Name"), false);
  assert.equal(JSON.stringify(summary).includes("Private feedback"), false);
  assert.equal(JSON.stringify(summary).includes("f1"), false);
});

test("feedback targets use manager labels and only active, branched, non-Lokum staff", () => {
  assert.deepEqual(getFeedbackTargetOptions("staff"), ["hr", "operation"]);
  assert.deepEqual(getFeedbackTargetOptions("branch_pic"), ["hr", "operation"]);
  assert.equal(isStaffFeedbackSource("staff"), true);
  assert.equal(isStaffFeedbackSource("operation"), false);
  assert.deepEqual(getFeedbackTargetOptions("hr"), ["staff", "operation", "portal_system"]);
  assert.deepEqual(getFeedbackTargetOptions("operation"), ["staff", "hr", "portal_system"]);
  assert.deepEqual(getFeedbackTargetOptions("super_admin"), ["hr", "operation", "portal_system"]);

  const branches = [{ id: "branch-1", name: "Ranau" }];
  const rows = [
    { id: "active", full_name: "Active Staff", status: "active", branch_id: "branch-1" },
    { id: "inactive", full_name: "Inactive Staff", status: "resigned", branch_id: "branch-1" },
    { id: "no-branch", full_name: "Unassigned Staff", status: "active", branch_id: null },
    { id: "wrong-branch", full_name: "Orphaned Staff", status: "active", branch_id: "missing-branch" },
    { id: "lokum", full_name: "Dr Lokum Kinabatangan", status: "active", branch_id: "branch-1" },
  ];
  assert.deepEqual(getSelectableFeedbackStaff(rows, branches).map((row) => row.id), ["active"]);
});

test("staff feedback notifications go only to the chosen manager, not owner or legacy assignee", async () => {
  const requestedRoles = [];
  const supabase = {
    from(table) {
      if (table === "staff") {
        return {
          select() {
            return {
              in() {
                return {
                  async eq(_column, status) {
                    assert.equal(status, "active");
                    return { data: [{ profile_id: "operation-active" }] };
                  },
                };
              },
            };
          },
        };
      }
      assert.equal(table, "profiles");
      return {
        select() {
          return {
            async in(_column, roles) {
              requestedRoles.push(...roles);
              return {
                data: roles.includes("operation")
                  ? [
                      { id: "operation-active", email: "operation@example.test" },
                      { id: "operation-stale", email: "old-operation@example.test" },
                    ]
                  : [{ id: "hr-manager", email: "hr@example.test" }],
              };
            },
          };
        },
      };
    },
  };
  const recipients = await resolveFeedbackNotificationRecipients(supabase, {
    targetType: "operation",
    sourceType: "staff",
    submitterProfileId: "staff-sender",
    assignedTo: "operation-stale",
    sourceProfile: { id: "staff-sender", role: "staff" },
  });
  assert.deepEqual(requestedRoles, ["operation"]);
  assert.deepEqual(recipients, [{ profile_id: "operation-active", email: "operation@example.test" }]);
});

test("WhatsApp webhook gets a short portal notice without feedback details", async () => {
  const previousWebhook = process.env.MAKE_HR_NOTIFICATIONS_WEBHOOK_URL;
  const previousAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  process.env.MAKE_HR_NOTIFICATIONS_WEBHOOK_URL = "https://hook.make.example/test";
  process.env.NEXT_PUBLIC_APP_URL = "https://hr.example.test/";
  let sentPayload;
  try {
    const loadWithFetch = loader({}, {
      fetch: async (_url, options) => {
        sentPayload = JSON.parse(options.body);
        return { ok: true };
      },
    });
    const { sendFeedbackNotificationToMake } = loadWithFetch("lib/make-notification.ts");
    const result = await sendFeedbackNotificationToMake({
      eventType: "feedback_new",
      feedbackId: "feedback-1",
      recipientPhone: "+60100000000",
    });
    assert.deepEqual(result, { configured: true, delivered: true });
    assert.equal(sentPayload.message, "Feedback baharu. E-mel notifikasi sudah dihantar. Butiran: https://hr.example.test/feedback/manage");
    assert.deepEqual(Object.keys(sentPayload).sort(), ["eventType", "feedbackId", "message", "portalUrl", "recipientPhone", "source"]);
    assert.equal(JSON.stringify(sentPayload).includes("feedbackContent"), false);
    assert.equal(JSON.stringify(sentPayload).includes("feedbackTitle"), false);
  } finally {
    if (previousWebhook === undefined) delete process.env.MAKE_HR_NOTIFICATIONS_WEBHOOK_URL;
    else process.env.MAKE_HR_NOTIFICATIONS_WEBHOOK_URL = previousWebhook;
    if (previousAppUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = previousAppUrl;
  }
});

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
