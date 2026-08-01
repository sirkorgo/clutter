/* holy trinity of globals */
let guides = [];
let guidesLoaded = false;
let tabs;
let isCreatingTask = false;
let taskToDelete = null;
let guideToDel = null;
let msToDel = null;
let guideTaskToDel = null;
let activeLinkGuideId = null;
let activeLinkMsId = null;
let activeLinkTaskId = null;
let activeTypeGuideId = null;
let activeTypeMsId = null;
let activeTypeTaskId = null;
let activeTypeContext = null;
let canvasTasks = [];
let canvasLoaded = false;
let canvasLastFetch = null;
const CANVAS_REFRESH_MS = 5 * 60 * 1000;

// settings api
async function getSettings() {
  const response = await fetch("/api/userdata/settings");
  const data = await response.json();
  return data;
}

// sum page api
async function getWeekData(canvasTasks = []) {
  const now = new Date();
  const days = [];

  for (let i = -7; i <= 7; i++) {
    const day = new Date(now);
    day.setHours(0, 0, 0, 0);
    day.setDate(now.getDate() + i);
    days.push({ date: day, tasks: [], guideTasks: [] });
  }

  const allTasks = [...(await getTasks()), ...canvasTasks];
  for (let task of allTasks) {
    if (!task.due) continue;
    const [year, month, day] = task.due.split("-").map(Number);
    const due = new Date(year, month - 1, day);
    due.setHours(0, 0, 0, 0);
    const entry = days.find((d) => d.date.getTime() === due.getTime());
    if (!entry) continue;
    entry.tasks.push({ id: task.id, title: task.title, done: task.done, type: "task" });
  }

  await getGuides("active");
  for (let guide of guides) {
    for (let ms of guide.milestones) {
      for (let task of ms.tasks) {
        if (!task.done || !task.completedAt) continue;
        const completed = new Date(task.completedAt);
        completed.setHours(0, 0, 0, 0);
        const entry = days.find((d) => d.date.getTime() === completed.getTime());
        if (!entry) continue;
        entry.guideTasks.push({ id: task.id, title: task.title, guideTitle: guide.title, type: "guide" });
      }
    }
  }

  return days;
}

function truncate(str, max = 35) {
  if (!str) return "Untitled";
  return str.length > max ? str.slice(0, max) + "…" : str;
}

async function renderActivityGrid() {
  const container = document.querySelector("#activityGrid");
  const weekData = await getWeekData();
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let html = `<div id="activityRows">`;

  for (let day of weekData) {
    const isToday = day.date.getTime() === today.getTime();
    const allEntries = [...day.tasks, ...day.guideTasks];
    const visible = allEntries.slice(0, 4);
    const overflow = allEntries.slice(4);

    let cellsHtml = "";

    for (let entry of visible) {
      let colorClass = "";
      if (entry.type === "guide") colorClass = "blue";
      else if (entry.done) colorClass = "green";
      else colorClass = "grey";

      cellsHtml += `<div class="task-cell ${colorClass}" data-title="${entry.title}"></div>`;
    }

    if (overflow.length > 0) {
      const anyIncomplete = overflow.some((e) => e.type === "task" && !e.done);
      const overflowColor = anyIncomplete ? "grey" : "green";
      const tooltipItems = overflow
        .map((e) => {
          const border = e.type === "guide" ? "blue" : e.done ? "green" : "grey";
          return `<div class="tooltip-item" style="border-left: 3px solid ${border}; padding-left: 6px;">
  ${e.title || "Untitled"}
  ${e.type === "guide" ? `<br><small>${truncate(e.guideTitle)}</small>` : ""}
</div>`;
        })
        .join("");

      cellsHtml += `
        <div class="task-cell overflow ${overflowColor}" data-overflow="true">
          <span>+${overflow.length}</span>
          <div class="overflow-tooltip">${tooltipItems}</div>
        </div>`;
    }

    html += `
      <div class="day-column ${isToday ? "today" : ""}">
        <div class="task-cells">${cellsHtml}</div>
        <div class="day-label">
          <span>${dayNames[day.date.getDay()]}</span>
          <span>${day.date.getDate()}</span>
        </div>
      </div>`;
  }

  html += `</div>`;
  container.innerHTML = html;

  // overflow tooltip toggle
  container.querySelectorAll(".task-cell.overflow").forEach((cell) => {
    cell.addEventListener("mouseenter", (e) => {
      const tooltip = cell.querySelector(".overflow-tooltip");
      const rect = cell.getBoundingClientRect();
      tooltip.style.top = `${rect.top}px`;
      tooltip.style.left = `${rect.right + 8}px`;
      tooltip.classList.add("visible");
    });
    cell.addEventListener("mouseleave", () => cell.querySelector(".overflow-tooltip").classList.remove("visible"));
  });
}
// canvas integration
async function pullCanvasTasks() {
  const settings = await getSettings();
  if (!settings.canvas.apiKey) return [];
  const res = await fetch("/api/integrations/canvas/sync", { method: "POST" });
  const taskJSON = await res.json();
  canvasTasks = taskJSON.map((task) => ({ ...task, canvas: true, id: task.id.toString() }));
  canvasLoaded = true;
  canvasLastFetch = Date.now();
  return canvasTasks;
}

async function getCanvasTasks() {
  const now = Date.now();
  const needsRefresh = !canvasLoaded || (canvasLastFetch && now - canvasLastFetch > CANVAS_REFRESH_MS);
  if (needsRefresh) await pullCanvasTasks();
  return canvasTasks;
}
// tasks api
let tasks = [];
let tasksLoaded = false;

async function getTasks() {
  if (!tasksLoaded) {
    const response = await fetch("/api/userdata/tasks", { method: "GET" });
    tasks = await response.json();
    tasksLoaded = true;
  }
  return tasks;
}

