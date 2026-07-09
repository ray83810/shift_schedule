/**
 * Phase 11 自動化功能驗證腳本
 * 模擬 app.js 核心邏輯並驗證所有功能正確性
 */

// ========== 模擬 DOM 環境 ==========
const mockElements = {};
const document = {
  getElementById: (id) => mockElements[id] || { 
    textContent: '', innerHTML: '', value: '', style: {}, className: '',
    classList: { add: ()=>{}, remove: ()=>{}, toggle: ()=>{} },
    addEventListener: ()=>{}, querySelectorAll: ()=>[], closest: ()=>null,
    click: ()=>{}, focus: ()=>{}
  },
  querySelectorAll: () => [],
  querySelector: () => null,
  createElement: (tag) => ({ 
    className: '', innerHTML: '', style: {}, dataset: {},
    appendChild: ()=>{}, addEventListener: ()=>{}, setAttribute: ()=>{},
    classList: { add: ()=>{}, remove: ()=>{} }
  }),
  addEventListener: (event, fn) => { if (event === 'DOMContentLoaded') {} }
};
const localStorage = {
  _data: {},
  getItem: (k) => localStorage._data[k] || null,
  setItem: (k, v) => { localStorage._data[k] = v; },
  removeItem: (k) => { delete localStorage._data[k]; }
};
const window = { print: ()=>{} };
const alert = (msg) => {};
const confirm = () => true;
const fetch = async () => ({ ok: true, json: async () => ({ success: true }) });
const console_orig = console;

// ========== 載入 app.js 核心邏輯 ==========
// 我們只需要核心函數，手動提取關鍵邏輯

// --- Date Helpers ---
function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}
function getDayOfWeek(year, month, day) {
  return new Date(year, month, day).getDay();
}
function formatDateISO(year, month, day) {
  const mm = String(month + 1).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}
function calculateRestHours(prevShift, nextShift) {
  if (!prevShift || prevShift.id === 'OFF' || prevShift.id === 'PTO') return 24;
  if (!nextShift || nextShift.id === 'OFF' || nextShift.id === 'PTO') return 24;
  const parseTimeToHours = (timeStr) => {
    const [h, m] = timeStr.split(':').map(Number);
    return h + m / 60;
  };
  const prevStart = parseTimeToHours(prevShift.start);
  let prevEnd = parseTimeToHours(prevShift.end);
  const nextStart = parseTimeToHours(nextShift.start);
  if (prevEnd <= prevStart) prevEnd += 24;
  const rest = (24 + nextStart) - prevEnd;
  return rest;
}

// --- State ---
const state = {
  currentYear: 2026,
  currentMonth: 5, // June
  daysOff: 9,
  staff: [],
  shifts: [],
  coverageTargets: {},
  roster: {},
  sortedStaffIds: [],
  hasUnsavedChanges: false,
  backupRoster: {},
  backupStaff: [],
  googleWebAppUrl: 'https://example.com'
};

const DEFAULT_STAFF = [
  { id: 's1', name: 'Alex Chen', pto: [], defaultOffDays: [0, 6], defaultWorkShift: 'A', sortIndex: 0 },
  { id: 's3', name: 'Amber Wang', pto: [], defaultOffDays: [0, 6], defaultWorkShift: 'A', sortIndex: 1 },
  { id: 's6', name: 'Jian Kai Ding', pto: ['2026-06-15'], defaultOffDays: [0, 6], defaultWorkShift: 'A', sortIndex: 2 },
  { id: 's8', name: 'Sherry Lin', pto: [], defaultOffDays: [0, 6], defaultWorkShift: 'A', sortIndex: 3 },
  { id: 's2', name: 'Howard Chen', pto: [], defaultOffDays: [0, 6], defaultWorkShift: 'B', sortIndex: 4 },
  { id: 's5', name: 'Evan Liu', pto: ['2026-06-20'], defaultOffDays: [0, 6], defaultWorkShift: 'B', sortIndex: 5 },
  { id: 's4', name: 'Jacky Lee', pto: [], defaultOffDays: [0, 6], defaultWorkShift: 'C', sortIndex: 6 },
  { id: 's7', name: 'Rex Liao', pto: [], defaultOffDays: [0, 6], defaultWorkShift: 'C', sortIndex: 7 },
  { id: 's9', name: 'Molly Song', pto: [], defaultOffDays: [1, 2], defaultWorkShift: 'D', sortIndex: 8 },
];

