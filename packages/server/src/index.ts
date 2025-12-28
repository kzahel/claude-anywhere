import { serve } from "@hono/node-server";
import { app } from "./app.js";

const port = Number.parseInt(process.env.PORT || "3400");

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Server running at http://localhost:${info.port}`);
});