async function renderTasks(includeCanvas = false) {
  const taskData = await getTasks();
  const settings = await getSettings();
  const canvasData = includeCanvas && settings.canvas.apiKey ? await getCanvasTasks() : [];
  const allTasks = [...taskData, ...canvasData];

  allTasks.sort((a, b) => {
    // separate done and undone
    if (a.done !== b.done) return a.done ? 1 : -1;

    if (!a.done) {
      // incomplete: upcoming first (earliest due date first)
      if (!a.due) return 1;
      if (!b.due) return -1;
      return new Date(a.due) - new Date(b.due);
    } else {
      // complete: newest due date first
      if (!a.due) return 1;
      if (!b.due) return -1;
      return new Date(b.due) - new Date(a.due);
    }
  });

  const taskList = document.querySelector("#taskList");

  const filters = {
    notdone: document.querySelector('[label="Incomplete"]').selected,
    done: document.querySelector('[label="Completed"]').selected,
    canvas: document.querySelector('[label="Canvas"]').selected,
    local: document.querySelector('[label="Clutter"]').selected,
  };

  const anyFilterActive = filters.notdone || filters.done || filters.local || filters.canvas;

  taskList.innerHTML = "";
  for (let task of allTasks) {
    if (anyFilterActive) {
      const typeFilterActive = filters.canvas || filters.local;
      if (typeFilterActive) {
        const matchesType = (filters.local && !task.canvas) || (filters.canvas && task.canvas);
        if (!matchesType) continue;
      }

      const statusFilterActive = filters.notdone || filters.done;
      if (statusFilterActive) {
        const matchesStatus = (filters.notdone && !task.done) || (filters.done && task.done);
        if (!matchesStatus) continue;
      }
    }

    const taskControl = task.partial
      ? `<span class="taskPartial"><input class="partial-input" type="number" min="0" value="${task.partialCurrent}" placeholder="0">
       <span class="partial-sep">/</span>
       <input class="partial-input partial-total" type="number" min="0" value="${task.partialTotal}" placeholder="0"></span>`
      : `<md-checkbox ${task.done ? "checked" : ""}></md-checkbox>`;

    const renderedTask = task.canvas
      ? `
        <div class="card canvas-task" data-id="${task.id}">
            <md-checkbox ${task.done ? "checked" : ""}></md-checkbox>
            <div class="task-info">
                <span class="canvas-task-name">${task.name}</span>
                <span class="canvas-course-name">${task.courseName}</span>
                <span style="display: flex; gap: 10px; align-items: center;">
                    <input readonly class="task-due" type="date" value="${task.due ? task.due.split("T")[0] : ""}">
                    <code class="code-block">${task.id}</code>
                </span>
            </div>
            <md-icon-button class="canvas-link-btn">
                <md-icon>open_in_new</md-icon>
            </md-icon-button>
        </div>`
      : `
    <div class="card" data-id="${task.id}">
    <span class="donethings">
      ${taskControl}
      <md-icon-button class="task-type-btn">
        <md-icon id="task-type-arrow">arrow_drop_down</md-icon>
      </md-icon-button>
      </span>
      <div class="task-info">
        <input type="text" class="task-title" data-field="title" value="${task.title}" label="Task"></input>
          <span style="display: flex; gap: 10px; align-items: center;">
            <span style="display: flex; align-items: center; gap: 4px;">
              <input class="task-due" data-field="due" type="date" value="${task.due}">
            </span>
            <span class="task-meta">
              <code class="code-block">${task.id}</code>
            </span>
          </span>
        </div>
      <md-icon-button class="delete-btn">
        <md-icon>delete</md-icon>
      </md-icon-button>
    </div>`;
    taskList.insertAdjacentHTML("beforeend", renderedTask);
  }

  if (taskList.innerHTML === "") {
    taskList.innerHTML = `<div style="width: 100%; display: flex; align-items: center; justify-content: center; flex-direction: column; text-align: center;"><h2 style="margin-bottom: 3px;">No tasks found!</h2><p style="margin: 0;">Create a new one?</p></div>`;
  }
}

async function createNewTask() {
  if (isCreatingTask) return;
  isCreatingTask = true;

  try {
    const today = new Date().toISOString().split("T")[0];
    await fetch("/api/userdata/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ due: today }),
    });
    tasksLoaded = false;
    await renderTasks(canvasLoaded);
    const newCard = document.querySelector("#taskList .card:last-child");
    if (newCard) {
      newCard.style.opacity = "0";
      newCard.style.transform = "translateX(-20px)";
      newCard.style.transition = "none";
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          newCard.style.transition = "opacity 0.3s ease, transform 0.3s ease";
          newCard.style.opacity = "1";
          newCard.style.transform = "translateX(0)";
        });
      });
    }
  } catch (err) {
    console.error("createNewTask error:", err);
  }

  isCreatingTask = false;
}

// guides api
function updateAllProgress() {
  for (let guide of guides) {
    const card = document.querySelector(`[data-id="${guide.id}"]`);
    if (!card) continue;

    const guideProgress = calcGuideProgress(guide);
    card.querySelector(".progress-fill").style.width = `${guideProgress}%`;
    card.querySelector(".progress-pct").textContent = `${guideProgress}%`;

    for (let ms of guide.milestones) {
      const msCard = document.querySelector(`[data-id="${ms.id}"]`);
      if (!msCard) continue;

      const msProgress = calcMilestoneProgress(ms);
      msCard.querySelector(".progress-fill").style.width = `${msProgress}%`;
      msCard.querySelector(".progress-pct").textContent = `${msProgress}%`;
    }
  }
}

async function getGuides(type) {
  if (!guidesLoaded) {
    const response = await fetch("/api/userdata/guides", { method: "GET" });
    guidesLoaded = true;
    guides = await response.json();
  }

  if (type === "active") return guides.filter((g) => g.archived === false);
  if (type === "archived") return guides.filter((g) => g.archived === true);
}

function calcGuideProgress(guide) {
  let total = 0;
  let done = 0;
  for (let milestone of guide.milestones) {
    for (let task of milestone.tasks) {
      if (task.partial) {
        done += task.partialTotal > 0 ? task.partialCurrent / task.partialTotal : 0;
      } else if (task.done) {
        done++;
      }
      total++;
    }
  }
  return total === 0 ? 0 : Math.round((done / total) * 100);
}

function calcMilestoneProgress(ms) {
  let total = 0;
  let done = 0;
  for (let task of ms.tasks) {
    if (task.partial) {
      done += task.partialTotal > 0 ? task.partialCurrent / task.partialTotal : 0;
    } else if (task.done) {
      done++;
    }
    total++;
  }
  return total === 0 ? 0 : Math.round((done / total) * 100);
}

