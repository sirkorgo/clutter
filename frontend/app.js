
// API

async function getUserId() {
    const response = await fetch('/api/userdata/getUserId', { method: 'POST' })
    const data = await response.json()
    return data.userId
}

async function getSettings() {
    const response = await fetch('/api/userdata/settings')
    const data = await response.json()
    return data
}

async function getTasks() {
    const response = await fetch('/api/userdata/tasks', { method: 'GET' })
    const data = await response.json()
    return data
}



// TASKS

async function renderTasks() {
    const taskData = await getTasks()

    taskData.sort((a, b) => {
        if (!a.due) return 1
        if (!b.due) return -1
        return new Date(a.due) - new Date(b.due)
    })

    const taskList = document.querySelector('#taskList')

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
            const typeFilterActive = filters.canvas || filters.local
            if (typeFilterActive) {
                const matchesType = (filters.local && !task.canvas) || (filters.canvas && task.canvas)
                if (!matchesType) continue
            }

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
        taskList.insertAdjacentHTML('beforeend', renderedTask)
    }
}

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
    } catch (err) {
        console.error('createNewTask error:', err)
    }

    isCreatingTask = false
}



// NAVIGATION

let tabs
let isCreatingTask = false

function showPage() {
    let hash = window.location.hash.replace('#', '')
    if (hash === '') {
        hash = 'summary'
        window.location.hash = 'summary'
    }

    const pages = document.querySelectorAll('.page')
    for (let page of pages) page.classList.remove('active')
    for (let page of pages) {
        if (page.id === hash) page.classList.add('active')
    }

    const pgNames = ['summary', 'tasks', 'guides']
    tabs.activeTabIndex = pgNames.indexOf(hash)

    runPageScripts(hash)
}

async function runPageScripts(hash) {
    if (hash === 'tasks') {
        const settings = await getSettings()
        const filters = settings.defaultFilters

        document.querySelector('[label="Incomplete"]').selected = filters.undone
        document.querySelector('[label="Completed"]').selected = filters.done
        document.querySelector('[label="Canvas"]').selected = filters.canvas
        document.querySelector('[label="Clutter"]').selected = filters.clutter

        await renderTasks()
    }
}

window.addEventListener('hashchange', showPage)



// INIT

let taskToDelete = null

document.addEventListener('DOMContentLoaded', () => {

    // Account info
    getSettings().then(settings => {
        document.querySelector('#account-info div').innerHTML =
            `${settings.nickname}<br><small>${settings.email}</small>`
    })

    // Account menu
    document.querySelector('#account-btn').addEventListener('click', () => {
        const menu = document.querySelector('#account-menu')
        menu.open = !menu.open
    })

    // Sign out
    document.querySelector('#signout-btn').addEventListener('click', () => {
        window.location.href = '/oauth2/sign_out'
    })

    // Tabs
    tabs = document.querySelector('md-tabs')
    tabs.addEventListener('change', () => {
        const pgNames = ['summary', 'tasks', 'guides']
        const name = pgNames[tabs.activeTabIndex]
        if (window.location.hash !== `#${name}`) window.location.hash = name
    })

    // Settings modal — open
    document.querySelector('#settings-btn').addEventListener('click', () => {
        getSettings().then(settings => {
            document.querySelector('#settings-nickname').value = settings.nickname
            document.querySelector('#settings-email').value = settings.email
            document.querySelector('#settings-theme').selected = settings.theme === 'dark'
            document.querySelector('#pref-canvas-key').value = settings.canvas.apiKey

            document.querySelector('#pref-undone').selected = settings.defaultFilters.undone === true
            document.querySelector('#pref-done').selected = settings.defaultFilters.done === true
            document.querySelector('#pref-canvas').selected = settings.defaultFilters.canvas === true
            document.querySelector('#pref-clutter').selected = settings.defaultFilters.clutter === true

            document.querySelector('#settings-modal').show()
        })
    })

    // Settings modal — close
    document.querySelector('#settings-close').addEventListener('click', () => {
        document.querySelector('#settings-modal').close()
    })

    // Settings — canvas key visibility toggle
    document.querySelector('#toggle-canvas-key').addEventListener('click', () => {
        const key = document.querySelector('#pref-canvas-key')
        key.type = key.type === 'password' ? 'text' : 'password'
    })

    // Settings — text field save on blur
    document.querySelector('#settings-modal').addEventListener('focusout', (event) => {
        if (event.target.tagName !== 'MD-OUTLINED-TEXT-FIELD' || event.target.id === 'settings-email') return

        const field = event.target.dataset.field
        const value = event.target.value

        const body = field === 'canvas.apiKey'
            ? { canvas: { apiKey: value } }
            : { [field]: value }

        fetch('/api/userdata/settings', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        })
    })

    // Settings — theme toggle save
    document.querySelector('#settings-modal').addEventListener('change', (event) => {
        if (event.target.tagName !== 'MD-SWITCH') return

        fetch('/api/userdata/settings', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ theme: event.target.selected ? 'dark' : 'light' })
        })
    })

    // Settings — filter chip save
    document.querySelector('#settings-modal').addEventListener('click', (event) => {
        if (event.target.tagName !== 'MD-FILTER-CHIP') return

        const field = event.target.dataset.field
        const value = event.target.selected

        fetch('/api/userdata/settings', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ defaultFilters: { [field]: value } })
        })
    })

    // Tasks — new task
    document.querySelector('#new-task-btn').addEventListener('click', () => {
        createNewTask()
    })

    // Tasks — filter chips
    document.querySelector('.content-area').addEventListener('click', (event) => {
        if (event.target.tagName !== 'MD-FILTER-CHIP') return
        setTimeout(() => renderTasks(), 50)
    })

    // Tasks — edit field on blur
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

    // Tasks — checkbox toggle
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

    // Tasks — delete button
    document.querySelector('#taskList').addEventListener('click', (event) => {
        const deleteBtn = event.target.closest('.delete-btn')
        if (!deleteBtn) return

        const card = deleteBtn.closest('.card')
        taskToDelete = card.dataset.id
        document.querySelector('#delete-confirm').show()
    })

    // Tasks — delete confirm/cancel
    document.querySelector('#delete-cancel').addEventListener('click', () => {
        document.querySelector('#delete-confirm').close()
        taskToDelete = null
    })

    document.querySelector('#delete-confirm-btn').addEventListener('click', async () => {
        if (!taskToDelete) return
        document.querySelector('#delete-confirm').close()

        await fetch('/api/userdata/tasks/' + taskToDelete, { method: 'DELETE' })

        taskToDelete = null
        await renderTasks()
    })

    showPage()
})