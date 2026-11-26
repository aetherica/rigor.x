// Node module hook: maps the one Cloudflare-only module the shared code imports
// ("cloudflare:workers", used by the OAuth library only for `instanceof WorkerEntrypoint` checks)
// to a local shim. Load with: node --import ./deploy/node/register.mjs ...
import { register } from "node:module";

register("./resolve-hook.mjs", import.meta.url);