async function renderActiveGuides() {
  const guides = await getGuides("active");
  const guideList = document.querySelector("#guideList");

  const expandedGuides = Array.from(document.querySelectorAll(".guide-card"))
    .filter((card) => card.querySelector(".milestone-list").style.display !== "none")
    .map((card) => card.dataset.id);

  guideList.innerHTML = "";

  for (let guide of guides) {
    const guideProgress = calcGuideProgress(guide);
    const renderedGuide = `<div class="guide-card" data-id="${guide.id}">
    <div class="guide-header">
        <md-icon class="guide-drag-handle">drag_indicator</md-icon>
        <input class="guide-title" type="text" data-field="title" value="${guide.title}" placeholder="Unnamed Guide">
        <code class="code-block">${guide.id}</code>
        <div class="guide-actions">
            <div class="progress-wrap">
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${guideProgress}%"></div>
                </div>
                <span class="progress-pct">${guideProgress}%</span>
            </div>
            <md-icon-button class="archive-btn">
                <md-icon>archive</md-icon>
            </md-icon-button>
            <md-icon-button class="guide-expand-btn">
                <md-icon>expand_more</md-icon>
            </md-icon-button>
        </div>
    </div>
    <div class="milestone-list" style="display: none;"></div>
</div>`;
    guideList.insertAdjacentHTML("beforeend", renderedGuide);
  }

  Sortable.create(document.querySelector("#guideList"), {
    handle: ".guide-drag-handle",
    animation: 150,
    onEnd: () => {
      const guideArray = Array.from(document.querySelectorAll("#guideList .guide-card")).map((card) => card.dataset.id);
      fetch("/api/userdata/guides/reorder", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(guideArray),
      });
    },
  });
  for (let id of expandedGuides) {
    const card = document.querySelector(`[data-id="${id}"]`);
    if (!card) continue;
    await renderMilestones(id, true);
  }
}

async function renderArchivedGuides() {
  const guides = await getGuides("archived");
  const guideList = document.querySelector("#guideList");

  guideList.innerHTML = "";

  for (let guide of guides) {
    const guideProgress = calcGuideProgress(guide);
    const renderedGuide = `<div class="guide-card archived" data-id="${guide.id}">
    <div class="guide-header">
        <input class="guide-title" type="text" data-field="title" value="${guide.title}" placeholder="Guide title">
        <code class="code-block">${guide.id}</code>
        <div class="guide-actions">
            <div class="progress-wrap">
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${guideProgress}%"></div>
                </div>
                <span class="progress-pct">${guideProgress}%</span>
            </div>
            <md-icon-button class="unarchive-btn">
                <md-icon>unarchive</md-icon>
            </md-icon-button>
            <md-icon-button class="guide-delete-btn">
                <md-icon>delete</md-icon>
            </md-icon-button>
            <md-icon-button class="archived-guide-expand-btn">
                <md-icon>expand_more</md-icon>
            </md-icon-button>
        </div>
    </div>
    <div class="milestone-list" style="display: none;"></div>
</div>`;
    guideList.insertAdjacentHTML("beforeend", renderedGuide);
  }
}

async function createMs(guideId) {
  await fetch(`/api/userdata/guides/${guideId}/milestones`, { method: "POST" });
  guidesLoaded = false;
  renderMilestones(guideId, true);
}

async function renderMilestones(guideId, expanded) {
  const guides = await getGuides("active");
  const guide = guides.find((g) => g.id === guideId);

  const guideHTML = document.querySelector(`[data-id="${guideId}"]`);
  const msLs = guideHTML.querySelector(".milestone-list");

  const expandedMs = Array.from(document.querySelectorAll(".milestone"))
    .filter((card) => card.querySelector(".guide-task-list").style.display !== "none")
    .map((card) => card.dataset.id);
  msLs.innerHTML = "";

  for (let ms of guide.milestones) {
    const milestoneProgress = calcMilestoneProgress(ms);
    const renderedMS = `
<div class="milestone" data-id="${ms.id}">
    <div class="milestone-header">
        <md-icon class="ms-drag-handle">drag_indicator</md-icon>
        <input class="milestone-title" type="text" value="${ms.title}" placeholder="Unnamed Milestone">
        <code class="code-block">${ms.id}</code>
        <div class="milestone-actions">
            <div class="progress-wrap">
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${milestoneProgress}%"></div>
                </div>
                <span class="progress-pct">${milestoneProgress}%</span>
            </div>
            <md-icon-button class="milestone-expand-btn">
                <md-icon>expand_more</md-icon>
            </md-icon-button>
            <md-icon-button class="delete-milestone-btn">
                <md-icon>delete</md-icon>
            </md-icon-button>
        </div>
    </div>
    <div class="guide-task-list" style="display: none;"></div>
</div>`;
    msLs.insertAdjacentHTML("beforeend", renderedMS);
  }

  Sortable.create(msLs, {
    handle: ".ms-drag-handle",
    animation: 150,
    onEnd: () => {
      const msArray = Array.from(msLs.querySelectorAll(".milestone")).map((m) => m.dataset.id);
      fetch(`/api/userdata/guides/${guideId}/milestones/reorder`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(msArray),
      });
    },
  });

  msLs.insertAdjacentHTML(
    "beforeend",
    `
<md-text-button class="add-milestone-btn">
    <md-icon slot="icon">add</md-icon>
    Add Milestone
</md-text-button>`,
  );

  if (expanded) {
    msLs.style.display = "block";
    guideHTML.querySelector(".guide-expand-btn").classList.add("expanded");
  }
  for (let msId of expandedMs) {
    await renderGuideTasks(guideId, msId, true);
  }
}

async function renderArchivedMilestones(guideId, expanded) {
  const guides = await getGuides("archived");
  const guide = guides.find((g) => g.id === guideId);

  const guideHTML = document.querySelector(`[data-id="${guideId}"]`);
  const msLs = guideHTML.querySelector(".milestone-list");

  msLs.innerHTML = "";

  for (let ms of guide.milestones) {
    const milestoneProgress = calcMilestoneProgress(ms);
    if (ms.title === "") {
      ms.title = "Unnamed Milestone";
    }
    const renderedMS = `
<div class="milestone archived" data-id="${ms.id}">
    <div class="milestone-header">
        <span class="milestone-title-archived">${ms.title}</span>
        <div class="milestone-actions">
            <div class="progress-wrap">
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${milestoneProgress}%"></div>
                </div>
                <span class="progress-pct">${milestoneProgress}%</span>
            </div>
        </div>
    </div>
</div>`;
    msLs.insertAdjacentHTML("beforeend", renderedMS);
  }

  if (expanded) {
    msLs.style.display = "block";
    guideHTML.querySelector(".guide-expand-btn").classList.add("expanded");
  }
}