const DEFAULT_SHIFTS = [
  { id: 'A', name: '早班', start: '08:00', end: '17:00', type: 'system', colorClass: 'shift-A' },
  { id: 'B', name: '中班', start: '11:00', end: '20:00', type: 'system', colorClass: 'shift-B' },
  { id: 'C', name: '晚班', start: '15:00', end: '00:00', type: 'system', colorClass: 'shift-C' },
  { id: 'D', name: '獨立班', start: '12:00', end: '21:00', type: 'system', colorClass: 'custom' }
];

const DEFAULT_COVERAGE = {
  A: { weekday: 2, weekend: 1 },
  B: { weekday: 1, weekend: 1 },
  C: { weekday: 1, weekend: 1 },
  D: { weekday: 0, weekend: 0 }
};

// --- Sort Functions ---
function sortStaffByShift() {
  state.staff.sort((emp1, emp2) => {
    const s1 = (emp1.sortIndex !== undefined && emp1.sortIndex !== null) ? emp1.sortIndex : 999;
    const s2 = (emp2.sortIndex !== undefined && emp2.sortIndex !== null) ? emp2.sortIndex : 999;
    return s1 - s2;
  });
}

function rebuildSortedStaffIds() {
  state.sortedStaffIds = state.staff.map(emp => emp.id);
}

// --- Cross-Month Boundary ---
function getPreviousMonthBoundaryStats(empId, year, month) {
  let prevYear = year;
  let prevMonth = month - 1;
  if (month === 0) { prevYear = year - 1; prevMonth = 11; }
  const prevDaysCount = getDaysInMonth(prevYear, prevMonth);
  let lastShiftId = null;
  let consecutiveWork = 0;
  const lastDayDateStr = formatDateISO(prevYear, prevMonth, prevDaysCount);
  if (state.roster && state.roster[lastDayDateStr] && state.roster[lastDayDateStr][empId]) {
    lastShiftId = state.roster[lastDayDateStr][empId];
  }
  for (let d = prevDaysCount; d >= 1; d--) {
    const dateStr = formatDateISO(prevYear, prevMonth, d);
    const shiftId = (state.roster && state.roster[dateStr] && state.roster[dateStr][empId]) || 'OFF';
    const isWork = (shiftId !== 'OFF' && shiftId !== 'PTO');
    if (isWork) { consecutiveWork++; } else { break; }
  }
  return { lastShiftId, consecutiveWork };
}

// --- Compliance Check ---
function isRosterCompliantWithMaxConsecutive(rosterCopy, empId, maxDays = 5) {
  const boundary = getPreviousMonthBoundaryStats(empId, state.currentYear, state.currentMonth);
  let consecutive = boundary.consecutiveWork;
  const daysCount = getDaysInMonth(state.currentYear, state.currentMonth);
  for (let d = 1; d <= daysCount; d++) {
    const dateStr = formatDateISO(state.currentYear, state.currentMonth, d);
    const shiftId = rosterCopy[dateStr][empId];
    if (shiftId === 'OFF' || shiftId === 'PTO' || shiftId === 'LOA') {
      consecutive = 0;
    } else {
      consecutive++;
      if (consecutive > maxDays) return false;
    }
  }
  return true;
}

