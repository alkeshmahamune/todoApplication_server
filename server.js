require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { connectDB } = require("./db");
const { PORT, JWT_SECRET } = require("./env");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { Todo, User } = require("./schema");

const app = express();
app.use(express.json());
app.use(cors());

// simple request logger for debugging
app.use((req, res, next) => {
  console.log(`-> ${req.method} ${req.originalUrl}`);
  next();
});

const apiBase = "/api/todos";

// --- Auth middleware
function authMiddleware(req, res, next) {
  const auth = req.headers.authorization && req.headers.authorization.split(" ")[1];
  if (!auth) return res.status(401).json({ success: false, message: "Unauthorized" });
  try {
    const payload = jwt.verify(auth, JWT_SECRET);
    req.userId = payload.id;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: "Invalid token" });
  }
}

// --- Auth routes
app.post("/api/auth/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!email || !password) return res.status(400).json({ success: false, message: "Email and password required" });

    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ success: false, message: "Email already registered" });

    const hashed = await bcrypt.hash(password, 10);
    const user = await User.create({ name, email, password: hashed });
    const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: "7d" });
    res.status(201).json({ success: true, token, user: { id: user._id, name: user.name, email: user.email } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ success: false, message: "Email and password required" });

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ success: false, message: "Invalid credentials" });

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(400).json({ success: false, message: "Invalid credentials" });

    const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: "7d" });
    res.json({ success: true, token, user: { id: user._id, name: user.name, email: user.email } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get("/api/auth/me", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select("_id name email");
    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

async function startServer() {
  await connectDB();
  app.listen(PORT, () => {
    console.log(`>> Server running on http://localhost:${PORT}`);
  });
}

app.get(apiBase, authMiddleware, async (req, res) => {
  try {
    const filter = req.query.filter || "all";
    const query = filter === "active" ? { done: false } : filter === "done" ? { done: true } : {};

    const ownerQuery = { ...query, owner: req.userId };
    const [data, total, completed] = await Promise.all([
      Todo.find(ownerQuery).sort({ createdAt: -1 }),
      Todo.countDocuments({ owner: req.userId }),
      Todo.countDocuments({ owner: req.userId, done: true }),
    ]);

    res.json({ success: true, total, completed, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post(apiBase, authMiddleware, async (req, res) => {
  try {
    const { text, priority = "medium" } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({ success: false, message: "Text is required" });
    }

    const todo = await Todo.create({ owner: req.userId, text: text.trim(), priority });
    res.status(201).json({ success: true, data: todo });
  } catch (err) {
    if (err.name === "ValidationError") {
      return res.status(400).json({ success: false, message: err.message });
    }
    res.status(500).json({ success: false, message: err.message });
  }
});

app.put(`${apiBase}/:id`, authMiddleware, async (req, res) => {
  try {
    const { text, done, priority } = req.body;
    const updates = {};

    if (text !== undefined) {
      if (!text.trim()) {
        return res.status(400).json({ success: false, message: "Text cannot be empty" });
      }
      updates.text = text.trim();
    }

    if (done !== undefined) {
      updates.done = Boolean(done);
    }

    if (priority !== undefined) {
      updates.priority = priority;
    }

    const todo = await Todo.findOneAndUpdate(
      { _id: req.params.id, owner: req.userId },
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (!todo) {
      return res.status(404).json({ success: false, message: "Todo not found" });
    }

    res.json({ success: true, data: todo });
  } catch (err) {
    if (err.name === "ValidationError" || err.name === "CastError") {
      return res.status(400).json({ success: false, message: err.message });
    }
    res.status(500).json({ success: false, message: err.message });
  }
});

app.delete(`${apiBase}/completed`, authMiddleware, async (req, res) => {
  try {
    const result = await Todo.deleteMany({ done: true, owner: req.userId });
    res.json({ success: true, removed: result.deletedCount });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.delete(`${apiBase}/:id`, authMiddleware, async (req, res) => {
  try {
    const todo = await Todo.findOneAndDelete({ _id: req.params.id, owner: req.userId });

    if (!todo) {
      return res.status(404).json({ success: false, message: "Todo not found" });
    }

    res.json({ success: true, data: todo });
  } catch (err) {
    if (err.name === "CastError") {
      return res.status(400).json({ success: false, message: "Invalid id format" });
    }
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get("/api/health", (req, res) => {
  res.json({ success: true, status: "ok" });
});

app.use((req, res) => {
  res.status(404).json({ success: false, message: "Route not found" });
});

startServer().catch((err) => {
  console.error("Server failed to start:", err.message);
  process.exit(1);
});