async function createGuideTask(guideId, msId) {
  await fetch(`/api/userdata/guides/${guideId}/milestones/${msId}/tasks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  guidesLoaded = false;
  await renderGuideTasks(guideId, msId, true);
}

async function renderGuideTasks(guideId, milestoneId, expanded) {
  const guides = await getGuides("active");
  const guide = guides.find((g) => g.id === guideId);

  const msHTML = document.querySelector(`[data-id="${milestoneId}"]`);
  const ms = guide.milestones.find((m) => m.id === milestoneId);
  const taskLs = msHTML.querySelector(".guide-task-list");

  taskLs.innerHTML = "";

  for (let task of ms.tasks) {
    const taskControl = task.partial
      ? `<span class="taskPartial"><input class="partial-input" type="number" min="0" value="${task.partialCurrent}" placeholder="0">
       <span class="partial-sep">/</span>
       <input class="partial-input partial-total" type="number" min="0" value="${task.partialTotal}" placeholder="0"></span>`
      : `<md-checkbox ${task.done ? "checked" : ""}></md-checkbox>`;
    const renderedTask = `
<div class="guide-task" data-id="${task.id}">
<md-icon class="task-drag-handle">drag_indicator</md-icon>
    ${taskControl}
      <md-icon-button class="task-type-btn">
      <md-icon class="task-type-arrow">arrow_drop_down</md-icon>
    </md-icon-button>
    <input class="guide-task-title ${task.done ? "done" : ""}" type="text" value="${task.title}" placeholder="Unnamed Task">
    <div class="guide-task-actions">
        <md-icon-button class="task-link-btn">
            <md-icon>${task.link ? "link" : "link_off"}</md-icon>
        </md-icon-button>
        <md-icon-button class="delete-task-btn">
            <md-icon>delete</md-icon>
        </md-icon-button>
    </div>
</div>`;
    taskLs.insertAdjacentHTML("beforeend", renderedTask);
  }

  Sortable.create(taskLs, {
    handle: ".task-drag-handle",
    animation: 150,
    onEnd: () => {
      const tasksArray = Array.from(taskLs.querySelectorAll(".guide-task")).map((t) => t.dataset.id);
      fetch(`/api/userdata/guides/${guideId}/milestones/${milestoneId}/tasks/reorder`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(tasksArray),
      });
    },
  });

  taskLs.insertAdjacentHTML(
    "beforeend",
    `
<md-text-button class="add-task-btn">
    <md-icon slot="icon">add</md-icon>
    Add Task
</md-text-button>`,
  );
  if (expanded) {
    taskLs.style.display = "block";
    msHTML.querySelector(".milestone-expand-btn").classList.add("expanded");
  }
}

async function createNewGuide() {
  await fetch("/api/userdata/guides", { method: "POST" });
  guidesLoaded = false;
  await renderActiveGuides();
}

// nav
function showPage() {
  let hash = window.location.hash.replace("#", "");
  if (hash === "") {
    hash = "summary";
    window.location.hash = "summary";
  }

  const pages = document.querySelectorAll(".page");
  for (let page of pages) page.classList.remove("active");
  for (let page of pages) {
    if (page.id === hash) page.classList.add("active");
  }

  const pgNames = ["summary", "tasks", "guides"];
  tabs.activeTabIndex = pgNames.indexOf(hash);

  runPageScripts(hash);
}

async function renderGreeters() {
  const header = document.querySelector("#sumpage-header");
  const greeting = header.querySelector("#sumpage-greet");
  const date = header.querySelector("#sumpage-date");

  const settings = await getSettings();

  const midnight = [
    `Late night grind, ${settings.nickname}?`,
    `You're up late, ${settings.nickname}.`,
    `Good evening, night owl.`,
    `Good evening, ${settings.nickname}.`,
    `Burning the midnight oil, ${settings.nickname}?`,
    `Still at it, ${settings.nickname}?`,
    `It's not like I wanted to greet you or anything, ${settings.nickname}!`,
    `Stay determined, ${settings.nickname}.`,
  ];

  const morning = [
    `Breakfast and productivity, ${settings.nickname}?`,
    `Good morning, ${settings.nickname}.`,
    `Early bird gets the work done, ${settings.nickname}!`,
    `Rise and grind, ${settings.nickname}!`,
    `It's not like I wanted to greet you or anything, ${settings.nickname}!`,
    `Stay determined, ${settings.nickname}.`,
  ];

  const noon = [
    `Good afternoon, ${settings.nickname}.`,
    `Afternoon grind, ${settings.nickname}?`,
    `Keep it up, ${settings.nickname}!`,
    `Lovely day, isn't it, ${settings.nickname}?`,
    `Going strong, ${settings.nickname}.`,
    `You're gonna be a [BIG SHOT], ${settings.nickname}`,
    `Jarona, ${settings.nickname}!`,
    `Hey there, ${settings.nickname}.`,
    `It's not like I wanted to greet you or anything, ${settings.nickname}!`,
    `Stay determined, ${settings.nickname}.`,
  ];

  const evening = [
    `Good evening, ${settings.nickname}.`,
    `Winding down, ${settings.nickname}?`,
    `Ready for bed, ${settings.nickname}?`,
    `Still grinding, ${settings.nickname}?`,
    `It's getting late, ${settings.nickname}.`,
    `Another day down, ${settings.nickname}`,
    `Finished all your homework, ${settings.nickname}?`,
    `Getting closer to your hopes and dreams, ${settings.nickname}?`,
    `It's not like I wanted to greet you or anything, ${settings.nickname}!`,
  ];

  // day greeter
  const hour = new Date().getHours();

  let pool;
  if (hour >= 0 && hour <= 5) pool = midnight;
  else if (hour >= 6 && hour <= 11) pool = morning;
  else if (hour >= 12 && hour <= 18) pool = noon;
  else pool = evening;

  const greeting_msg = pool[Math.floor(Math.random() * pool.length)];
  greeting.innerHTML = greeting_msg;

  // task counter
  const target = new Date();
  target.setHours(0, 0, 0, 0);
  const dueThatDay = tasks.filter((task) => {
    if (!task.due) return false;
    const [year, month, day] = task.due.split("-").map(Number);
    const due = new Date(year, month - 1, day);
    return due.getTime() === target.getTime();
  });

  const options = {
    month: "short",
    day: "numeric",
    year: "numeric",
  };

  const formattedDate = target.toLocaleDateString("en-US", options);
  const incomplete = dueThatDay.filter((t) => !t.done).length;
  const taskMsg =
    incomplete === 0 ? "All tasks done!" : `You have ${incomplete} task${incomplete === 1 ? "" : "s"} left.`;
  date.innerHTML = formattedDate + " — " + taskMsg;
}

async function runPageScripts(hash) {
  if (hash === "tasks") {
    if (!tasksLoaded) {
      const settings = await getSettings();
      const filters = settings.defaultFilters;

      document.querySelector('[label="Incomplete"]').selected = filters.undone;
      document.querySelector('[label="Completed"]').selected = filters.done;
      document.querySelector('[label="Canvas"]').selected = filters.canvas;
      document.querySelector('[label="Clutter"]').selected = filters.clutter;
    }

    await renderTasks(canvasLoaded);
  }

  if (hash === "guides") {
    document.querySelector("#active-guide-btn").selected = true;
    document.querySelector("#archived-guide-btn").selected = false;
    if (!guidesLoaded) {
      await renderActiveGuides();
    }
  }

  if (hash === "summary") {
    await getTasks();
    if (!document.querySelector("#sumpage-greet").innerHTML) {
      renderGreeters();
    }
    await renderActivityGrid();
  }
}
window.addEventListener("hashchange", showPage);

