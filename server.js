require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { connectDB } = require("./db");
const { PORT } = require("./env");
const { Todo } = require("./schema");

const app = express();
app.use(express.json());
app.use(cors());

const apiBase = "/api/todos";

async function startServer() {
  await connectDB();
  app.listen(PORT, () => {
    console.log(`>> Server running on http://localhost:${PORT}`);
  });
}

app.get(apiBase, async (req, res) => {
  try {
    const filter = req.query.filter || "all";
    const query = filter === "active" ? { done: false } : filter === "done" ? { done: true } : {};

    const [data, total, completed] = await Promise.all([
      Todo.find(query).sort({ createdAt: -1 }),
      Todo.countDocuments(),
      Todo.countDocuments({ done: true }),
    ]);

    res.json({ success: true, total, completed, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post(apiBase, async (req, res) => {
  try {
    const { text, priority = "medium" } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({ success: false, message: "Text is required" });
    }

    const todo = await Todo.create({ text: text.trim(), priority });
    res.status(201).json({ success: true, data: todo });
  } catch (err) {
    if (err.name === "ValidationError") {
      return res.status(400).json({ success: false, message: err.message });
    }
    res.status(500).json({ success: false, message: err.message });
  }
});

app.put(`${apiBase}/:id`, async (req, res) => {
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

    const todo = await Todo.findByIdAndUpdate(req.params.id, { $set: updates }, {
      new: true,
      runValidators: true,
    });

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

app.delete(`${apiBase}/completed`, async (req, res) => {
  try {
    const result = await Todo.deleteMany({ done: true });
    res.json({ success: true, removed: result.deletedCount });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.delete(`${apiBase}/:id`, async (req, res) => {
  try {
    const todo = await Todo.findByIdAndDelete(req.params.id);

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