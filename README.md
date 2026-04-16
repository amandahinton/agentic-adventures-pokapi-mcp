# agentic-adventures-pokeapi-mcp

An MCP server that exposes [PokeAPI](https://pokeapi.co) as tools.

## Tools

- `get_pokemon` — types, abilities, base stats, sprite
- `get_species` — flavor text, generation, legendary flags, evolution-chain URL
- `get_type` — damage relations (strengths/weaknesses)
- `get_move` — power, accuracy, PP, effect
- `get_ability` — effect text
- `get_evolution_chain` — flattened evolution tree (by ID or URL)
- `list_pokemon` — paginated name listing

Responses are summarized (not the raw PokeAPI payloads) to keep them small.

## Run

```sh
cd pokeapi-mcp
npm install
npm start
```

## Configure in VS Code `mcp.json`

```json
{
  "mcpServers": {
    "pokeapi": {
      "command": "node",
      "args": ["THE PATH TO index.js"]
    }
  }
}
```

Requires Node 18+ (uses global `fetch`). No API key needed.

To add the mcp run something like this with your path
```
claude mcp add pokeapi -- node <PATH TO index.js>
```
Add -s user (or -s project) before -- to change scope from the default local.