// init
function initSettingsListeners() {
  document.querySelector("#settings-btn").addEventListener("click", () => {
    getSettings().then((settings) => {
      document.querySelector("#settings-nickname").value = settings.nickname;
      document.querySelector("#settings-email").value = settings.email;
      document.querySelector("#settings-theme").selected = settings.theme === "dark";
      document.querySelector("#pref-canvas-key").value = settings.canvas.apiKey;
      document.querySelector("#pref-canvas-url").value = settings.canvas.url;

      document.querySelector("#pref-undone").selected = settings.defaultFilters.undone === true;
      document.querySelector("#pref-done").selected = settings.defaultFilters.done === true;
      document.querySelector("#pref-canvas").selected = settings.defaultFilters.canvas === true;
      document.querySelector("#pref-clutter").selected = settings.defaultFilters.clutter === true;

      document.querySelector("#settings-modal").show();
    });
  });

  document.querySelector("#settings-close").addEventListener("click", () => {
    document.querySelector("#settings-modal").close();
  });

  document.querySelector("#settings-modal").addEventListener("focusout", (event) => {
    if (event.target.tagName !== "MD-OUTLINED-TEXT-FIELD" || event.target.id === "settings-email") return;

    const field = event.target.dataset.field;
    const value = event.target.value;

    const body =
      field === "canvas.apiKey" || field === "canvas.url"
        ? { canvas: { [field.split(".")[1]]: value } }
        : { [field]: value };

    fetch("/api/userdata/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  });

  document.querySelector("#settings-modal").addEventListener("change", (event) => {
    if (event.target.tagName !== "MD-SWITCH") return;

    const isDark = event.target.selected;
    document.documentElement.className = isDark ? "dark" : "light";

    fetch("/api/userdata/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ theme: isDark ? "dark" : "light" }),
    });
  });

  document.querySelector("#settings-modal").addEventListener("click", (event) => {
    if (event.target.tagName !== "MD-FILTER-CHIP") return;

    fetch("/api/userdata/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ defaultFilters: { [event.target.dataset.field]: event.target.selected } }),
    });
  });
}

function initTaskListeners() {
  document.querySelector("#taskList").addEventListener("focusout", (event) => {
    if (!event.target.classList.contains("partial-input")) return;

    const card = event.target.closest(".card");
    const tskId = card.dataset.id;

    let current = parseInt(card.querySelector(".partial-input:not(.partial-total)").value) || 0;
    let total = parseInt(card.querySelector(".partial-total").value) || 0;

    if (current > total && total > 0) {
      current = total;
      card.querySelector(".partial-input:not(.partial-total)").value = total;
    }
    fetch(`/api/userdata/tasks/${tskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        partialCurrent: current,
        partialTotal: total,
        done: current >= total && total > 0,
      }),
    }).then(() => {
      tasksLoaded = false;
      renderTasks(canvasLoaded);
    });
  });

  document.querySelector("#new-task-btn").addEventListener("click", () => {
    createNewTask();
  });

  document.querySelector(".content-area").addEventListener("click", (event) => {
    if (event.target.tagName !== "MD-FILTER-CHIP") return;
    setTimeout(() => renderTasks(canvasLoaded), 50);
  });

  document.querySelector("#taskList").addEventListener("focusout", (event) => {
    if (!event.target.dataset.field) return;
    const card = event.target.closest(".card");
    if (!card || card.classList.contains("canvas-task")) return;

    const taskId = card.dataset.id;
    const field = event.target.dataset.field;
    const value = event.target.value;

    fetch("/api/userdata/tasks/" + taskId, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    }).then(() => renderTasks(canvasLoaded));
  });

  document.querySelector("#taskList").addEventListener("change", (event) => {
    if (event.target.tagName !== "MD-CHECKBOX") return;
    const card = event.target.closest(".card");
    if (!card || card.classList.contains("canvas-task")) return;
    const taskId = card.dataset.id;

    fetch("/api/userdata/tasks/" + taskId, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done: event.target.checked }),
    }).then(() => {
      const t = tasks.find((t) => t.id === taskId);
      if (t) t.done = event.target.checked;

      const filters = {
        notdone: document.querySelector('[label="Incomplete"]').selected,
        done: document.querySelector('[label="Completed"]').selected,
      };

      // if incomplete filter is on and task was just completed, animate it out
      if (filters.notdone && !filters.done && event.target.checked) {
        card.style.transition = "opacity 0.3s ease, transform 0.3s ease";
        card.style.opacity = "0";
        card.style.transform = "translateX(20px)";
        setTimeout(() => renderTasks(canvasLoaded), 350);
      }
    });
  });

  document.querySelector("#taskList").addEventListener("change", (event) => {
    if (event.target.tagName !== "MD-CHECKBOX") return;
    const card = event.target.closest(".card");
    if (!card.classList.contains("canvas-task")) return;
    const taskId = card.dataset.id;
    fetch("/api/integrations/canvas/done/" + taskId, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done: event.target.checked }),
    }).then(() => {
      const ct = canvasTasks.find((t) => t.id === taskId);
      if (ct) ct.done = event.target.checked;

      const filters = {
        notdone: document.querySelector('[label="Incomplete"]').selected,
        done: document.querySelector('[label="Completed"]').selected,
      };

      if (filters.notdone && !filters.done && event.target.checked) {
        card.style.transition = "opacity 0.3s ease, transform 0.3s ease";
        card.style.opacity = "0";
        card.style.transform = "translateX(20px)";
        setTimeout(() => renderTasks(canvasLoaded), 350);
      }
    });
  });

  document.querySelector("#taskList").addEventListener("click", (event) => {
    const deleteBtn = event.target.closest(".delete-btn");
    if (!deleteBtn) return;

    const card = deleteBtn.closest(".card");
    taskToDelete = card.dataset.id;
    document.querySelector("#delete-confirm").show();
  });

  document.querySelector("#delete-cancel").addEventListener("click", () => {
    document.querySelector("#delete-confirm").close();
    taskToDelete = null;
  });

  document.querySelector("#delete-confirm-btn").addEventListener("click", async () => {
    if (!taskToDelete) return;
    document.querySelector("#delete-confirm").close();

    const cardEl = document.querySelector(`.card[data-id="${taskToDelete}"]`);
    if (cardEl) {
      cardEl.style.transition = "opacity 0.3s ease, transform 0.3s ease";
      cardEl.style.opacity = "0";
      cardEl.style.transform = "translateX(20px)";
      await new Promise((r) => setTimeout(r, 300));
    }

    await fetch("/api/userdata/tasks/" + taskToDelete, { method: "DELETE" });

    tasksLoaded = false;
    taskToDelete = null;
    await renderTasks(canvasLoaded);
  });
}

function initGuideListeners() {
  document.querySelector("#new-guide-btn").addEventListener("click", () => {
    createNewGuide();
  });

  document.querySelector("#active-guide-btn").addEventListener("click", () => {
    document.querySelector("#active-guide-btn").selected = true;
    document.querySelector("#archived-guide-btn").selected = false;
    guidesLoaded = false;
    renderActiveGuides();
  });

  document.querySelector("#archived-guide-btn").addEventListener("click", () => {
    document.querySelector("#active-guide-btn").selected = false;
    document.querySelector("#archived-guide-btn").selected = true;
    guidesLoaded = false;
    renderArchivedGuides();
  });

  // guide expand
  document.querySelector("#guideList").addEventListener("click", (event) => {
    const guideExpandBtn = event.target.closest(".guide-expand-btn");
    if (!guideExpandBtn) return;

    const card = guideExpandBtn.closest(".guide-card");
    const milestoneList = card.querySelector(".milestone-list");

    const isOpening = milestoneList.style.display === "none";
    milestoneList.style.display = isOpening ? "block" : "none";
    guideExpandBtn.classList.toggle("expanded");
    if (isOpening) renderMilestones(card.dataset.id);
  });
  // milestone expand
  document.querySelector("#guideList").addEventListener("click", (event) => {
    const msExpandBtn = event.target.closest(".milestone-expand-btn");
    if (!msExpandBtn) return;

    const card = msExpandBtn.closest(".guide-card");
    const milestone = msExpandBtn.closest(".milestone");
    const taskList = milestone.querySelector(".guide-task-list");

    const isOpening = taskList.style.display === "none";
    taskList.style.display = isOpening ? "block" : "none";
    event.target.classList.toggle("expanded");
    if (isOpening) renderGuideTasks(card.dataset.id, milestone.dataset.id);
  });

  // milestone add
  document.querySelector("#guideList").addEventListener("click", (event) => {
    const msCreateBtn = event.target.closest(".add-milestone-btn");
    if (!msCreateBtn) return;

    const guideId = msCreateBtn.closest(".guide-card").dataset.id;

    createMs(guideId);
  });

  // milestone autosave
  document.querySelector("#guideList").addEventListener("focusout", (event) => {
    if (!event.target.classList.contains("milestone-title")) return;

    const guideId = event.target.closest(".guide-card").dataset.id;

    const ms = event.target.closest(".milestone");
    const msId = ms.dataset.id;

    fetch(`/api/userdata/guides/${guideId}/milestones/${msId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: event.target.value }),
    });
    setTimeout(() => {
      guidesLoaded = false;
      renderMilestones(guideId, true);
    }, 700);
  });

  // milestone rm
  document.querySelector("#guideList").addEventListener("click", (event) => {
    const msDelBtn = event.target.closest(".delete-milestone-btn");
    if (!msDelBtn) return;

    const guideId = msDelBtn.closest(".guide-card").dataset.id;
    const msId = msDelBtn.closest(".milestone").dataset.id;
    msToDel = msId;
    guideToDel = guideId;
    document.querySelector("#ms-delete-confirm").show();
  });

  document.querySelector("#ms-delete-cancel").addEventListener("click", () => {
    document.querySelector("#ms-delete-confirm").close();
    msToDel = null;
    guideToDel = null;
  });

  document.querySelector("#ms-delete-confirm-btn").addEventListener("click", async () => {
    if (!msToDel) return;
    document.querySelector("#ms-delete-confirm").close();

    await fetch(`/api/userdata/guides/${guideToDel}/milestones/${msToDel}`, { method: "DELETE" });

    guideToDel = null;
    msToDel = null;
    guidesLoaded = false;
    await renderActiveGuides();
  });
}

