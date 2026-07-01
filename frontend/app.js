// API Endpoints
async function getUserId() {
    const response = await fetch('/api/userdata/getUserId', {
        method: 'POST'
    })
    const data = await response.json()
    return data.userId
}

async function getTasks() {
    const response = await fetch('/api/userdata/tasks', {
        method: 'GET'
    }); 
    const data = await response.json();
    return data;
};

let taskToDelete = null

// Content Functions
async function renderTasks() {
    const taskData = await getTasks();
    const taskList = document.querySelector("#taskList");

            const filters = {
            notdone: document.querySelector('[label="Incomplete"]').selected,
            done: document.querySelector('[label="Completed"]').selected,
            canvas: document.querySelector('[label="Canvas"]').selected,
            local: document.querySelector('[label="Clutter"]').selected
        }

        const anyFilterActive = filters.notdone || filters.done || filters.local || filters.canvas
    
    taskList.innerHTML = ''
    for (let task of taskData) {

        if (anyFilterActive) {
            const matchesInProgress = filters.notdone && task.done === false
            const matchesCompleted = filters.done && task.done === true
            const matchesLocal = filters.local && !task.canvas
            const matchesCanvas = filters.canvas && task.canvas === true

            if (!matchesInProgress && !matchesCompleted && !matchesLocal && !matchesCanvas) continue
        }

        const renderedTask = 
            `<div class="card" data-id="${task.id}">
                <md-checkbox ${task.done ? 'checked' : ''}></md-checkbox>
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
            </div>`
        taskList.insertAdjacentHTML('beforeend', renderedTask);
    }
};

async function createNewTask() {
    if (isCreatingTask) return
    isCreatingTask = true

    try {
        await fetch('/api/userdata/tasks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
        })

        await renderTasks()
    } catch(err) {
        console.error('createNewTask error:', err)
    }

    isCreatingTask = false
}

async function sendNewTask() {
    const newTask = document.querySelector('#newTaskCard')
}

// Frontend
let tabs
let isCreatingTask = false

document.addEventListener("DOMContentLoaded", () => {
    tabs = document.querySelector('md-tabs')
    tabs.addEventListener('change', () => {
        let pgNames = ["summary", "tasks", "guides"]
        let active = tabs.activeTabIndex
        let name = pgNames[active]
        if (window.location.hash !== `#${name}`) {
            window.location.hash = name
        }
    })
    showPage()

        document.querySelector('#new-task-btn').addEventListener('click', () => {
            createNewTask()
        })

        document.querySelector('#taskList').addEventListener('click', (event) => {
        const deleteBtn = event.target.closest('.delete-btn')
        if (!deleteBtn) return

        const card = deleteBtn.closest('.card')
        taskToDelete = card.dataset.id

        document.querySelector('#delete-confirm').show()
    })

    document.querySelector('#delete-cancel').addEventListener('click', () => {
        document.querySelector('#delete-confirm').close()
        taskToDelete = null
    })

    document.querySelector('#delete-confirm-btn').addEventListener('click', async () => {
        if (!taskToDelete) return
        document.querySelector('#delete-confirm').close()
        
        await fetch('/api/userdata/tasks/' + taskToDelete, {
            method: 'DELETE'
        })

        taskToDelete = null
        await renderTasks()
    })
})

window.addEventListener('hashchange', showPage)

function showPage() {
    let hash = window.location.hash.replace('#', '');
    if (hash === '') {
        hash = 'summary'
        window.location.hash = 'summary'
    };
    
    let pages = document.querySelectorAll('.page');

    for (let page of pages) {
        page.classList.remove('active')
    }

    for (let page of pages) {
        if (page.id === hash) {
            page.classList.add('active');
        };
    };

    const pgNames = ["summary", "tasks", "guides"]
    tabs.activeTabIndex = pgNames.indexOf(hash)

    runPageScripts(hash)
}

async function runPageScripts(hash) {
    if (hash === 'tasks') {
        await renderTasks()
    };
}

let saveTimer

document.querySelector('#taskList').addEventListener('input', (event) => {
    const card = event.target.closest('.card')
    const taskId = card.dataset.id

    const taskUrl = '/api/userdata/tasks/' + taskId
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
        const field = event.target.dataset.field
        const value = event.target.value

        fetch(taskUrl, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ [field]: value })
        })
    }, 1000)
})

document.querySelector('#taskList').addEventListener('change', (event) => {
    if (event.target.tagName !== 'MD-CHECKBOX') return
    const card = event.target.closest('.card')
    const taskId = card.dataset.id

    fetch('/api/userdata/tasks/' + taskId, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ done: event.target.checked })
    })
})

document.querySelector('.content-area').addEventListener('click', (event) => {
    if (event.target.tagName !== 'MD-FILTER-CHIP') return
    setTimeout(() => renderTasks(), 50)
})