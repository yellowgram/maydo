/** Read-mostly console. Replay execute is intentionally not a route. */
export const CONSOLE_ROUTES = [
  "GET /",
  "POST /login",
  "POST /logout",
  "GET /grants",
  "GET /webhooks",
  "GET /replay",
  "GET /audit",
  "GET /mapping",
  "POST /mapping/toggle",
  "GET /sticky",
  "GET /orphans",
] as const;