// guide title save
document.querySelector("#guideList").addEventListener("focusout", (event) => {
  if (!event.target.classList.contains("guide-title")) return;
  const guide = event.target.closest(".guide-card");
  if (!guide) return;

  fetch("/api/userdata/guides/" + guide.dataset.id, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: event.target.value }),
  });
});

// archive
document.querySelector("#guideList").addEventListener("click", (event) => {
  if (!event.target.classList.contains("archive-btn")) return;
  const guide = event.target.closest(".guide-card");
  if (!guide) return;

  fetch("/api/userdata/guides/" + guide.dataset.id, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ archived: true }),
  });
  setTimeout(() => {
    guidesLoaded = false;
    renderActiveGuides();
  }, 300);
});

// show archived milestones
document.querySelector("#guideList").addEventListener("click", (event) => {
  const guideExpandBtn = event.target.closest(".archived-guide-expand-btn");
  if (!guideExpandBtn) return;

  const card = guideExpandBtn.closest(".guide-card");
  const milestoneList = card.querySelector(".milestone-list");

  const isOpening = milestoneList.style.display === "none";
  milestoneList.style.display = isOpening ? "block" : "none";
  guideExpandBtn.classList.toggle("expanded");
  if (isOpening) renderArchivedMilestones(card.dataset.id);
});

// unarchive
document.querySelector("#guideList").addEventListener("click", (event) => {
  if (!event.target.classList.contains("unarchive-btn")) return;
  const guide = event.target.closest(".guide-card");
  if (!guide) return;

  fetch("/api/userdata/guides/" + guide.dataset.id, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ archived: false }),
  });
  setTimeout(() => {
    guidesLoaded = false;
    renderArchivedGuides();
  }, 300);
});

// create task
document.querySelector("#guideList").addEventListener("click", async (event) => {
  if (!event.target.classList.contains("add-task-btn")) return;
  const guide = event.target.closest(".guide-card");
  const ms = event.target.closest(".milestone");

  await createGuideTask(guide.dataset.id, ms.dataset.id, true);
  updateAllProgress();
});