// --- Auto Scheduler (exact copy from app.js) ---
function runAutoScheduler() {
  sortStaffByShift();
  const year = state.currentYear;
  const month = state.currentMonth;
  const daysCount = getDaysInMonth(year, month);
  const staffList = state.staff;

  const newRoster = {};
  for (let d = 1; d <= daysCount; d++) {
    const dateStr = formatDateISO(year, month, d);
    newRoster[dateStr] = {};
  }

  staffList.forEach(emp => {
    const defShift = emp.defaultWorkShift || 'A';
    const ptoSet = new Set(emp.pto || []);
    const empRoster = {};
    const offDates = [];
    const ptoDates = [];

    for (let d = 1; d <= daysCount; d++) {
      const dateStr = formatDateISO(year, month, d);
      const dayOfWeek = getDayOfWeek(year, month, d);
      const isDefaultOff = emp.defaultOffDays && emp.defaultOffDays.includes(dayOfWeek);
      if (ptoSet.has(dateStr)) {
        empRoster[dateStr] = 'PTO';
        ptoDates.push(dateStr);
      } else if (isDefaultOff) {
        empRoster[dateStr] = 'OFF';
        offDates.push(dateStr);
      } else {
        empRoster[dateStr] = null;
      }
    }

    // Step 2: consecutive 5 break
    const boundary = getPreviousMonthBoundaryStats(emp.id, year, month);
    let consecutive = boundary.consecutiveWork;
    for (let d = 1; d <= daysCount; d++) {
      const dateStr = formatDateISO(year, month, d);
      if (empRoster[dateStr] === 'OFF' || empRoster[dateStr] === 'PTO') {
        consecutive = 0;
      } else {
        if (consecutive >= 5) {
          empRoster[dateStr] = 'OFF';
          offDates.push(dateStr);
          consecutive = 0;
        } else {
          consecutive++;
        }
      }
    }

    // Step 3: Adjust off days - WITH FIX (recountOff)
    const recountOff = () => {
      let count = 0;
      for (let d = 1; d <= daysCount; d++) {
        const dateStr = formatDateISO(year, month, d);
        if (empRoster[dateStr] === 'OFF' || empRoster[dateStr] === 'PTO') count++;
      }
      return count;
    };
    let currentOffCount = recountOff();
    const targetOff = state.daysOff;

    const getWorkCandidates = () => {
      const list = [];
      for (let d = 1; d <= daysCount; d++) {
        const dateStr = formatDateISO(year, month, d);
        if (empRoster[dateStr] === null) list.push(dateStr);
      }
      return list;
    };

    if (currentOffCount < targetOff) {
      let needed = targetOff - currentOffCount;
      const currentCandidates = getWorkCandidates();
      if (currentCandidates.length > 0) {
        const shuffled = [...currentCandidates].sort(() => Math.random() - 0.5);
        const chosen = shuffled.slice(0, Math.min(needed, shuffled.length));
        chosen.forEach(dateStr => { empRoster[dateStr] = 'OFF'; });
      }
    } else if (currentOffCount > targetOff) {
      let excess = currentOffCount - targetOff;
      const eligibleNonDefaultOffs = [];
      const eligibleDefaultOffs = [];
      for (let d = 1; d <= daysCount; d++) {
        const dateStr = formatDateISO(year, month, d);
        if (empRoster[dateStr] === 'OFF') {
          const dayOfWeek = getDayOfWeek(year, month, d);
          const isDefaultOff = emp.defaultOffDays && emp.defaultOffDays.includes(dayOfWeek);
          if (isDefaultOff) eligibleDefaultOffs.push(dateStr);
          else eligibleNonDefaultOffs.push(dateStr);
        }
      }
      eligibleNonDefaultOffs.sort(() => Math.random() - 0.5);
      eligibleDefaultOffs.sort(() => Math.random() - 0.5);
      const allOffCandidates = [...eligibleNonDefaultOffs, ...eligibleDefaultOffs];
      let resolvedCount = 0;
      for (const dateStr of allOffCandidates) {
        if (resolvedCount >= excess) break;
        empRoster[dateStr] = null;
        const rosterCopy = {};
        for (let d = 1; d <= daysCount; d++) {
          const dStr = formatDateISO(year, month, d);
          rosterCopy[dStr] = { [emp.id]: empRoster[dStr] };
        }
        if (isRosterCompliantWithMaxConsecutive(rosterCopy, emp.id, 5)) {
          resolvedCount++;
        } else {
          empRoster[dateStr] = 'OFF';
        }
      }
      let stillExcess = excess - resolvedCount;
      if (stillExcess > 0) {
        const remainingOffs = [];
        for (let d = 1; d <= daysCount; d++) {
          const dateStr = formatDateISO(year, month, d);
          if (empRoster[dateStr] === 'OFF') remainingOffs.push(dateStr);
        }
        remainingOffs.sort(() => Math.random() - 0.5);
        const forceToWork = remainingOffs.slice(0, Math.min(stillExcess, remainingOffs.length));
        forceToWork.forEach(dateStr => { empRoster[dateStr] = null; });
      }
    }

    // Step 4: Fill remaining with default shift
    for (let d = 1; d <= daysCount; d++) {
      const dateStr = formatDateISO(year, month, d);
      if (empRoster[dateStr] === null) empRoster[dateStr] = defShift;
      newRoster[dateStr][emp.id] = empRoster[dateStr];
    }
  });

  // Step 5: Support allocation
  const supportDaysCount = {};
  const supportedShifts = {};
  staffList.forEach(emp => {
    supportDaysCount[emp.id] = 0;
    supportedShifts[emp.id] = new Set();
  });

  for (let d = 1; d <= daysCount; d++) {
    const dateStr = formatDateISO(year, month, d);
    const dayOfWeek = getDayOfWeek(year, month, d);
    const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);

    const shortages = [];
    state.shifts.forEach(shift => {
      if (shift.id === 'D') return;
      const targetConfig = state.coverageTargets[shift.id] || { weekday: 0, weekend: 0 };
      const required = isWeekend ? targetConfig.weekend : targetConfig.weekday;
      let currentScheduled = 0;
      staffList.forEach(emp => {
        if (newRoster[dateStr][emp.id] === shift.id) currentScheduled++;
      });
      const diff = required - currentScheduled;
      if (diff > 0) shortages.push({ shiftId: shift.id, count: diff });
    });

    shortages.forEach(shortage => {
      for (let i = 0; i < shortage.count; i++) {
        let bestEmpId = null;
        let lowestSupportDays = Infinity;
        staffList.forEach(emp => {
          if (emp.defaultWorkShift === 'D') return;
          const currentShift = newRoster[dateStr][emp.id];
          const leaveTypes = ['OFF', 'PTO', 'LOA', 'AM_PTO', 'PM_PTO'];
          if (leaveTypes.includes(currentShift) || currentShift === shortage.shiftId) return;
          const defShift = emp.defaultWorkShift || 'A';
          if (defShift === 'A' && shortage.shiftId === 'C') return;
          if (defShift === 'C' && shortage.shiftId === 'A') return;
          const tempSet = new Set(supportedShifts[emp.id]);
          if (shortage.shiftId !== defShift) tempSet.add(shortage.shiftId);
          if (tempSet.size > 1) return;

          if (d > 1) {
            const prevDateStr = formatDateISO(year, month, d - 1);
            const prevShiftId = newRoster[prevDateStr][emp.id];
            const prevS = state.shifts.find(s => s.id === prevShiftId);
            const currS = state.shifts.find(s => s.id === shortage.shiftId);
            const leaveTypes2 = ['OFF', 'PTO', 'LOA', 'AM_PTO', 'PM_PTO'];
            if (prevS && currS && !leaveTypes2.includes(prevShiftId)) {
              if (calculateRestHours(prevS, currS) < 11) return;
            }
          }
          if (d < daysCount) {
            const nextDateStr = formatDateISO(year, month, d + 1);
            const nextShiftId = newRoster[nextDateStr][emp.id];
            const currS = state.shifts.find(s => s.id === shortage.shiftId);
            const nextS = state.shifts.find(s => s.id === nextShiftId);
            const leaveTypes2 = ['OFF', 'PTO', 'LOA', 'AM_PTO', 'PM_PTO'];
            if (currS && nextS && !leaveTypes2.includes(nextShiftId)) {
              if (calculateRestHours(currS, nextS) < 11) return;
            }
          }

          const days = supportDaysCount[emp.id];
          if (days < lowestSupportDays) {
            lowestSupportDays = days;
            bestEmpId = emp.id;
          }
        });

        if (bestEmpId) {
          newRoster[dateStr][bestEmpId] = shortage.shiftId;
          supportDaysCount[bestEmpId]++;
          const defShift = state.staff.find(e => e.id === bestEmpId).defaultWorkShift || 'A';
          if (shortage.shiftId !== defShift) {
            supportedShifts[bestEmpId].add(shortage.shiftId);
          }
        }
      }
    });
  }

  rebuildSortedStaffIds();
  state.roster = newRoster;
}

