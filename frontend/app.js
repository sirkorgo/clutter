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

    taskData.sort((a, b) => {
        if (!a.due) return 1   // no due date → push to bottom
        if (!b.due) return -1  // no due date → push to bottom
        return new Date(a.due) - new Date(b.due)  // earlier date first
    })

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
            // Layer 1: type
            const typeFilterActive = filters.canvas || filters.local
            if (typeFilterActive) {
                const matchesType = (filters.local && !task.canvas) || (filters.canvas && task.canvas)
                if (!matchesType) continue
            }

            // Layer 2: status
            const statusFilterActive = filters.notdone || filters.done
            if (statusFilterActive) {
                const matchesStatus = (filters.notdone && !task.done) || (filters.done && task.done)
                if (!matchesStatus) continue
            }
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
    getSettings().then(settings => {
        document.querySelector('#account-info div').innerHTML = 
            `${settings.nickname}<br><small>${settings.email}</small>`
    })

    document.querySelector('#account-btn').addEventListener('click', () => {
        const menu = document.querySelector('#account-menu')
        menu.open = !menu.open
    })

    const nickname = document.querySelector('#settings-nickname') 
    const email = document.querySelector('#settings-email')
    const theme = document.querySelector('#settings-theme')
    const taskFilters = {
        undone: document.querySelector('#pref-undone'), 
        done: document.querySelector('#pref-done'), 
        clutter: document.querySelector('#pref-clutter'),
        canvas: document.querySelector('#pref-canvas')
    }
    const pref_canvas_key = document.querySelector('pref-canvas-key')

    document.querySelector('#settings-btn').addEventListener('click', () => {
        document.querySelector('#settings-modal').show()
        const settings = getSettings()
        nickname.attributes.value = settings.name


    })

    document.querySelector('#settings-close').addEventListener('click', () => {
        document.querySelector('#settings-modal').close()
    })

    document.querySelector('#signout-btn').addEventListener('click', () => {
        window.location.href = '/oauth2/sign_out'
    })

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
        const settings = await getSettings()
        const filters = settings.defaultFilters

        document.querySelector('[label="Incomplete"]').selected = filters.incomplete
        document.querySelector('[label="Completed"]').selected = filters.completed
        document.querySelector('[label="Canvas"]').selected = filters.canvas
        document.querySelector('[label="Clutter"]').selected = filters.clutter

        await renderTasks()
    };
}

async function getSettings() {
    const response = await fetch('/api/userdata/settings')
    const data = await response.json()
    return data
}

let saveTimer

document.querySelector('#taskList').addEventListener('focusout', (event) => {
    if (!event.target.dataset.field) return
    const card = event.target.closest('.card')
    if (!card) return
    const taskId = card.dataset.id
    const field = event.target.dataset.field
    const value = event.target.value

    fetch('/api/userdata/tasks/' + taskId, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value })
    }).then(() => renderTasks())
})

document.querySelector('#taskList').addEventListener('change', (event) => {
    if (event.target.tagName !== 'MD-CHECKBOX') return
    const card = event.target.closest('.card')
    const taskId = card.dataset.id

fetch('/api/userdata/tasks/' + taskId, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ done: event.target.checked })
}).then(() => setTimeout(() => renderTasks(), 500))
})

document.querySelector('.content-area').addEventListener('click', (event) => {
    if (event.target.tagName !== 'MD-FILTER-CHIP') return
    setTimeout(() => renderTasks(), 50)
})

async function getSettings() {
    const res = await fetch('/api/userdata/settings')
    const data = await res.json()
    return data

}