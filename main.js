// imports
const express = require('express');
const app = express();
app.use(express.json());
app.use('/node_modules', express.static('node_modules'));
app.use(express.static('frontend'));
const crypto = require('crypto')
// require('dotenv').config();

function genId() {
    return crypto.randomBytes(4).toString('hex')
}

// userdata management
const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { encrypt } = require('./utils/crypto');

function requireAuth(req, res, next) {
    const userEmail = req.headers['x-forwarded-email'];
    
    if (!userEmail) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    
    req.userEmail = userEmail;
    next();
}


app.use('/api/userdata', requireAuth)

// Helper functions (before routes)
async function getUser(userEmail) {
    const indexPath = path.join(__dirname, 'userdata', 'index.json');
    let index = {};
    try {
        const data = await fs.readFile(indexPath, 'utf8');
        index = JSON.parse(data);
    } catch (err) {
        index = {};
    }

    if (!index[userEmail]) {
        await initUser(userEmail);
        // Re-read index since we just added to it
        const data = await fs.readFile(indexPath, 'utf8');
        index = JSON.parse(data);
    }

    return index[userEmail];
}

async function initUser(userEmail) {
    const indexPath = path.join(__dirname, 'userdata', 'index.json');
    let index = {};
    try {
        const data = await fs.readFile(indexPath, 'utf8');
        index = JSON.parse(data);
    } catch (err) {
        index = {};
    }

    const userId = uuidv4();
    index[userEmail] = userId;

    await fs.writeFile(indexPath, JSON.stringify(index, null, 2), 'utf8');

    const userFolder = path.join(__dirname, 'userdata', userId);
    await fs.mkdir(userFolder, { recursive: true });

    await fs.writeFile(path.join(userFolder, 'tasks.json'), JSON.stringify([], null, 2), 'utf8');
    await fs.writeFile(path.join(userFolder, 'guides.json'), JSON.stringify([], null, 2), 'utf8');
    await fs.writeFile(path.join(userFolder, 'settings.json'), JSON.stringify({}, null, 2), 'utf8');

    return userId;
}

// Userdata API
app.post('/api/userdata/getUserId', async (req, res) => {
  const userEmail = req.userEmail;
  const userId = await getUser(userEmail);
  res.json({ userId });
});

// Tasks API
app.get('/api/userdata/tasks', async (req, res) => {
    // Get user generated task
    const userEmail = req.userEmail;
    const userId = await getUser(userEmail);
    
    const tasksPath = path.join(__dirname, 'userdata', userId, 'tasks.json');
    const data = await fs.readFile(tasksPath, 'utf8');
    const tasks = JSON.parse(data);
    
    res.json(tasks);
});

app.post('/api/userdata/tasks', async (req, res) => {
    // Upload new user task
    const userEmail = req.userEmail;
    const userId = await getUser(userEmail);

    const tasksPath = path.join(__dirname, 'userdata', userId, 'tasks.json');
    const data = await fs.readFile(tasksPath, 'utf8');
    const tasks = JSON.parse(data);

    const newTask = {
        id: genId(),
        title: req.body.title || '',
        done: req.body.done || false,
        due: req.body.due || null,
    };
    
    tasks.push(newTask)
    await fs.writeFile(tasksPath, JSON.stringify(tasks, null, 2), 'utf8');

    res.json({ status: 'ok', id: newTask.id })
});

app.patch('/api/userdata/tasks/:id', async (req, res) => {
        const userEmail = req.userEmail;
        const userId = await getUser(userEmail);
        const tasksPath = path.join(__dirname, 'userdata', userId, 'tasks.json');

        const data = await fs.readFile(tasksPath, 'utf8');
        const tasks = JSON.parse(data);

        const taskId = req.params.id
        const taskIndex = tasks.findIndex(t => t.id === taskId)

        if (taskIndex === -1) {
            return res.status(404).json({ error: 'Task not found' })
        };
        
        tasks[taskIndex] = { ...tasks[taskIndex], ...req.body };
        await fs.writeFile(tasksPath, JSON.stringify(tasks, null, 2), 'utf8')
        return res.json({status:'ok'})
})

app.delete('/api/userdata/tasks/:id', async (req, res)=> {
    const userEmail = req.userEmail;
    const userId = await getUser(userEmail);
    const tasksPath = path.join(__dirname, 'userdata', userId, 'tasks.json');

    const data = await fs.readFile(tasksPath, 'utf8');
    const tasks = JSON.parse(data);

    const taskId = req.params.id
    const taskIndex = tasks.findIndex(t => t.id === taskId)

    if (taskIndex === -1) {
        return res.status(404).json({ error: 'Task not found' })
    };
        
    const updatedTasks = tasks.filter(t => t.id !== taskId)
    await fs.writeFile(tasksPath, JSON.stringify(updatedTasks, null, 2), 'utf8')
    return res.json({status:'ok'})
})

// Guides API
app.get('/api/userdata/guides', async (req, res) => {
    // Get user guides
    const userEmail = req.userEmail;
    const userId = await getUser(userEmail);
    
    const guidesPath = path.join(__dirname, 'userdata', userId, 'guides.json');
    const data = await fs.readFile(guidesPath, 'utf8');
    const guides = JSON.parse(data);
    
    res.json(guides);
});

app.post('/api/userdata/guides', async (req, res) => {
    const userEmail = req.userEmail;
    const userId = await getUser(userEmail);

    const guidesPath = path.join(__dirname, 'userdata', userId, 'guides.json');
    const guides = req.body; // The entire guides structure
    
    await fs.writeFile(guidesPath, JSON.stringify(guides, null, 2), 'utf8');

    res.json({ status: 'ok' });
});

app.listen(4000, () => {
  console.log('Server running on port 4000');
});