// autosave task title
document.querySelector("#guideList").addEventListener("focusout", (event) => {
  if (!event.target.classList.contains("guide-task-title")) return;
  const guideId = event.target.closest(".guide-card").dataset.id;
  const msId = event.target.closest(".milestone").dataset.id;
  const tskId = event.target.closest(".guide-task").dataset.id;

  fetch(`/api/userdata/guides/${guideId}/milestones/${msId}/tasks/${tskId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: event.target.value }),
  });
  setTimeout(() => {
    guidesLoaded = false;
    renderGuideTasks(guideId, msId, true);
  }, 500);
});

// autosave task done
document.querySelector("#guideList").addEventListener("change", async (event) => {
  if (event.target.tagName !== "MD-CHECKBOX") return;
  const guideId = event.target.closest(".guide-card").dataset.id;
  const msId = event.target.closest(".milestone").dataset.id;
  const tskId = event.target.closest(".guide-task").dataset.id;

  await fetch(`/api/userdata/guides/${guideId}/milestones/${msId}/tasks/${tskId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      done: event.target.checked,
      completedAt: event.target.checked ? new Date().toISOString() : null,
    }),
  });

  guidesLoaded = false;
  await getGuides("active"); // refresh cache
  updateAllProgress();

  const taskTitle = event.target.closest(".guide-task").querySelector(".guide-task-title");
  taskTitle.classList.toggle("done", event.target.checked);
});

// task type
document.querySelector("#guideList").addEventListener("click", async (event) => {
  const dropdown = event.target.closest(".task-type-btn");
  if (!dropdown) return;
  activeTypeContext = "guide";

  const guideId = event.target.closest(".guide-card").dataset.id;
  const msId = event.target.closest(".milestone").dataset.id;
  const tskId = event.target.closest(".guide-task").dataset.id;

  const guide = guides.find((g) => g.id === guideId);
  const ms = guide.milestones.find((m) => m.id === msId);
  const task = ms.tasks.find((t) => t.id === tskId);

  if (!task.partial) {
    document.querySelector("#task-partial-check").textContent = "";
    document.querySelector("#task-single-check").textContent = "check";
  } else if (task.partial) {
    document.querySelector("#task-single-check").textContent = "";
    document.querySelector("#task-partial-check").textContent = "check";
  }

  dropdown.id = "active-link-anchor";
  const menu = document.querySelector("#task-type-menu");
  menu.anchorElement = dropdown;
  menu.open = !menu.open;

  activeTypeGuideId = guideId;
  activeTypeMsId = msId;
  activeTypeTaskId = tskId;
});

document.querySelector("#taskList").addEventListener("click", async (event) => {
  const dropdown = event.target.closest(".task-type-btn");
  if (!dropdown) return;
  activeTypeContext = "task";

  const tskId = event.target.closest(".card").dataset.id;
  const task = tasks.find((t) => t.id === tskId);

  if (!task.partial) {
    document.querySelector("#task-partial-check").textContent = "";
    document.querySelector("#task-single-check").textContent = "check";
  } else if (task.partial) {
    document.querySelector("#task-single-check").textContent = "";
    document.querySelector("#task-partial-check").textContent = "check";
  }

  dropdown.id = "active-link-anchor";
  const menu = document.querySelector("#task-type-menu");
  menu.anchorElement = dropdown;
  menu.open = !menu.open;

  activeTypeTaskId = tskId;
});

// task type set
document.querySelector("#task-type-menu").addEventListener("click", async (event) => {
  const item = event.target.closest("md-menu-item");
  if (!item) return;

  if (activeTypeContext === "task") {
    if (item.id === "task-single") {
      await fetch(`/api/userdata/tasks/${activeTypeTaskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partial: false, done: false }),
      });
      tasksLoaded = false;
      await renderTasks(canvasLoaded);
    }
    if (item.id === "task-partial") {
      await fetch(`/api/userdata/tasks/${activeTypeTaskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partial: true, partialCurrent: 0, partialTotal: 0, done: false }),
      });
      tasksLoaded = false;
      await renderTasks(canvasLoaded);
    }
    activeTypeTaskId = null;
    activeTypeContext = null;
  } else if (activeTypeContext === "guide") {
    const guide = guides.find((g) => g.id === activeTypeGuideId);
    const ms = guide.milestones.find((m) => m.id === activeTypeMsId);
    const task = ms.tasks.find((t) => t.id === activeTypeTaskId);
    if (item.id === "task-single") {
      await fetch(`/api/userdata/guides/${activeTypeGuideId}/milestones/${activeTypeMsId}/tasks/${activeTypeTaskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          partial: false,
          done: false,
        }),
      });
      guidesLoaded = false;
      activeTypeContext = null;
      await renderGuideTasks(activeTypeGuideId, activeTypeMsId, true);
    }
    if (item.id === "task-partial") {
      await fetch(`/api/userdata/guides/${activeTypeGuideId}/milestones/${activeTypeMsId}/tasks/${activeTypeTaskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partial: true, partialCurrent: 0, partialTotal: 0, done: false }),
      });
      guidesLoaded = false;
      activeTypeContext = null;
      await renderGuideTasks(activeTypeGuideId, activeTypeMsId, true);
    }

    activeTypeGuideId = null;
    activeTypeMsId = null;
    activeTypeTaskId = null;
  }
});
document.querySelector("#guideList").addEventListener("focusout", (event) => {
  if (!event.target.classList.contains("partial-input")) return;

  const guideId = event.target.closest(".guide-card").dataset.id;
  const msId = event.target.closest(".milestone").dataset.id;
  const tskId = event.target.closest(".guide-task").dataset.id;

  const task = event.target.closest(".guide-task");
  let current = parseInt(task.querySelector(".partial-input:not(.partial-total)").value) || 0;
  let total = parseInt(task.querySelector(".partial-total").value) || 0;

  if (current > total && total > 0) {
    current = total;
    task.querySelector(".partial-input:not(.partial-total)").value = total;
  }

  fetch(`/api/userdata/guides/${guideId}/milestones/${msId}/tasks/${tskId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      partialCurrent: current,
      partialTotal: total,
      done: current >= total && total > 0,
      completedAt: current >= total && total > 0 ? new Date().toISOString() : null,
    }),
  }).then(async () => {
    guidesLoaded = false;
    await getGuides("active");
    updateAllProgress();
    renderGuideTasks(guideId, msId, true);
  });
});
// task link
document.querySelector("#guideList").addEventListener("click", async (event) => {
  const linkBtn = event.target.closest(".task-link-btn");
  if (!linkBtn) return;

  const guideId = event.target.closest(".guide-card").dataset.id;
  const msId = event.target.closest(".milestone").dataset.id;
  const tskId = event.target.closest(".guide-task").dataset.id;

  const guide = guides.find((g) => g.id === guideId);
  const ms = guide.milestones.find((m) => m.id === msId);
  const task = ms.tasks.find((t) => t.id === tskId);
  const link = task.link;

  activeLinkGuideId = guideId;
  activeLinkMsId = msId;
  activeLinkTaskId = tskId;

  if (!link) {
    document.querySelector("#link-input").value = "";
    document.querySelector("#link-edit-dialog").show();
  }

  if (link) {
    linkBtn.id = "active-link-anchor";
    const menu = document.querySelector("#link-menu");
    menu.anchorElement = linkBtn;
    menu.open = true;
  }
});

// open
document.querySelector("#link-open").addEventListener("click", () => {
  const guide = guides.find((g) => g.id === activeLinkGuideId);
  const ms = guide.milestones.find((m) => m.id === activeLinkMsId);
  const task = ms.tasks.find((t) => t.id === activeLinkTaskId);
  const link = task.link;
  window.open(link);
});

// edit
document.querySelector("#link-edit").addEventListener("click", () => {
  const guide = guides.find((g) => g.id === activeLinkGuideId);
  const ms = guide.milestones.find((m) => m.id === activeLinkMsId);
  const task = ms.tasks.find((t) => t.id === activeLinkTaskId);
  const link = task.link;

  document.querySelector("#link-input").value = link;
  document.querySelector("#link-edit-dialog").show();
});

// save
document.querySelector("#link-save").addEventListener("click", async () => {
  let url = document.querySelector("#link-input").value;
  if (url && !url.startsWith("http://") && !url.startsWith("https://")) {
    url = "https://" + url;
  }

  const guide = guides.find((g) => g.id === activeLinkGuideId);
  const ms = guide.milestones.find((m) => m.id === activeLinkMsId);
  const task = ms.tasks.find((t) => t.id === activeLinkTaskId);
  const link = task.link;

  await fetch(`/api/userdata/guides/${activeLinkGuideId}/milestones/${activeLinkMsId}/tasks/${activeLinkTaskId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ link: url }),
  });
  guidesLoaded = false;
  await renderGuideTasks(activeLinkGuideId, activeLinkMsId, true);
  document.querySelector("#link-edit-dialog").close();
  activeLinkGuideId = null;
  activeLinkMsId = null;
  activeLinkTaskId = null;
});