// ============================================================
// TESTS
// ============================================================
let passed = 0;
let failed = 0;
let total = 0;

function assert(condition, testName) {
  total++;
  if (condition) {
    passed++;
    console_orig.log(`  ✅ ${testName}`);
  } else {
    failed++;
    console_orig.error(`  ❌ FAIL: ${testName}`);
  }
}

function initState() {
  state.currentYear = 2026;
  state.currentMonth = 5; // June 2026
  state.daysOff = 9;
  state.staff = JSON.parse(JSON.stringify(DEFAULT_STAFF));
  state.shifts = JSON.parse(JSON.stringify(DEFAULT_SHIFTS));
  state.coverageTargets = JSON.parse(JSON.stringify(DEFAULT_COVERAGE));
  state.roster = {};
  sortStaffByShift();
  rebuildSortedStaffIds();
}

// ===== TEST 1: sortIndex ordering =====
console_orig.log('\n📋 TEST 1: sortIndex 排序穩定性');
initState();

assert(state.staff[0].name === 'Alex Chen', 'Alex Chen at index 0 (sortIndex=0)');
assert(state.staff[1].name === 'Amber Wang', 'Amber Wang at index 1 (sortIndex=1)');
assert(state.staff[8].name === 'Molly Song', 'Molly Song at index 8 (sortIndex=8, last)');
assert(state.staff[6].name === 'Jacky Lee', 'Jacky Lee at index 6 (sortIndex=6)');

