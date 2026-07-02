// IMPORTS & SETUP

const express = require("express");
const app = express();
const crypto = require("crypto");
const fs = require("fs").promises;
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const { encrypt, decrypt } = require("./utils/crypto");

require("dotenv").config();

app.use(express.json());
app.use("/node_modules", express.static("node_modules"));
app.use(express.static("frontend"));

// HELPERS

function genId() {
  return crypto.randomBytes(4).toString("hex");
}

function requireAuth(req, res, next) {
  const userEmail = req.headers["x-forwarded-email"];
  if (!userEmail) return res.status(401).json({ error: "Unauthorized" });
  req.userEmail = userEmail;
  next();
}

async function getUser(userEmail) {
  const indexPath = path.join(__dirname, "userdata", "index.json");
  let index = {};
  try {
    const data = await fs.readFile(indexPath, "utf8");
    index = JSON.parse(data);
  } catch (err) {
    index = {};
  }

  if (!index[userEmail]) {
    await initUser(userEmail);
    const data = await fs.readFile(indexPath, "utf8");
    index = JSON.parse(data);
  }

  return index[userEmail];
}

async function initUser(userEmail) {
  const indexPath = path.join(__dirname, "userdata", "index.json");
  let index = {};
  try {
    const data = await fs.readFile(indexPath, "utf8");
    index = JSON.parse(data);
  } catch (err) {
    index = {};
  }

  const userId = uuidv4();
  index[userEmail] = userId;

  await fs.writeFile(indexPath, JSON.stringify(index, null, 2), "utf8");

  const userFolder = path.join(__dirname, "userdata", userId);
  await fs.mkdir(userFolder, { recursive: true });

  await fs.writeFile(
    path.join(userFolder, "tasks.json"),
    JSON.stringify([], null, 2),
    "utf8",
  );
  await fs.writeFile(
    path.join(userFolder, "guides.json"),
    JSON.stringify([], null, 2),
    "utf8",
  );
  await fs.writeFile(
    path.join(userFolder, "settings.json"),
    JSON.stringify(
      {
        email: userEmail,
        nickname: "Clutter User",
        theme: "light",
        defaultFilters: {
          undone: true,
          done: false,
          canvas: true,
          clutter: true,
        },
        canvas: {
          apiKey: "1392e7e9be5cc750fd768ed03d6dcf46",
          iv: "9ba9e05536b1c6d165e577ae3f8e8e45",
        },
      },
      null,
      2,
    ),
    "utf8",
  );

  return userId;
}

app.use("/api/userdata", requireAuth);

// SETTINGS API

app.post("/api/userdata/getUserId", async (req, res) => {
  const userId = await getUser(req.userEmail);
  res.json({ userId });
});