// exit dialog
document.querySelector("#link-cancel").addEventListener("click", () => {
  document.querySelector("#link-edit-dialog").close();
  activeLinkGuideId = null;
  activeLinkMsId = null;
  activeLinkTaskId = null;
});

document.querySelector("#link-edit").addEventListener("click", () => {
  const guide = guides.find((g) => g.id === activeLinkGuideId);
  const ms = guide.milestones.find((m) => m.id === activeLinkMsId);
  const task = ms.tasks.find((t) => t.id === activeLinkTaskId);
  const link = task.link;

  document.querySelector("#link-input").value = link;
  document.querySelector("#link-edit-dialog").show();
});

document.querySelector("#link-remove").addEventListener("click", async () => {
  const guide = guides.find((g) => g.id === activeLinkGuideId);
  const ms = guide.milestones.find((m) => m.id === activeLinkMsId);
  const task = ms.tasks.find((t) => t.id === activeLinkTaskId);
  const link = task.link;

  fetch(`/api/userdata/guides/${activeLinkGuideId}/milestones/${activeLinkMsId}/tasks/${activeLinkTaskId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ link: "" }),
  });
  setTimeout(() => {
    guidesLoaded = false;
    renderGuideTasks(activeLinkGuideId, activeLinkMsId, true);
    activeLinkGuideId = null;
    activeLinkMsId = null;
    activeLinkTaskId = null;
  }, 300);
});

// task rm
document.querySelector("#guideList").addEventListener("click", (event) => {
  const tskDelBtn = event.target.closest(".delete-task-btn");
  if (!tskDelBtn) return;

  const guideId = tskDelBtn.closest(".guide-card").dataset.id;
  const msId = tskDelBtn.closest(".milestone").dataset.id;
  const tskId = event.target.closest(".guide-task").dataset.id;
  guideTaskToDel = tskId;
  msToDel = msId;
  guideToDel = guideId;
  document.querySelector("#tsk-delete-confirm").show();
});

document.querySelector("#tsk-delete-cancel").addEventListener("click", () => {
  document.querySelector("#tsk-delete-confirm").close();
  msToDel = null;
  guideToDel = null;
  guideTaskToDel = null;
});

document.querySelector("#tsk-delete-confirm-btn").addEventListener("click", async () => {
  if (!guideTaskToDel) return;
  document.querySelector("#tsk-delete-confirm").close();

  await fetch(`/api/userdata/guides/${guideToDel}/milestones/${msToDel}/tasks/${guideTaskToDel}`, { method: "DELETE" });

  guidesLoaded = false;
  await renderGuideTasks(guideToDel, msToDel, true);
  updateAllProgress();
  msToDel = null;
  guideToDel = null;
  guideTaskToDel = null;
});

// delete guide (archived)
document.querySelector("#guideList").addEventListener("click", (event) => {
  if (!event.target.classList.contains("guide-delete-btn")) return;
  const guide = event.target.closest(".guide-card");
  if (!guide) return;

  document.querySelector("#guide-delete-confirm").show();
  guideToDel = guide.dataset.id;
});

document.querySelector("#guide-delete-cancel").addEventListener("click", () => {
  document.querySelector("#guide-delete-confirm").close();
  guideToDel = null;
});

document.querySelector("#guide-delete-confirm-btn").addEventListener("click", async () => {
  if (!guideToDel) return;
  document.querySelector("#guide-delete-confirm").close();

  await fetch("/api/userdata/guides/" + guideToDel, { method: "DELETE" });

  guideToDel = null;
  guidesLoaded = false;
  await renderArchivedGuides();
});

function initAccountListeners() {
  getSettings().then((settings) => {
    document.querySelector("#account-info div").innerHTML = `${settings.nickname}<br><small>${settings.email}</small>`;
  });

  document.querySelector("#account-btn").addEventListener("click", () => {
    const menu = document.querySelector("#account-menu");
    menu.open = !menu.open;
  });

  document.querySelector("#signout-btn").addEventListener("click", () => {
    window.location.href = "/oauth2/sign_out";
  });
}

// load
document.addEventListener("DOMContentLoaded", async () => {
  pullCanvasTasks().then(() => {
    const hash = window.location.hash.replace("#", "") || "summary";
    if (hash === "tasks") renderTasks(true);
    if (hash === "summary") renderActivityGrid(canvasTasks);
  });
  tabs = document.querySelector("md-tabs");
  tabs.addEventListener("change", () => {
    const pgNames = ["summary", "tasks", "guides"];
    const name = pgNames[tabs.activeTabIndex];
    if (window.location.hash !== `#${name}`) window.location.hash = name;
  });

  // apply theme on load
  const settings = await getSettings();
  document.documentElement.className = settings.theme === "dark" ? "dark" : "light";

  initAccountListeners();
  initSettingsListeners();
  initTaskListeners();
  initGuideListeners();

  showPage();
});
