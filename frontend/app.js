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

// settings api
async function getSettings() {
  const response = await fetch("/api/userdata/settings");
  const data = await response.json();
  return data;
}

// tasks api
async function getTasks() {
  const response = await fetch("/api/userdata/tasks", { method: "GET" });
  const data = await response.json();
  return data;
}

async function renderTasks() {
  const taskData = await getTasks();

  taskData.sort((a, b) => {
    if (!a.due) return 1;
    if (!b.due) return -1;
    return new Date(a.due) - new Date(b.due);
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
  for (let task of taskData) {
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

    const renderedTask = `<div class="card" data-id="${task.id}">
                <md-checkbox ${task.done ? "checked" : ""}></md-checkbox>
                <div class="task-info">
                    <md-outlined-text-field data-field="title" value="${task.title}" label="Task"></md-outlined-text-field>
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
}

async function createNewTask() {
  if (isCreatingTask) return;
  isCreatingTask = true;

  try {
    await fetch("/api/userdata/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    await renderTasks();
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
      total++;
      if (task.done === true) done++;
    }
  }
  return total === 0 ? 0 : Math.round((done / total) * 100);
}

function calcMilestoneProgress(ms) {
  let total = 0;
  let done = 0;
  for (let task of ms.tasks) {
    total++;
    if (task.done === true) done++;
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
  await fetch(`/api/userdata/guides/${guideId}/milestones/${msId}/tasks`, { method: "POST" });
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
    const renderedTask = `
<div class="guide-task" data-id="${task.id}">
    <md-icon class="task-drag-handle">drag_indicator</md-icon>
    <md-checkbox ${task.done ? "checked" : ""}></md-checkbox>
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

async function runPageScripts(hash) {
  if (hash === "tasks") {
    const settings = await getSettings();
    const filters = settings.defaultFilters;

    document.querySelector('[label="Incomplete"]').selected = filters.undone;
    document.querySelector('[label="Completed"]').selected = filters.done;
    document.querySelector('[label="Canvas"]').selected = filters.canvas;
    document.querySelector('[label="Clutter"]').selected = filters.clutter;

    await renderTasks();
  }

  if (hash === "guides") {
    guidesLoaded = false;
    await renderActiveGuides();
    document.querySelector("#active-guide-btn").selected = true;
    document.querySelector("#archived-guide-btn").selected = false;
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

    fetch("/api/userdata/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ theme: event.target.selected ? "dark" : "light" }),
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
  document.querySelector("#new-task-btn").addEventListener("click", () => {
    createNewTask();
  });

  document.querySelector(".content-area").addEventListener("click", (event) => {
    if (event.target.tagName !== "MD-FILTER-CHIP") return;
    setTimeout(() => renderTasks(), 50);
  });

  document.querySelector("#taskList").addEventListener("focusout", (event) => {
    if (!event.target.dataset.field) return;
    const card = event.target.closest(".card");
    if (!card) return;

    const taskId = card.dataset.id;
    const field = event.target.dataset.field;
    const value = event.target.value;

    fetch("/api/userdata/tasks/" + taskId, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    }).then(() => renderTasks());
  });

  document.querySelector("#taskList").addEventListener("change", (event) => {
    if (event.target.tagName !== "MD-CHECKBOX") return;
    const card = event.target.closest(".card");
    const taskId = card.dataset.id;

    fetch("/api/userdata/tasks/" + taskId, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done: event.target.checked }),
    }).then(() => setTimeout(() => renderTasks(), 500));
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

    await fetch("/api/userdata/tasks/" + taskToDelete, { method: "DELETE" });

    taskToDelete = null;
    await renderTasks();
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
document.addEventListener("DOMContentLoaded", () => {
  tabs = document.querySelector("md-tabs");
  tabs.addEventListener("change", () => {
    const pgNames = ["summary", "tasks", "guides"];
    const name = pgNames[tabs.activeTabIndex];
    if (window.location.hash !== `#${name}`) window.location.hash = name;
  });

  initAccountListeners();
  initSettingsListeners();
  initTaskListeners();
  initGuideListeners();

  showPage();
});
