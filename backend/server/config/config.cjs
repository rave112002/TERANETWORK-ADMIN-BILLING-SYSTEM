// server/config/config.cjs
const mysql2 = require("mysql2");
require("dotenv/config");
module.exports = {
  development: {
    username: process.env.DB_USER || "root",
    password: process.env.DB_PASS || null,
    database: process.env.DB_DATABASE || "app_development",
    host: process.env.DB_HOST || "127.0.0.1",
    dialect: "mysql",
    timezone: "+00:00",
    useUTC: true,
    dialectOptions: {
      timezone: "Z",
      dateStrings: false,
    },
    dialectModule: mysql2,
  },
  test: {
    username: process.env.DB_USER || "root",
    password: process.env.DB_PASS || null,
    database: process.env.DB_DATABASE || "app_test",
    host: process.env.DB_HOST || "127.0.0.1",
    dialect: "mysql",
    timezone: "+00:00",
    useUTC: true,
    dialectOptions: {
      timezone: "Z",
      dateStrings: false,
    },
    dialectModule: mysql2,
  },
  production: {
    username: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_DATABASE,
    host: process.env.DB_HOST,
    dialect: "mysql",
    timezone: "+00:00",
    useUTC: true,
    dialectOptions: {
      timezone: "Z",
      dateStrings: false,
    },
    dialectModule: mysql2,
  },
};
