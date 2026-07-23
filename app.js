// Sample demo data matching the user's latest screenshot
const SAMPLE_DATA = [
  { subject: "Physics by Rakshak Sir", lectures: "15/38", dpp: "2/5", backlog: "33h 15m 41s" },
  { subject: "Biology by Aarushi Ma'am", lectures: "6/31", dpp: "1/5", backlog: "10h 35m 51s" },
  { subject: "Physical Chemistry by Sunil Sir", lectures: "5/24", dpp: "1/4", backlog: "07h 14m 06s" },
  { subject: "Mathematics by Ritik Sir", lectures: "3/27", dpp: "0/4", backlog: "04h 16m 51s" },
  { subject: "Botany by Samridhi Ma'am", lectures: "4/16", dpp: "0/3", backlog: "04h 13m 27s" },
  { subject: "English", lectures: "1/18", dpp: "0/10", backlog: "02h 03m 02s" }
];

// Sample demo chapter data for Aarushi Ma'am (showing Botany / Zoology split)
const SAMPLE_CHAPTERS = [
  { chNum: "CH - 01", title: "Cell: The Unit Of Life (Botany)", lectures: "3/9", dpp: "0/8" },
  { chNum: "CH - 02", title: "The Living World (Zoology)", lectures: "3/3", dpp: "2/2" },
  { chNum: "CH - 03", title: "Animal Kingdom (Zoology)", lectures: "0/10", dpp: "0/9" },
  { chNum: "CH - 04", title: "Biological Classification...", lectures: "0/5", dpp: "0/4" }
];

// Subject Icon Mapping for Lumina UI
const SUBJECT_ICONS = {
  "Physics": "bolt",
  "Botany": "eco",
  "Mathematics": "functions",
  "Physical Chemistry": "science",
  "English": "menu_book",
  "Zoology": "pets"
};

const SUBJECT_EMOJIS = {
  "Physics": "⚛️",
  "Botany": "🌿",
  "Mathematics": "📐",
  "Physical Chemistry": "🧪",
  "English": "📖",
  "Zoology": "🐾"
};

// App State
let state = {
  subjects: [],
  preferences: {
    dailyHoursTarget: 3.0,
    targetDate: "",
    excludeDays: [0] // Sunday excluded by default
  },
  studyToday: {}, // Track time studied today per subject in seconds
  completedActionsToday: {} // Track completed action items today
};

// Pomodoro Timer State
let timer = {
  timeLeft: 1500, // 25 minutes
  totalDuration: 1500,
  isRunning: false,
  intervalId: null,
  mode: "pomodoro",
  activeSubjectIndex: ""
};

// SVG stroke offset math constants (Radius 45% of 320/384px ~ 100px r => 2*pi*100 ~ 628)
const CIRCLE_CIRCUMFERENCE = 628;

// Helper functions for conversions
function parseTimeToSeconds(timeStr) {
  if (!timeStr || timeStr === "0s") return 0;
  let seconds = 0;
  const hMatch = timeStr.match(/(\d+)\s*h/);
  const mMatch = timeStr.match(/(\d+)\s*m/);
  const sMatch = timeStr.match(/(\d+)\s*s/);
  
  if (hMatch) seconds += parseInt(hMatch[1]) * 3600;
  if (mMatch) seconds += parseInt(mMatch[1]) * 60;
  if (sMatch) seconds += parseInt(sMatch[1]);
  
  return seconds;
}

function formatSecondsToReadable(seconds) {
  if (seconds <= 0) return "0s";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  
  let result = [];
  if (h > 0) result.push(`${h}h`);
  if (m > 0) result.push(`${m}m`);
  
  return result.join(" ") || "0s";
}