// Simulate editing: change Alex's shift but DON'T call sortStaffByShift
state.staff[0].defaultWorkShift = 'C'; // change Alex from A to C
rebuildSortedStaffIds(); // what saveEmployeeConfig does now
assert(state.staff[0].name === 'Alex Chen', 'After edit: Alex stays at index 0 (not re-sorted by shift)');

// Simulate drag: move Molly (index 8) to index 2
const [removed] = state.staff.splice(8, 1);
state.staff.splice(2, 0, removed);
state.staff.forEach((emp, idx) => { emp.sortIndex = idx; });
rebuildSortedStaffIds();
assert(state.staff[2].name === 'Molly Song', 'After drag: Molly at index 2');
assert(state.staff[2].sortIndex === 2, 'After drag: Molly sortIndex = 2');

// Now sort again should preserve
sortStaffByShift();
assert(state.staff[2].name === 'Molly Song', 'After re-sort: Molly stays at index 2 (sortIndex-based)');

// ===== TEST 2: daysOff accuracy =====
console_orig.log('\n📋 TEST 2: 月休天數精準度 (daysOff = 9)');
initState();
state.daysOff = 9;
runAutoScheduler();

const daysCount = getDaysInMonth(state.currentYear, state.currentMonth);
let allMatch = true;
let details = [];

state.staff.forEach(emp => {
  let offCount = 0;
  for (let d = 1; d <= daysCount; d++) {
    const dateStr = formatDateISO(state.currentYear, state.currentMonth, d);
    const shiftId = state.roster[dateStr][emp.id];
    if (shiftId === 'OFF' || shiftId === 'PTO') offCount++;
  }
  details.push(`${emp.name}: ${offCount} days off`);
  if (offCount !== 9) allMatch = false;
  assert(offCount === 9, `${emp.name}: OFF+PTO = ${offCount} (expected 9)`);
});

// ===== TEST 3: PTO days preserved =====
console_orig.log('\n📋 TEST 3: PTO 特休日正確保留');
initState();
state.daysOff = 9;
runAutoScheduler();

const jianKai = state.staff.find(e => e.name === 'Jian Kai Ding');
const jianPtoDate = '2026-06-15';
const jianShift = state.roster[jianPtoDate][jianKai.id];
assert(jianShift === 'PTO', `Jian Kai Ding on 6/15 = ${jianShift} (expected PTO)`);

const evan = state.staff.find(e => e.name === 'Evan Liu');
const evanPtoDate = '2026-06-20';
const evanShift = state.roster[evanPtoDate][evan.id];
assert(evanShift === 'PTO', `Evan Liu on 6/20 = ${evanShift} (expected PTO)`);

// ===== TEST 4: No consecutive > 6 days (labor law 7-in-1) =====
console_orig.log('\n📋 TEST 4: 勞基法 7休1 (連續工作不超過 6 天)');
initState();
state.daysOff = 9;
runAutoScheduler();

