// Integration tests run against TEST_DATABASE_URL (a throw-away database). Without it they are skipped.
if (process.env.TEST_DATABASE_URL && process.env.TEST_DATABASE_URL !== "") {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  process.env.DEMO_MODE = "false";
}