app.get("/api/userdata/settings", async (req, res) => {
  try {
    const userId = await getUser(req.userEmail);
    const settingsPath = path.join(
      __dirname,
      "userdata",
      userId,
      "settings.json",
    );
    const prefs = JSON.parse(await fs.readFile(settingsPath, "utf8"));

    const key = Buffer.from(process.env.ENCRYPTION_KEY, "hex");
    const canvasAPIKey = decrypt(prefs.canvas.apiKey, prefs.canvas.iv, key);

    res.json({ ...prefs, canvas: { apiKey: canvasAPIKey } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.patch("/api/userdata/settings", async (req, res) => {
  try {
    const userId = await getUser(req.userEmail);
    const settingsPath = path.join(
      __dirname,
      "userdata",
      userId,
      "settings.json",
    );
    const prefs = JSON.parse(await fs.readFile(settingsPath, "utf8"));

    if (req.body.canvas?.apiKey) {
      const key = Buffer.from(process.env.ENCRYPTION_KEY, "hex");
      const { encrypted, iv } = encrypt(req.body.canvas.apiKey, key);
      req.body.canvas.apiKey = encrypted;
      req.body.canvas.iv = iv;
    }

    const newPrefs = {
      ...prefs,
      ...req.body,
      canvas: { ...prefs.canvas, ...req.body.canvas },
      defaultFilters: { ...prefs.defaultFilters, ...req.body.defaultFilters },
    };

    await fs.writeFile(settingsPath, JSON.stringify(newPrefs, null, 2), "utf8");
    res.json({ status: "ok" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// TASKS API

app.get("/api/userdata/tasks", async (req, res) => {
  const userId = await getUser(req.userEmail);
  const tasksPath = path.join(__dirname, "userdata", userId, "tasks.json");
  const tasks = JSON.parse(await fs.readFile(tasksPath, "utf8"));
  res.json(tasks);
});

app.post("/api/userdata/tasks", async (req, res) => {
  const userId = await getUser(req.userEmail);
  const tasksPath = path.join(__dirname, "userdata", userId, "tasks.json");
  const tasks = JSON.parse(await fs.readFile(tasksPath, "utf8"));

  const newTask = {
    id: genId(),
    title: req.body.title || "",
    done: req.body.done || false,
    due: req.body.due || null,
  };

  tasks.push(newTask);
  await fs.writeFile(tasksPath, JSON.stringify(tasks, null, 2), "utf8");
  res.json({ status: "ok", id: newTask.id });
});

app.patch("/api/userdata/tasks/:id", async (req, res) => {
  const userId = await getUser(req.userEmail);
  const tasksPath = path.join(__dirname, "userdata", userId, "tasks.json");
  const tasks = JSON.parse(await fs.readFile(tasksPath, "utf8"));

  const taskIndex = tasks.findIndex((t) => t.id === req.params.id);
  if (taskIndex === -1)
    return res.status(404).json({ error: "Task not found" });

  tasks[taskIndex] = { ...tasks[taskIndex], ...req.body };
  await fs.writeFile(tasksPath, JSON.stringify(tasks, null, 2), "utf8");
  res.json({ status: "ok" });
});

app.delete("/api/userdata/tasks/:id", async (req, res) => {
  const userId = await getUser(req.userEmail);
  const tasksPath = path.join(__dirname, "userdata", userId, "tasks.json");
  const tasks = JSON.parse(await fs.readFile(tasksPath, "utf8"));

  const taskIndex = tasks.findIndex((t) => t.id === req.params.id);
  if (taskIndex === -1)
    return res.status(404).json({ error: "Task not found" });

  const updatedTasks = tasks.filter((t) => t.id !== req.params.id);
  await fs.writeFile(tasksPath, JSON.stringify(updatedTasks, null, 2), "utf8");
  res.json({ status: "ok" });
});

// GUIDES API
app.get("/api/userdata/guides", async (req, res) => {
  const userId = await getUser(req.userEmail);
  const guidesPath = path.join(__dirname, "userdata", userId, "guides.json");
  const guides = JSON.parse(await fs.readFile(guidesPath, "utf8"));

  res.json(guides);
});

app.post("/api/userdata/guides", async (req, res) => {
  const userId = await getUser(req.userEmail);
  const guidesPath = path.join(__dirname, "userdata", userId, "guides.json");
  const guides = JSON.parse(await fs.readFile(guidesPath, "utf8"));

  const newGuide = {
    id: genId(),
    title: "",
    archived: false,
    milestones: [],
  };

  guides.push(newGuide);
  await fs.writeFile(guidesPath, JSON.stringify(guides, null, 2), "utf8");
  res.json({ status: "ok", id: newGuide.id });
});

app.patch("/api/userdata/guides/:id", async (req, res) => {
  const userId = await getUser(req.userEmail);
  const guidesPath = path.join(__dirname, "userdata", userId, "guides.json");
  const guides = JSON.parse(await fs.readFile(guidesPath, "utf8"));

  const guideIndex = guides.findIndex((t) => t.id === req.params.id);
  if (guideIndex === -1)
    return res.status(404).json({ error: "Guide not found" });

  const allowedFields = ["title", "archived"];
  const hasInvalidFields = Object.keys(req.body).some(
    (key) => !allowedFields.includes(key),
  );
  if (hasInvalidFields)
    return res.status(400).json({ error: "Invalid fields" });

  guides[guideIndex] = { ...guides[guideIndex], ...req.body };
  await fs.writeFile(guidesPath, JSON.stringify(guides, null, 2), "utf8");
  res.json({ status: "ok" });
});

app.delete("/api/userdata/guides/:id", async (req, res) => {
  const userId = await getUser(req.userEmail);
  const guidesPath = path.join(__dirname, "userdata", userId, "guides.json");
  const guides = JSON.parse(await fs.readFile(guidesPath, "utf8"));

  const guideIndex = guides.findIndex((t) => t.id === req.params.id);
  if (guideIndex === -1)
    return res.status(404).json({ error: "Guide not found" });

  const updatedGuides = guides.filter((t) => t.id !== req.params.id);
  await fs.writeFile(
    guidesPath,
    JSON.stringify(updatedGuides, null, 2),
    "utf8",
  );
  res.json({ status: "ok" });
});

// guide milestone apis
app.post("/api/userdata/guides/:id/milestones", async (req, res) => {
  const userId = await getUser(req.userEmail);
  const guidesPath = path.join(__dirname, "userdata", userId, "guides.json");
  const guides = JSON.parse(await fs.readFile(guidesPath, "utf8"));

  const guideIndex = guides.findIndex((t) => t.id === req.params.id);
  if (guideIndex === -1)
    return res.status(404).json({ error: "Guide not found" });

  const newMS = {
    id: genId(),
    title: "",
    tasks: [],
  };

  guides[guideIndex].milestones.push(newMS);
  await fs.writeFile(guidesPath, JSON.stringify(guides, null, 2), "utf8");
  res.json({ status: "ok", id: newMS.id });
});

app.patch("/api/userdata/guides/:gid/milestones/:msid", async (req, res) => {
  const userId = await getUser(req.userEmail);
  const guidesPath = path.join(__dirname, "userdata", userId, "guides.json");
  const guides = JSON.parse(await fs.readFile(guidesPath, "utf8"));

  const guideIndex = guides.findIndex((g) => g.id === req.params.gid);
  if (guideIndex === -1)
    return res.status(404).json({ error: "Guide not found" });

  const guide = guides[guideIndex];
  const msIndex = guide.milestones.findIndex((m) => m.id === req.params.msid);
  if (msIndex === -1)
    return res.status(404).json({ error: "Milestone not found" });

  const newMS = { ...guide.milestones[msIndex], ...req.body };

  guides[guideIndex].milestones[msIndex] = newMS;
  await fs.writeFile(guidesPath, JSON.stringify(guides, null, 2), "utf8");
  res.json({ status: "ok" });
});

app.delete("/api/userdata/guides/:gid/milestones/:msid", async (req, res) => {
  const userId = await getUser(req.userEmail);
  const guidesPath = path.join(__dirname, "userdata", userId, "guides.json");
  const guides = JSON.parse(await fs.readFile(guidesPath, "utf8"));

  const guideIndex = guides.findIndex((g) => g.id === req.params.gid);
  if (guideIndex === -1)
    return res.status(404).json({ error: "Guide not found" });

  const guide = guides[guideIndex];
  const msIndex = guide.milestones.findIndex((m) => m.id === req.params.msid);
  if (msIndex === -1)
    return res.status(404).json({ error: "Milestone not found" });

  guide.milestones = guide.milestones.filter((m) => m.id !== req.params.msid);
  await fs.writeFile(guidesPath, JSON.stringify(guides, null, 2), "utf8");
  res.json({ status: "ok" });
});

// START
app.listen(4000, () => {
  console.log("Server running on port 4000");
});
