require("dotenv").config();

module.exports = {
  PORT: process.env.PORT || 3000,
  MONGO_URI: process.env.MONGO_URI || "mongodb://127.0.0.1:27017/todoApp",
  JWT_SECRET: process.env.JWT_SECRET || "dev_change_me",
};