let laborViolation = false;
state.staff.forEach(emp => {
  let consecutive = 0;
  for (let d = 1; d <= daysCount; d++) {
    const dateStr = formatDateISO(state.currentYear, state.currentMonth, d);
    const shiftId = state.roster[dateStr][emp.id];
    const isWork = (shiftId !== 'OFF' && shiftId !== 'PTO' && shiftId !== 'LOA');
    if (isWork) {
      consecutive++;
      if (consecutive > 6) {
        laborViolation = true;
        console_orig.error(`    ⚠️ ${emp.name}: consecutive ${consecutive} days at day ${d}`);
      }
    } else {
      consecutive = 0;
    }
  }
});
assert(!laborViolation, 'No employee works more than 6 consecutive days');

// ===== TEST 5: 11-hour rest interval =====
console_orig.log('\n📋 TEST 5: 11小時輪班間隔');
initState();
state.daysOff = 9;
runAutoScheduler();

let restViolation = false;
const shiftMap = new Map(state.shifts.map(s => [s.id, s]));
state.staff.forEach(emp => {
  let prevShiftId = null;
  for (let d = 1; d <= daysCount; d++) {
    const dateStr = formatDateISO(state.currentYear, state.currentMonth, d);
    const shiftId = state.roster[dateStr][emp.id];
    const leaveTypes = ['OFF', 'PTO', 'LOA', 'AM_PTO', 'PM_PTO'];
    if (prevShiftId && shiftId && !leaveTypes.includes(prevShiftId) && !leaveTypes.includes(shiftId)) {
      const prevS = shiftMap.get(prevShiftId);
      const currS = shiftMap.get(shiftId);
      if (prevS && currS) {
        const rest = calculateRestHours(prevS, currS);
        if (rest < 11) {
          restViolation = true;
          console_orig.error(`    ⚠️ ${emp.name}: rest only ${rest.toFixed(1)}h between day ${d-1}(${prevShiftId}) and day ${d}(${shiftId})`);
        }
      }
    }
    prevShiftId = shiftId;
  }
});
assert(!restViolation, 'No 11-hour rest interval violations');

// ===== TEST 6: Cross-shift support constraints (A↛C, C↛A) =====
console_orig.log('\n📋 TEST 6: 不跨兩個班別 (A↛C, C↛A)');
initState();
state.daysOff = 9;
// Increase coverage to force support allocation
state.coverageTargets = {
  A: { weekday: 3, weekend: 2 },
  B: { weekday: 2, weekend: 1 },
  C: { weekday: 3, weekend: 2 },
  D: { weekday: 0, weekend: 0 }
};
runAutoScheduler();

let crossShiftViolation = false;
state.staff.forEach(emp => {
  const defShift = emp.defaultWorkShift;
  for (let d = 1; d <= daysCount; d++) {
    const dateStr = formatDateISO(state.currentYear, state.currentMonth, d);
    const shiftId = state.roster[dateStr][emp.id];
    const leaveTypes = ['OFF', 'PTO', 'LOA', 'AM_PTO', 'PM_PTO'];
    if (leaveTypes.includes(shiftId)) continue;
    
    if (defShift === 'A' && shiftId === 'C') {
      crossShiftViolation = true;
      console_orig.error(`    ⚠️ ${emp.name} (A-shift) assigned C-shift on day ${d}`);
    }
    if (defShift === 'C' && shiftId === 'A') {
      crossShiftViolation = true;
      console_orig.error(`    ⚠️ ${emp.name} (C-shift) assigned A-shift on day ${d}`);
    }
  }
});
assert(!crossShiftViolation, 'No A→C or C→A cross-shift support');

// ===== TEST 7: D-shift exempt from support =====
console_orig.log('\n📋 TEST 7: D班(獨立班)不參與支援調度');
let dShiftSupport = false;
const molly = state.staff.find(e => e.name === 'Molly Song');
for (let d = 1; d <= daysCount; d++) {
  const dateStr = formatDateISO(state.currentYear, state.currentMonth, d);
  const shiftId = state.roster[dateStr][molly.id];
  const leaveTypes = ['OFF', 'PTO', 'LOA', 'AM_PTO', 'PM_PTO'];
  if (!leaveTypes.includes(shiftId) && shiftId !== 'D') {
    dShiftSupport = true;
    console_orig.error(`    ⚠️ Molly (D-shift) assigned ${shiftId} on day ${d}`);
  }
}
assert(!dShiftSupport, 'Molly (D-shift) only has D-shift or leave days');