function formatSecondsToHrsMins(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

// Filter and normalize subjects based on user curriculum selection
function filterAndNormalizeSubjects(rawData) {
  return rawData.map(item => {
    let subjectName = item.subject || "";
    
    if (subjectName.toLowerCase().includes("samridhi") && subjectName.toLowerCase().includes("botany")) {
      return { ...item, subject: "Botany by Samridhi Ma'am" };
    }
    if (subjectName.toLowerCase().includes("rakshak") && subjectName.toLowerCase().includes("physics")) {
      return { ...item, subject: "Physics by Rakshak Sir" };
    }
    if (subjectName.toLowerCase().includes("sunil") && subjectName.toLowerCase().includes("chemistry")) {
      return { ...item, subject: "Physical Chemistry by Sunil Sir" };
    }
    if (subjectName.trim().toLowerCase() === "english") {
      return { ...item, subject: "English" };
    }
    if (subjectName.toLowerCase().includes("ritik") && subjectName.toLowerCase().includes("mathematics")) {
      return { ...item, subject: "Mathematics by Ritik Sir" };
    }
    if (subjectName.toLowerCase().includes("aarushi") && (subjectName.toLowerCase().includes("biology") || subjectName.toLowerCase().includes("zoology"))) {
      return { ...item, subject: "Zoology by Aarushi Ma'am" };
    }
    return null;
  }).filter(item => item !== null);
}

// LocalStorage persistence
function saveState() {
  localStorage.setItem("pw_backlog_state", JSON.stringify(state));
}

function loadState() {
  const saved = localStorage.getItem("pw_backlog_state");
  if (saved) {
    try {
      state = JSON.parse(saved);
      if (!state.subjects) state.subjects = [];
      if (!state.preferences) state.preferences = { dailyHoursTarget: 3.0, targetDate: "", excludeDays: [0] };
      if (!state.studyToday) state.studyToday = {};
      if (!state.completedActionsToday) state.completedActionsToday = {};
    } catch (e) {
      console.error("Error loading saved state", e);
    }
  }

  // Automatic Midnight / New Day Reset Logic
  const todayStr = new Date().toISOString().split('T')[0]; // e.g. "2026-07-23"
  if (state.lastPlanDate !== todayStr) {
    console.log("[PW Backlog Planner] New day detected! Resetting Daily Action Plan.");
    state.studyToday = {};
    state.completedActionsToday = {};
    if (state.customTasks && state.customTasks.length > 0) {
      state.customTasks.forEach(task => task.completed = false);
    }
    state.lastPlanDate = todayStr;
    saveState();
  }
}

// Calculate the schedule dates/hours
function calculateTargetAndSchedule() {
  const totalBacklogSeconds = state.subjects.reduce((sum, sub) => sum + sub.backlogSeconds, 0);
  
  if (totalBacklogSeconds <= 0) {
    const targetEl = document.getElementById("stat-daily-target");
    if (targetEl) targetEl.innerText = "0";
    const estEl = document.getElementById("stat-estimated-date");
    if (estEl) estEl.innerText = "Done";
    const descEl = document.getElementById("stat-target-calc-desc");
    if (descEl) descEl.innerText = "No backlog remaining!";
    const countEl = document.getElementById("schedule-days-count");
    if (countEl) countEl.innerText = "All caught up!";
    const breakdownEl = document.getElementById("schedule-breakdown");
    if (breakdownEl) {
      breakdownEl.innerHTML = `
        <div class="text-center py-4 text-xs text-on-surface-variant">
          <p>🎉 Amazing! You have no backlog remaining!</p>
        </div>
      `;
    }
    return;
  }

  const dailyHoursTarget = state.preferences.dailyHoursTarget;
  const targetDateStr = state.preferences.targetDate;
  const excludeDays = state.preferences.excludeDays || [];
  
  let requiredDailySeconds = dailyHoursTarget * 3600;
  let totalStudyDaysNeeded = Math.ceil(totalBacklogSeconds / requiredDailySeconds);
  
  let targetCompletedDate = null;
  let scheduleSubtitleText = "";

  if (targetDateStr) {
    const targetDate = new Date(targetDateStr);
    const today = new Date();
    today.setHours(0,0,0,0);
    targetDate.setHours(0,0,0,0);
    
    if (targetDate <= today) {
      scheduleSubtitleText = "Target date reset (was in past)";
      state.preferences.targetDate = "";
      saveState();
    } else {
      let availableStudyDays = 0;
      let tempDate = new Date(today);
      
      while (tempDate <= targetDate) {
        const dayOfWeek = tempDate.getDay();
        if (!excludeDays.includes(dayOfWeek)) {
          availableStudyDays++;
        }
        tempDate.setDate(tempDate.getDate() + 1);
      }
      
      if (availableStudyDays > 0) {
        requiredDailySeconds = Math.round(totalBacklogSeconds / availableStudyDays);
        state.preferences.dailyHoursTarget = Math.round((requiredDailySeconds / 3600) * 2) / 2;
        if (state.preferences.dailyHoursTarget < 0.5) state.preferences.dailyHoursTarget = 0.5;
        
        const slider = document.getElementById("input-daily-hours");
        if (slider) slider.value = state.preferences.dailyHoursTarget;
        
        totalStudyDaysNeeded = availableStudyDays;
        scheduleSubtitleText = `Finish by ${targetDate.toLocaleDateString('en-IN', {day: 'numeric', month: 'short'})} (${availableStudyDays} days)`;
      } else {
        scheduleSubtitleText = "No study days available!";
      }
    }
  }
  
  if (!targetDateStr) {
    let tempDate = new Date();
    let daysAdded = 0;
    let studyDaysCount = 0;
    
    while (studyDaysCount < totalStudyDaysNeeded) {
      tempDate.setDate(tempDate.getDate() + 1);
      const dayOfWeek = tempDate.getDay();
      if (!excludeDays.includes(dayOfWeek)) {
        studyDaysCount++;
      }
      daysAdded++;
      if (daysAdded > 1000) break;
    }
    
    targetCompletedDate = tempDate;
    scheduleSubtitleText = `${totalStudyDaysNeeded} study days estimated`;
    
    const estEl = document.getElementById("stat-estimated-date");
    if (estEl) {
      estEl.innerText = targetCompletedDate.toLocaleDateString('en-IN', {day: 'numeric', month: 'short'});
    }
  } else if (targetDateStr) {
    const estEl = document.getElementById("stat-estimated-date");
    if (estEl) {
      const tDate = new Date(targetDateStr);
      estEl.innerText = tDate.toLocaleDateString('en-IN', {day: 'numeric', month: 'short'});
    }
  }

  const dailyHours = requiredDailySeconds / 3600;
  const targetStatEl = document.getElementById("stat-daily-target");
  if (targetStatEl) targetStatEl.innerHTML = `${dailyHours.toFixed(1)} <span class="text-lg font-normal text-on-surface-variant">Hours</span>`;
  
  const descEl = document.getElementById("stat-target-calc-desc");
  if (descEl) descEl.innerText = targetDateStr ? "Adjusted for target date" : "Based on daily target";
  
  const countEl = document.getElementById("schedule-days-count");
  if (countEl) countEl.innerText = scheduleSubtitleText;

  // Generate Daily Action Plan: Target 1 full lecture of each subject for today
  const activeSubjects = state.subjects.filter(sub => sub.backlogSeconds > 0);
  
  let html = "";
  activeSubjects.forEach((sub) => {
    // 1 full lecture target duration (5400s for Zoology, 6300s for all other subjects)
    const allocatedSeconds = sub.avgLectureDurationSec || (sub.name === "Zoology by Aarushi Ma'am" ? 5400 : 6300);
    const studiedToday = state.studyToday[sub.name] || 0;
    const remainingSeconds = Math.max(0, allocatedSeconds - studiedToday);
    const isCompleted = remainingSeconds === 0 || state.completedActionsToday[sub.name] === true;

    html += `
      <label class="flex items-center gap-3 cursor-pointer group p-2.5 rounded-xl hover:bg-white/5 transition-all border border-slate-800/40">
        <input type="checkbox" ${isCompleted ? 'checked' : ''} onchange="toggleActionItem('${sub.name.replace(/'/g, "\\'")}', ${allocatedSeconds})" class="w-5 h-5 rounded border-slate-700 bg-obsidian-950 text-accent-violet focus:ring-accent-violet/50 cursor-pointer"/>
        <div class="flex-1">
          <div class="flex items-center justify-between">
            <span class="text-xs font-bold ${isCompleted ? 'line-through text-slate-500' : 'text-slate-200 group-hover:text-accent-violet'} transition-colors">${sub.name}</span>
            <span class="text-[11px] font-mono font-bold ${isCompleted ? 'text-accent-emerald' : 'text-accent-cyan'}">${isCompleted ? 'Completed Today' : formatSecondsToHrsMins(remainingSeconds) + ' left'}</span>
          </div>
          <p class="text-[10px] text-slate-400 font-mono mt-0.5">${isCompleted ? '1 Lecture Watched' : 'Target: 1 Full Lecture (' + formatSecondsToHrsMins(allocatedSeconds) + ')'}</p>
        </div>
      </label>
    `;
  });

  // Render custom tasks if present
  if (state.customTasks && state.customTasks.length > 0) {
    state.customTasks.forEach((task, idx) => {
      html += `
        <label class="flex items-center gap-3 cursor-pointer group p-2 rounded-lg hover:bg-white/5 transition-all border-t border-white/5">
          <input type="checkbox" ${task.completed ? 'checked' : ''} onchange="toggleCustomTask(${idx})" class="w-5 h-5 rounded border-white/20 bg-transparent text-primary focus:ring-primary/50 cursor-pointer"/>
          <div class="flex-1">
            <span class="text-sm ${task.completed ? 'line-through text-on-surface-variant' : 'group-hover:text-primary'} transition-colors font-medium">${task.title}</span>
            <p class="text-[10px] text-on-surface-variant">Custom Task</p>
          </div>
          <button onclick="removeCustomTask(${idx})" class="text-xs text-error/60 hover:text-error">&times;</button>
        </label>
      `;
    });
  }
  
  const breakdownEl = document.getElementById("schedule-breakdown");
  if (breakdownEl) breakdownEl.innerHTML = html;
}

// Modal and Task Window Globals
window.toggleImportModal = function(show) {
  const modal = document.getElementById("import-modal");
  if (modal) {
    if (show) modal.classList.remove("hidden");
    else modal.classList.add("hidden");
  }
};

window.toggleTaskModal = function(show) {
  const modal = document.getElementById("task-modal");
  if (modal) {
    if (show) modal.classList.remove("hidden");
    else modal.classList.add("hidden");
  }
};

window.addCustomTaskAction = function() {
  const input = document.getElementById("input-task-title");
  if (!input || !input.value.trim()) return;
  
  if (!state.customTasks) state.customTasks = [];
  state.customTasks.push({ title: input.value.trim(), completed: false });
  input.value = "";
  
  toggleTaskModal(false);
  saveState();
  renderDashboard();
};

window.toggleCustomTask = function(idx) {
  if (state.customTasks && state.customTasks[idx]) {
    state.customTasks[idx].completed = !state.customTasks[idx].completed;
    saveState();
    renderDashboard();
  }
};

window.removeCustomTask = function(idx) {
  if (state.customTasks && state.customTasks[idx]) {
    state.customTasks.splice(idx, 1);
    saveState();
    renderDashboard();
  }
};

window.parseAndLoadImportedJSON = function() {
  const textarea = document.getElementById("textarea-import");
  if (!textarea || !textarea.value.trim()) return;
  
  try {
    const rawData = JSON.parse(textarea.value.trim());
    const filteredData = filterAndNormalizeSubjects(rawData);
    
    state.subjects = filteredData.map(item => {
      const [compLectures, totLectures] = (item.lectures || "0/0").split("/").map(Number);
      const [compDpp, totDpp] = (item.dpp || "0/0").split("/").map(Number);
      const remaining = Math.max(0, totLectures - compLectures);
      const isZoology = item.subject === "Zoology by Aarushi Ma'am";
      const avgLectureDurationSec = isZoology ? 5400 : 6300;
      const backlogSec = remaining * avgLectureDurationSec;
      
      return {
        name: item.subject,
        lecturesCompleted: compLectures,
        lecturesTotal: totLectures,
        dppCompleted: compDpp,
        dppTotal: totDpp,
        backlogSeconds: backlogSec,
        originalBacklogSeconds: backlogSec,
        avgLectureDurationSec: avgLectureDurationSec
      };
    });
    
    toggleImportModal(false);
    saveState();
    renderDashboard();
    alert("Backlog data successfully imported!");
  } catch (e) {
    alert("Invalid JSON format. Please check the content.");
  }
};

// Toggle action item manual complete/incomplete
window.toggleActionItem = function(subName, allocatedSeconds) {
  const isCurrentlyCompleted = state.completedActionsToday[subName] === true;
  
  if (!isCurrentlyCompleted) {
    state.completedActionsToday[subName] = true;
    const subject = state.subjects.find(s => s.name === subName);
    if (subject) {
      const studiedToday = state.studyToday[subName] || 0;
      const additionalTime = Math.max(0, allocatedSeconds - studiedToday);
      subject.backlogSeconds = Math.max(0, subject.backlogSeconds - additionalTime);
      state.studyToday[subName] = (state.studyToday[subName] || 0) + additionalTime;
      updateLecturesCompletedFromBacklog(subject);
    }
  } else {
    state.completedActionsToday[subName] = false;
    const subject = state.subjects.find(s => s.name === subName);
    if (subject) {
      const studiedToday = state.studyToday[subName] || 0;
      subject.backlogSeconds += studiedToday;
      state.studyToday[subName] = 0;
      updateLecturesCompletedFromBacklog(subject);
    }
  }
  
  saveState();
  renderDashboard();
};

function updateLecturesCompletedFromBacklog(subject) {
  const totalDuration = subject.originalBacklogSeconds;
  const remainingDuration = subject.backlogSeconds;
  const durationCompleted = totalDuration - remainingDuration;
  
  if (subject.avgLectureDurationSec > 0) {
    const lecturesDelta = Math.floor(durationCompleted / subject.avgLectureDurationSec);
    const initialLecturesCompleted = Math.max(0, subject.lecturesTotal - Math.ceil(totalDuration / subject.avgLectureDurationSec));
    
    subject.lecturesCompleted = Math.min(subject.lecturesTotal, initialLecturesCompleted + lecturesDelta);
  }
}

// UI Dashboard Render
function renderDashboard() {
  const sidebarList = document.getElementById("sidebar-subjects-list");
  const mainList = document.getElementById("main-subjects-list");
  
  if (state.subjects.length === 0) {
    if (mainList) {
      mainList.innerHTML = `
        <div class="glass p-6 rounded-2xl text-center">
          <p class="text-on-surface-variant text-sm mb-4">No backlogs imported yet</p>
          <button onclick="loadDemoDataAction()" class="px-4 py-2 rounded-xl bg-primary text-on-primary font-bold text-xs">Load Demo Data</button>
        </div>
      `;
    }
    if (sidebarList) sidebarList.innerHTML = `<p class="text-xs text-on-surface-variant px-4">No active subjects</p>`;
    
    const totalBacklogEl = document.getElementById("stat-total-backlog");
    if (totalBacklogEl) totalBacklogEl.innerHTML = `0 <span class="text-lg font-normal text-on-surface-variant">Hours</span>`;
    const pctEl = document.getElementById("stat-progress-pct");
    if (pctEl) pctEl.innerText = `0%`;
    const fillEl = document.getElementById("stat-progress-bar-fill");
    if (fillEl) fillEl.style.width = `0%`;
    const countBadge = document.getElementById("subject-count-badge");
    if (countBadge) countBadge.innerText = `0`;
    const sideCount = document.getElementById("sidebar-subject-count");
    if (sideCount) sideCount.innerText = `0 active modules`;
    
    calculateTargetAndSchedule();
    return;
  }

  // Populate Sidebar
  let sidebarHtml = "";
  state.subjects.forEach((sub, idx) => {
    const shortName = sub.name.split(" ")[0];
    const icon = SUBJECT_ICONS[shortName] || "book";
    const isActive = timer.activeSubjectIndex === idx;
    
    sidebarHtml += `
      <div onclick="startStudyingSubject(${idx})" class="${isActive ? 'bg-white/10 text-primary border-l-4 border-primary' : 'text-on-surface-variant hover:bg-white/5 hover:text-on-surface'} rounded-r-lg p-3 flex items-center gap-3 cursor-pointer transition-all">
        <span class="material-symbols-outlined">${icon}</span>
        <span class="font-body-md text-sm truncate">${sub.name}</span>
      </div>
    `;
  });
  if (sidebarList) sidebarList.innerHTML = sidebarHtml;

  // Populate Main Cards List
  let mainHtml = "";
  state.subjects.forEach((sub, idx) => {
    const totalLectures = sub.lecturesTotal;
    const compLectures = sub.lecturesCompleted;
    const progressPct = totalLectures > 0 ? Math.round((compLectures / totalLectures) * 100) : 0;
    const shortName = sub.name.split(" ")[0];
    const lucideIcon = SUBJECT_ICONS[shortName] || "book";
    
    // Choose accent color dynamically
    const borderColors = ["border-accent-violet/60", "border-accent-cyan/60", "border-accent-emerald/60"];
    const textColors = ["text-accent-violet", "text-accent-cyan", "text-accent-emerald"];
    const bgColors = ["bg-accent-violet", "bg-accent-cyan", "bg-accent-emerald"];
    const colorIdx = idx % 3;

    mainHtml += `
      <div class="glass-card glass-card-hover p-5 rounded-2xl border-l-4 ${borderColors[colorIdx]} cursor-pointer space-y-3" onclick="startStudyingSubject(${idx})">
        <div class="flex justify-between items-start">
          <div>
            <h4 class="font-bold text-sm text-white">${sub.name}</h4>
            <p class="text-xs text-slate-400 font-mono mt-0.5">${compLectures}/${totalLectures} lectures • ${formatSecondsToReadable(sub.backlogSeconds)} left</p>
          </div>
          <div class="p-2 rounded-xl bg-obsidian-800/80 border border-slate-700/50 ${textColors[colorIdx]}">
            <i data-lucide="${lucideIcon}" class="w-4 h-4"></i>
          </div>
        </div>

        <div class="space-y-1">
          <div class="flex justify-between items-center text-xs">
            <span class="font-bold ${textColors[colorIdx]} font-mono">${progressPct}% Completed</span>
            <span class="text-[11px] text-slate-400 font-mono">${totalLectures - compLectures} left</span>
          </div>
          <div class="h-1.5 bg-obsidian-950 rounded-full overflow-hidden">
            <div class="h-full ${bgColors[colorIdx]} rounded-full transition-all duration-300" style="width: ${progressPct}%"></div>
          </div>
        </div>

        <div class="flex justify-between items-center pt-2 border-t border-slate-800/60" onclick="event.stopPropagation()">
          <div class="flex items-center gap-1.5">
            <span class="text-[10px] text-slate-400 font-medium">Watched:</span>
            <div class="flex items-center gap-1 bg-obsidian-950 p-1 rounded-lg border border-slate-800">
              <button onclick="adjustLectures(${idx}, -1)" class="w-4 h-4 rounded bg-obsidian-800 hover:bg-obsidian-700 text-slate-300 flex items-center justify-center text-[10px] font-bold transition-all">-</button>
              <span class="font-mono font-bold text-xs text-white px-1">${compLectures}</span>
              <button onclick="adjustLectures(${idx}, 1)" class="w-4 h-4 rounded bg-obsidian-800 hover:bg-obsidian-700 text-slate-300 flex items-center justify-center text-[10px] font-bold transition-all">+</button>
            </div>
          </div>
          <div class="flex items-center gap-1.5">
            <span class="text-[10px] text-slate-400 font-medium">Total:</span>
            <div class="flex items-center gap-1 bg-obsidian-950 p-1 rounded-lg border border-slate-800">
              <button onclick="adjustTotalLectures(${idx}, -1)" class="w-4 h-4 rounded bg-obsidian-800 hover:bg-obsidian-700 text-slate-300 flex items-center justify-center text-[10px] font-bold transition-all">-</button>
              <span class="font-mono font-bold text-xs text-accent-cyan px-1">${totalLectures}</span>
              <button onclick="adjustTotalLectures(${idx}, 1)" class="w-4 h-4 rounded bg-obsidian-800 hover:bg-obsidian-700 text-slate-300 flex items-center justify-center text-[10px] font-bold transition-all">+</button>
            </div>
          </div>
        </div>
      </div>
    `;
  });
  if (mainList) mainList.innerHTML = mainHtml;
  if (window.lucide) lucide.createIcons();

  // Populate Select Subject Dropdown in Pomodoro
  const selectSub = document.getElementById("select-timer-subject");
  if (selectSub) {
    let optionsHtml = `<option value="">General Focus / No Subject</option>`;
    state.subjects.forEach((sub, idx) => {
      if (sub.backlogSeconds > 0) {
        const selectedAttr = (timer.activeSubjectIndex === idx) ? "selected" : "";
        optionsHtml += `<option value="${idx}" ${selectedAttr}>${sub.name}</option>`;
      }
    });
    selectSub.innerHTML = optionsHtml;
  }

  // Calculate Summary Stats
  const totalBacklogSeconds = state.subjects.reduce((sum, sub) => sum + sub.backlogSeconds, 0);
  const totalLectures = state.subjects.reduce((sum, sub) => sum + sub.lecturesTotal, 0);
  const compLectures = state.subjects.reduce((sum, sub) => sum + sub.lecturesCompleted, 0);
  const overallProgressPct = totalLectures > 0 ? Math.round((compLectures / totalLectures) * 100) : 0;
  
  const totalBacklogEl = document.getElementById("stat-total-backlog");
  if (totalBacklogEl) totalBacklogEl.innerHTML = `${Math.round(totalBacklogSeconds / 3600)} <span class="text-lg font-normal text-on-surface-variant">Hours</span>`;
  
  const pctEl = document.getElementById("stat-progress-pct");
  if (pctEl) pctEl.innerText = `${overallProgressPct}%`;
  
  const fillEl = document.getElementById("stat-progress-bar-fill");
  if (fillEl) fillEl.style.width = `${overallProgressPct}%`;
  
  const descEl = document.getElementById("stat-completed-lectures-desc");
  if (descEl) descEl.innerText = `${compLectures} / ${totalLectures} lectures completed`;
  
  const countBadge = document.getElementById("subject-count-badge");
  if (countBadge) countBadge.innerText = `${state.subjects.length}`;
  
  const sideCount = document.getElementById("sidebar-subject-count");
  if (sideCount) sideCount.innerText = `${state.subjects.length} active modules`;

  calculateTargetAndSchedule();
}

// Adjust Lectures completed manually
window.adjustLectures = function(idx, delta) {
  const subject = state.subjects[idx];
  if (!subject) return;
  
  const originalComp = subject.lecturesCompleted;
  subject.lecturesCompleted = Math.max(0, Math.min(subject.lecturesTotal, subject.lecturesCompleted + delta));
  const actualDelta = subject.lecturesCompleted - originalComp;
  
  if (actualDelta !== 0) {
    const timeChange = actualDelta * subject.avgLectureDurationSec;
    subject.backlogSeconds = Math.max(0, subject.backlogSeconds - timeChange);
    saveState();
    renderDashboard();
  }
};

// Adjust Total Lectures manually
window.adjustTotalLectures = function(idx, delta) {
  const subject = state.subjects[idx];
  if (!subject) return;
  
  subject.lecturesTotal = Math.max(subject.lecturesCompleted, subject.lecturesTotal + delta);
  const remaining = Math.max(0, subject.lecturesTotal - subject.lecturesCompleted);
  subject.backlogSeconds = remaining * subject.avgLectureDurationSec;
  subject.originalBacklogSeconds = subject.backlogSeconds;
  saveState();
  renderDashboard();
};

// Set Pomodoro focus subject directly from subject card click
window.startStudyingSubject = function(idx) {
  timer.activeSubjectIndex = idx;
  const selectSub = document.getElementById("select-timer-subject");
  if (selectSub) selectSub.value = idx;
  
  const subject = state.subjects[idx];
  const timerText = document.getElementById("timer-active-subject-text");
  if (timerText && subject) {
    timerText.innerText = `Focusing on: ${subject.name}`;
  }
  
  renderDashboard();
};

// Pomodoro Timer Controls
function updateTimerDisplay() {
  const minutes = Math.floor(timer.timeLeft / 60);
  const seconds = timer.timeLeft % 60;
  const timeText = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  
  const displayEl = document.getElementById("timer-display");
  if (displayEl) displayEl.innerText = timeText;
  
  const ring = document.getElementById("timer-progress-ring");
  if (ring) {
    const dashOffset = CIRCLE_CIRCUMFERENCE - (timer.timeLeft / timer.totalDuration) * CIRCLE_CIRCUMFERENCE;
    ring.style.strokeDashoffset = dashOffset;
  }
}

window.toggleTimer = function() {
  const playIcon = document.getElementById('play-icon');
  if (timer.isRunning) {
    clearInterval(timer.intervalId);
    if (playIcon) playIcon.innerText = 'play_arrow';
  } else {
    timer.intervalId = setInterval(() => {
      if (timer.timeLeft > 0) {
        timer.timeLeft--;
        updateTimerDisplay();
      } else {
        clearInterval(timer.intervalId);
        timer.isRunning = false;
        if (playIcon) playIcon.innerText = 'play_arrow';
        triggerTimerFinished();
      }
    }, 1000);
    if (playIcon) playIcon.innerText = 'pause';
  }
  timer.isRunning = !timer.isRunning;
};

function triggerTimerFinished() {
  alert(`Session Complete! Great focus.`);
  
  if (timer.activeSubjectIndex !== "") {
    const subject = state.subjects[timer.activeSubjectIndex];
    if (subject) {
      const secondsStudied = timer.totalDuration;
      subject.backlogSeconds = Math.max(0, subject.backlogSeconds - secondsStudied);
      state.studyToday[subject.name] = (state.studyToday[subject.name] || 0) + secondsStudied;
      updateLecturesCompletedFromBacklog(subject);
      saveState();
      renderDashboard();
    }
  }
  
  timer.timeLeft = timer.totalDuration;
  updateTimerDisplay();
}

window.loadDemoDataAction = function() {
  const filteredDemo = filterAndNormalizeSubjects(SAMPLE_DATA);
  const biologyEntry = filteredDemo.find(sub => sub.subject === "Zoology by Aarushi Ma'am");
  if (biologyEntry) {
    const zoologyChapters = SAMPLE_CHAPTERS.filter(ch => ch.title.toLowerCase().includes("(zoology)"));
    let compLectures = 0; let totLectures = 0; let compDpp = 0; let totDpp = 0;
    zoologyChapters.forEach(ch => {
      const [cl, tl] = ch.lectures.split("/").map(Number);
      const [cd, td] = ch.dpp.split("/").map(Number);
      compLectures += cl; totLectures += tl; compDpp += cd; totDpp += td;
    });
    let avgLectureSec = 5400; // Zoology: 1h 30m
    const remainingZoology = totLectures - compLectures;
    const zoologyBacklogSec = Math.round(remainingZoology * avgLectureSec);
    
    biologyEntry.lectures = `${compLectures}/${totLectures}`;
    biologyEntry.dpp = `${compDpp}/${totDpp}`;
    biologyEntry.backlog = formatSecondsToReadable(zoologyBacklogSec);
  }

  state.subjects = filteredDemo.map(item => {
    const [compLectures, totLectures] = (item.lectures || "0/0").split("/").map(Number);
    const [compDpp, totDpp] = (item.dpp || "0/0").split("/").map(Number);
    const remaining = Math.max(0, totLectures - compLectures);
    const isZoology = item.subject === "Zoology by Aarushi Ma'am";
    const avgLectureDurationSec = isZoology ? 5400 : 6300;
    const backlogSec = remaining * avgLectureDurationSec;
    
    return {
      name: item.subject,
      lecturesCompleted: compLectures,
      lecturesTotal: totLectures,
      dppCompleted: compDpp,
      dppTotal: totDpp,
      backlogSeconds: backlogSec,
      originalBacklogSeconds: backlogSec,
      avgLectureDurationSec: avgLectureDurationSec
    };
  });
  state.studyToday = {};
  state.completedActionsToday = {};
  saveState();
  renderDashboard();
};

// Initial Setup
function initApp() {
  loadState();
  
  const slider = document.getElementById("input-daily-hours");
  if (slider) {
    slider.value = state.preferences.dailyHoursTarget;
    slider.addEventListener("input", (e) => {
      state.preferences.dailyHoursTarget = parseFloat(e.target.value);
      saveState();
      calculateTargetAndSchedule();
    });
  }
  
  const toggleBtn = document.getElementById("btn-timer-toggle");
  if (toggleBtn) toggleBtn.addEventListener("click", window.toggleTimer);
  
  const resetBtn = document.getElementById("btn-timer-reset");
  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      if (timer.isRunning) window.toggleTimer();
      timer.timeLeft = timer.totalDuration;
      updateTimerDisplay();
    });
  }

  const selectSub = document.getElementById("select-timer-subject");
  if (selectSub) {
    selectSub.addEventListener("change", (e) => {
      const val = e.target.value;
      timer.activeSubjectIndex = val !== "" ? parseInt(val) : "";
      const subject = state.subjects[timer.activeSubjectIndex];
      const timerText = document.getElementById("timer-active-subject-text");
      if (timerText) {
        timerText.innerText = subject ? `Focusing on: ${subject.name}` : "Select Subject to Focus";
      }
    });
  }

  const loadDemoBtn = document.getElementById("btn-load-sample");
  if (loadDemoBtn) {
    loadDemoBtn.addEventListener("click", () => {
      if (confirm("Load demo data matching your 6 curriculum modules?")) {
        window.loadDemoDataAction();
      }
    });
  }

  const resetAllBtn = document.getElementById("btn-reset-all");
  if (resetAllBtn) {
    resetAllBtn.addEventListener("click", () => {
      if (confirm("Reset all planner data?")) {
        localStorage.removeItem("pw_backlog_state");
        state = { subjects: [], preferences: { dailyHoursTarget: 3.0, targetDate: "", excludeDays: [0] }, studyToday: {}, completedActionsToday: {} };
        renderDashboard();
      }
    });
  }

  const syncBtn = document.getElementById("btn-trigger-sync");
  if (syncBtn) {
    syncBtn.addEventListener("click", () => {
      syncBtn.innerHTML = `<i data-lucide="refresh-cw" class="w-4 h-4 text-accent-violet animate-spin"></i> Syncing...`;
      if (window.lucide) lucide.createIcons();

      // Trigger background scrape via Extension Content Script
      window.postMessage({ type: "PW_TRIGGER_BACKGROUND_SCRAPE" }, "*");
      window.postMessage({ type: "PW_PLANNER_REQUEST_SYNC" }, "*");

      // Safety timeout: restore button icon after 4 seconds
      setTimeout(() => {
        const btn = document.getElementById("btn-trigger-sync");
        if (btn) {
          btn.innerHTML = `<i data-lucide="refresh-cw" class="w-4 h-4 text-accent-violet"></i> Sync Now`;
          if (window.lucide) lucide.createIcons();
        }
      }, 4000);
    });
  }

  renderDashboard();
  requestExtensionSync();
}

