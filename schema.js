const mongoose = require("mongoose");

const todoSchema = new mongoose.Schema(
  {
    text:     { type: String, required: true, trim: true },
    done:     { type: Boolean, default: false },
    priority: { type: String, enum: ["high", "medium", "low"], default: "medium" },
  },
  { timestamps: true }
);

const Todo = mongoose.models.Todo || mongoose.model("Todo", todoSchema);

module.exports = { Todo };