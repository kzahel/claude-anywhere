import { Hono } from "hono";
import { health } from "./routes/health.js";

export const app = new Hono();

app.route("/health", health);