document.addEventListener("DOMContentLoaded", initApp);

// Auto-sync message receiver from Chrome Extension
window.addEventListener("message", (event) => {
  if (event.data && event.data.type === "PW_EXTENSION_SYNC") {
    const rawData = event.data.data;
    const chapters = event.data.chapters;
    const syncTime = event.data.syncTime;
    
    if (rawData) {
      updateExtensionStatus(true, syncTime);
      
      const syncBtn = document.getElementById("btn-trigger-sync");
      if (syncBtn) {
        syncBtn.innerHTML = `<span class="material-symbols-outlined text-sm">sync</span> Sync Now`;
      }
      
      let filteredData = filterAndNormalizeSubjects(rawData);
      
      const biologyEntryIndex = filteredData.findIndex(sub => sub.subject === "Zoology by Aarushi Ma'am");
      if (biologyEntryIndex !== -1) {
        const biologyEntry = filteredData[biologyEntryIndex];
        let compLectures = 3;
        let totLectures = 13;
        let compDpp = 2;
        let totDpp = 11;
        
        if (chapters && chapters.length > 0) {
          const zoologyChapters = chapters.filter(ch => ch.title.toLowerCase().includes("(zoology)"));
          if (zoologyChapters.length > 0) {
            compLectures = 0; totLectures = 0; compDpp = 0; totDpp = 0;
            zoologyChapters.forEach(ch => {
              const [cl, tl] = (ch.lectures || "0/0").split("/").map(Number);
              const [cd, td] = (ch.dpp || "0/0").split("/").map(Number);
              compLectures += cl || 0;
              totLectures += tl || 0;
              compDpp += cd || 0;
              totDpp += td || 0;
            });
          }
        }
        
        let avgLectureSec = 5400; // 1h 30m
        const remainingZoologyLectures = Math.max(0, totLectures - compLectures);
        const zoologyBacklogSec = Math.round(remainingZoologyLectures * avgLectureSec);
        
        biologyEntry.lectures = `${compLectures}/${totLectures}`;
        biologyEntry.dpp = `${compDpp}/${totDpp}`;
        biologyEntry.backlog = formatSecondsToReadable(zoologyBacklogSec);
      }
      
      state.subjects = filteredData.map(item => {
        const [compLectures, totLectures] = (item.lectures || "0/0").split("/").map(Number);
        const [compDpp, totDpp] = (item.dpp || "0/0").split("/").map(Number);
        
        // Check if user has already watched more lectures locally in state
        const existingSubject = state.subjects ? state.subjects.find(s => s.name === item.subject) : null;
        let finalCompLectures = compLectures;
        if (existingSubject && existingSubject.lecturesCompleted > compLectures) {
          finalCompLectures = existingSubject.lecturesCompleted;
        }

        // Always update total lectures to the latest scraped total from PW
        let finalTotalLectures = totLectures > 0 ? totLectures : (existingSubject ? existingSubject.lecturesTotal : 0);

        const remaining = Math.max(0, finalTotalLectures - finalCompLectures);
        const isZoology = item.subject === "Zoology by Aarushi Ma'am";
        const avgLectureDurationSec = isZoology ? 5400 : 6300;
        const backlogSec = remaining * avgLectureDurationSec;
        
        return {
          name: item.subject,
          lecturesCompleted: finalCompLectures,
          lecturesTotal: finalTotalLectures,
          dppCompleted: compDpp,
          dppTotal: totDpp,
          backlogSeconds: backlogSec,
          originalBacklogSeconds: backlogSec,
          avgLectureDurationSec: avgLectureDurationSec
        };
      });
      
      saveState();
      renderDashboard();
    }
  }
});

function requestExtensionSync() {
  window.postMessage({ type: "PW_PLANNER_REQUEST_SYNC" }, "*");
}

function updateExtensionStatus(connected, lastSyncTime) {
  const statusBadgeText = document.getElementById("status-badge-text");
  const pulseDot = document.getElementById("status-pulse-dot");
  if (statusBadgeText && pulseDot) {
    if (connected) {
      pulseDot.className = "w-2 h-2 rounded-full bg-emerald-400 animate-pulse";
      const timeStr = lastSyncTime ? new Date(lastSyncTime).toLocaleTimeString('en-IN', {hour: '2-digit', minute: '2-digit'}) : "Connected";
      statusBadgeText.innerText = `Auto Sync Connected (${timeStr})`;
    } else {
      pulseDot.className = "w-2 h-2 rounded-full bg-surface-variant";
      statusBadgeText.innerText = "Auto Sync Disconnected";
    }
  }
}
