import { startServer } from "../src/web/server";

startServer().catch((err) => {
  console.error(err);
  process.exit(1);
});
