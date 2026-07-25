import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { StringEnum } from "@earendil-works/pi-ai";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";

const CONFIG_PATH = join(homedir(), ".pi/agent/extensions/kagi-websearch.json");
const DEFAULT_HOST = "https://kagi.com/api/v1";

interface Config {
  apiKey?: string;
  host?: string;
}

function loadConfig(): Config {
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, "utf-8")) as Config;
  } catch {
    return {};
  }
}

function saveConfig(cfg: Config): void {
  const dir = dirname(CONFIG_PATH);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2) + "\n");
}

let _config: Config | undefined;

function getConfig(): Config {
  if (!_config) _config = loadConfig();
  return _config;
}

function invalidateConfig(): void {
  _config = undefined;
}

function resolveKey(): string {
  const cfg = getConfig();
  const key = cfg.apiKey || process.env.KAGI_API_KEY;
  if (!key) {
    throw new Error(
      "No Kagi API key found. Create ~/.pi/agent/extensions/kagi-websearch.json with {\"apiKey\":\"...\"} or set KAGI_API_KEY."
    );
  }
  return key;
}

function resolveHost(): string {
  return getConfig().host || process.env.KAGI_API_HOST || DEFAULT_HOST;
}

function formatErrorBody(body: string): string {
  try {
    const parsed = JSON.parse(body);
    const errors = parsed.errors || [];
    return errors.map((e: any) => e.message).join("; ") || body;
  } catch {
    return body;
  }
}

function traceSuffix(headers: Headers): string {
  const trace = headers.get("x-kagi-trace");
  return trace ? ` (trace id: ${trace})` : "";
}

async function kagiSearch(params: Record<string, any>, signal?: AbortSignal): Promise<string> {
  const key = resolveKey();
  const host = resolveHost();

  if (params.time_relative && (params.after || params.before)) {
    throw new Error("'time_relative' is mutually exclusive with 'after'/'before'.");
  }

  const lensFields: Record<string, any> = {
    sites_included: params.include_domains ?? null,
    sites_excluded: params.exclude_domains ?? null,
    time_relative: params.time_relative ?? null,
    file_type: params.file_type ?? null,
  };
  const hasLensField = Object.values(lensFields).some((v) => v !== null);
  if (params.lens_id && hasLensField) {
    throw new Error(
      "'lens_id' is mutually exclusive with 'include_domains', 'exclude_domains', " +
        "'time_relative', and 'file_type'. Use one or the other."
    );
  }

  const body: Record<string, any> = {
    query: params.query,
    workflow: params.workflow || "search",
    format: "markdown",
    limit: params.limit ?? 10,
  };

  if (params.lens_id) body.lens_id = params.lens_id;

  const lens = Object.entries(lensFields).filter(([, v]) => v !== null);
  if (lens.length > 0) {
    body.lens = Object.fromEntries(lens);
  }

  if (params.after || params.before) {
    body.filters = {};
    if (params.after) body.filters.after = params.after;
    if (params.before) body.filters.before = params.before;
  }

  if (params.extract_count && params.extract_count > 0) {
    body.extract = { count: params.extract_count };
  }

  const res = await fetch(`${host}/search`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
    signal,
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Kagi Search API error (${res.status}): ${formatErrorBody(text)}${traceSuffix(res.headers)}`);
  }
  return text;
}

async function kagiExtract(params: Record<string, any>, signal?: AbortSignal): Promise<string> {
  const key = resolveKey();
  const host = resolveHost();

  const res = await fetch(`${host}/extract`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      pages: [{ url: params.url }],
      format: "json",
    }),
    signal,
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Kagi Extract API error (${res.status}): ${formatErrorBody(text)}${traceSuffix(res.headers)}`);
  }

  const parsed = JSON.parse(text);
  const pages = parsed.data;
  if (!pages || !pages[0] || !pages[0].markdown) {
    if (parsed.errors && parsed.errors.length > 0) {
      throw new Error(
        `Kagi Extract API error: ${parsed.errors.map((e: any) => e.message).join("; ")}${traceSuffix(res.headers)}`
      );
    }
    throw new Error(`Kagi Extract API returned no content.${traceSuffix(res.headers)}`);
  }
  return pages[0].markdown;
}

export default function (pi: ExtensionAPI) {
  pi.on("session_start", async (_event, ctx) => {
    if (!getConfig().apiKey && !process.env.KAGI_API_KEY) {
      ctx.ui.notify(
        "kagi-websearch: No API key found. Create ~/.pi/agent/extensions/kagi-websearch.json with {\"apiKey\":\"...\"} or set KAGI_API_KEY.",
        "warning"
      );
    }
  });

  pi.registerCommand("kagi-key", {
    description: "Set Kagi API key in config file",
    handler: async (_args, ctx) => {
      const key = await ctx.ui.input("Kagi API key:", "");
      if (!key) {
        ctx.ui.notify("No key entered.", "warning");
        return;
      }
      const cfg = loadConfig();
      cfg.apiKey = key;
      saveConfig(cfg);
      invalidateConfig();
      ctx.ui.notify("Kagi API key saved.", "info");
    },
  });

  pi.registerTool({
    name: "kagi_search",
    label: "Kagi Search",
    description: "Search the web using Kagi. Returns results as markdown.",
    promptSnippet: "Search the web using Kagi",
    promptGuidelines: ["Use kagi_search when the user asks for current information, facts, or web search results."],
    parameters: Type.Object({
      query: Type.String({ description: "A concise, keyword-focused search query" }),
      workflow: Type.Optional(StringEnum(["search", "news", "videos", "podcasts", "images"] as const)),
      extract_count: Type.Optional(Type.Integer({ description: "Number of top results to fetch full page content for", default: 0 })),
      limit: Type.Optional(Type.Integer({ description: "Max results per category", default: 10 })),
      include_domains: Type.Optional(Type.Array(Type.String(), { description: "Restrict results to these domains" })),
      exclude_domains: Type.Optional(Type.Array(Type.String(), { description: "Exclude results from these domains" })),
      time_relative: Type.Optional(StringEnum(["day", "week", "month"] as const)),
      after: Type.Optional(Type.String({ description: "ISO date YYYY-MM-DD" })),
      before: Type.Optional(Type.String({ description: "ISO date YYYY-MM-DD" })),
      file_type: Type.Optional(Type.String({ description: "File extension without dot, e.g. pdf" })),
      lens_id: Type.Optional(Type.String({ description: "Kagi lens ID (e.g. 2 for Academic, 15 for Programming)" })),
    }),
    async execute(_toolCallId, params, signal) {
      const text = await kagiSearch(params as Record<string, any>, signal);
      return { content: [{ type: "text", text }] };
    },
  });

  pi.registerTool({
    name: "kagi_extract",
    label: "Kagi Extract",
    description: "Extract a web page's full content as markdown using Kagi.",
    promptSnippet: "Extract full page content as markdown",
    promptGuidelines: ["Use kagi_extract when the user asks to read the full content of a specific URL."],
    parameters: Type.Object({
      url: Type.String({ description: "The HTTPS URL of the page to extract" }),
    }),
    async execute(_toolCallId, params, signal) {
      const text = await kagiExtract(params as Record<string, any>, signal);
      return { content: [{ type: "text", text }] };
    },
  });
}