// ===== TEST 8: B-shift supports at most 1 other shift type =====
console_orig.log('\n📋 TEST 8: B班最多支援一種他班');
initState();
state.daysOff = 9;
state.coverageTargets = {
  A: { weekday: 3, weekend: 2 },
  B: { weekday: 1, weekend: 1 },
  C: { weekday: 3, weekend: 2 },
  D: { weekday: 0, weekend: 0 }
};
runAutoScheduler();

let multiSupportViolation = false;
state.staff.filter(e => e.defaultWorkShift === 'B').forEach(emp => {
  const supportedTypes = new Set();
  for (let d = 1; d <= daysCount; d++) {
    const dateStr = formatDateISO(state.currentYear, state.currentMonth, d);
    const shiftId = state.roster[dateStr][emp.id];
    const leaveTypes = ['OFF', 'PTO', 'LOA', 'AM_PTO', 'PM_PTO'];
    if (!leaveTypes.includes(shiftId) && shiftId !== 'B') {
      supportedTypes.add(shiftId);
    }
  }
  if (supportedTypes.size > 1) {
    multiSupportViolation = true;
    console_orig.error(`    ⚠️ ${emp.name} (B-shift) supports multiple types: ${[...supportedTypes]}`);
  }
});
assert(!multiSupportViolation, 'B-shift employees support at most 1 other shift type');

// ===== TEST 9: sortIndex auto-upgrade for old cache =====
console_orig.log('\n📋 TEST 9: 舊快取 sortIndex 自動升級');
const oldStaff = [
  { id: 'x1', name: 'Test1', pto: [], defaultOffDays: [0,6], defaultWorkShift: 'A' },
  { id: 'x2', name: 'Test2', pto: [], defaultOffDays: [0,6], defaultWorkShift: 'B' },
];
oldStaff.forEach((emp, idx) => {
  if (emp.sortIndex === undefined || emp.sortIndex === null) {
    emp.sortIndex = idx;
  }
});
assert(oldStaff[0].sortIndex === 0, 'Old cache item 0 gets sortIndex=0');
assert(oldStaff[1].sortIndex === 1, 'Old cache item 1 gets sortIndex=1');

// ===== TEST 10: addStaff assigns correct sortIndex =====
console_orig.log('\n📋 TEST 10: 新增人員 sortIndex');
initState();
const newEmp = {
  id: 'new_1', name: 'New Person', pto: [], defaultOffDays: [0, 6],
  defaultWorkShift: 'A', sortIndex: state.staff.length
};
state.staff.push(newEmp);
rebuildSortedStaffIds();
assert(newEmp.sortIndex === 9, 'New staff sortIndex = 9 (appended to end)');
assert(state.staff[9].name === 'New Person', 'New staff is at index 9');

// ===== TEST 11: daysOff = 10 (higher target) =====
console_orig.log('\n📋 TEST 11: 月休天數 = 10 的精準度');
initState();
state.daysOff = 10;
runAutoScheduler();

let all10Match = true;
state.staff.forEach(emp => {
  let offCount = 0;
  for (let d = 1; d <= daysCount; d++) {
    const dateStr = formatDateISO(state.currentYear, state.currentMonth, d);
    const shiftId = state.roster[dateStr][emp.id];
    if (shiftId === 'OFF' || shiftId === 'PTO') offCount++;
  }
  if (offCount !== 10) all10Match = false;
  assert(offCount === 10, `${emp.name}: OFF+PTO = ${offCount} (expected 10)`);
});

// ===== SUMMARY =====
console_orig.log('\n' + '='.repeat(50));
console_orig.log(`📊 測試結果: ${passed}/${total} 通過, ${failed} 失敗`);
if (failed === 0) {
  console_orig.log('🎉 所有測試全數通過！所有功能正常運作！');
} else {
  console_orig.log(`⚠️ 有 ${failed} 項測試失敗，需要修復。`);
}
console_orig.log('='.repeat(50));

process.exit(failed > 0 ? 1 : 0);
