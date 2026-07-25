# pi-kagi-websearch

**Kagi web search and content extraction for Pi agent.** Bring your own Kagi API key.

## Install

```
pi install npm:pi-kagi-websearch
```

Requires a Kagi API key. Set `KAGI_API_KEY` or run `/kagi-key` after install.
See https://kagi.com/api for setting up your API key.

## Quick Start

```
// Search the web
kagi_search({ query: "TypeScript best practices" })

// Fetch full page content
kagi_extract({ url: "https://docs.example.com/guide" })

// Filter by time
kagi_search({ query: "rust news", time_relative: "week" })

// Restrict to specific domains
kagi_search({ query: "pi extensions", include_domains: ["pi.dev"] })
```

## Tools

### kagi_search

Search the web using Kagi. Returns results as markdown.

```
kagi_search({ query: "rust async programming" })
kagi_search({ query: "latest news", workflow: "news", time_relative: "day" })
kagi_search({ query: "academic paper", lens_id: "2" })
kagi_search({ query: "site:github.com", extract_count: 3 })
```

| Parameter | Description |
|-----------|-------------|
| query | Search query (concise, keyword-focused) |
| workflow | `search`, `news`, `videos`, `podcasts`, `images` (default: `search`) |
| limit | Max results per category (default: 10) |
| extract_count | Number of top results to fetch full page content for (default: 0) |
| include_domains | Restrict results to these domains |
| exclude_domains | Exclude results from these domains |
| time_relative | `day`, `week`, or `month` |
| after | ISO date `YYYY-MM-DD` (mutually exclusive with `time_relative`) |
| before | ISO date `YYYY-MM-DD` (mutually exclusive with `time_relative`) |
| file_type | File extension without dot, e.g. `pdf` |
| lens_id | Kagi lens ID (e.g. `2` for Academic, `15` for Programming) |

### kagi_extract

Extract a web page's full content as markdown using Kagi.

```
kagi_extract({ url: "https://example.com/article" })
```

| Parameter | Description |
|-----------|-------------|
| url | HTTPS URL of the page to extract |

## Commands

### /kagi-key

Set your Kagi API key interactively. Saves to `~/.pi/agent/extensions/kagi-websearch.json`.

```
/kagi-key
```

## Configuration

Config file: `~/.pi/agent/extensions/kagi-websearch.json`

```json
{
  "apiKey": "...",
  "host": "https://kagi.com/api/v1"
}
```

- `apiKey` — Kagi API key. Also accepts `KAGI_API_KEY` env var.
- `host` — Kagi API base URL. Also accepts `KAGI_API_HOST` env var. Defaults to `https://kagi.com/api/v1`.
