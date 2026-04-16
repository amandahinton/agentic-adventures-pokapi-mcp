#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const BASE = "https://pokeapi.co/api/v2";
const UA = "pokeapi-mcp/0.1 (+https://pokeapi.co)";

const cache = new Map();
async function fetchJson(path) {
  if (cache.has(path)) return cache.get(path);
  const res = await fetch(`${BASE}${path}`, { headers: { "User-Agent": UA } });
  if (!res.ok) {
    throw new Error(`PokeAPI ${res.status} ${res.statusText} for ${path}`);
  }
  const data = await res.json();
  cache.set(path, data);
  return data;
}

const slug = (v) => String(v).trim().toLowerCase().replace(/\s+/g, "-");

function summarizePokemon(p) {
  return {
    id: p.id,
    name: p.name,
    height_dm: p.height,
    weight_hg: p.weight,
    base_experience: p.base_experience,
    types: p.types.map((t) => t.type.name),
    abilities: p.abilities.map((a) => ({
      name: a.ability.name,
      is_hidden: a.is_hidden,
    })),
    stats: Object.fromEntries(p.stats.map((s) => [s.stat.name, s.base_stat])),
    sprite: p.sprites?.front_default ?? null,
    species: p.species?.name ?? null,
  };
}

function summarizeSpecies(s) {
  const enEntry = s.flavor_text_entries.find((e) => e.language.name === "en");
  return {
    id: s.id,
    name: s.name,
    generation: s.generation?.name,
    is_legendary: s.is_legendary,
    is_mythical: s.is_mythical,
    habitat: s.habitat?.name ?? null,
    color: s.color?.name ?? null,
    evolution_chain_url: s.evolution_chain?.url ?? null,
    flavor_text: enEntry
      ? enEntry.flavor_text.replace(/\s+/g, " ").trim()
      : null,
  };
}

function summarizeType(t) {
  const rel = t.damage_relations;
  const names = (arr) => arr.map((x) => x.name);
  return {
    id: t.id,
    name: t.name,
    double_damage_to: names(rel.double_damage_to),
    half_damage_to: names(rel.half_damage_to),
    no_damage_to: names(rel.no_damage_to),
    double_damage_from: names(rel.double_damage_from),
    half_damage_from: names(rel.half_damage_from),
    no_damage_from: names(rel.no_damage_from),
  };
}

function summarizeMove(m) {
  const enEffect = m.effect_entries.find((e) => e.language.name === "en");
  return {
    id: m.id,
    name: m.name,
    type: m.type?.name,
    damage_class: m.damage_class?.name,
    power: m.power,
    accuracy: m.accuracy,
    pp: m.pp,
    priority: m.priority,
    effect: enEffect
      ? enEffect.short_effect.replace("$effect_chance", m.effect_chance ?? "")
      : null,
  };
}

function summarizeAbility(a) {
  const enEffect = a.effect_entries.find((e) => e.language.name === "en");
  return {
    id: a.id,
    name: a.name,
    is_main_series: a.is_main_series,
    generation: a.generation?.name,
    effect: enEffect ? enEffect.short_effect : null,
    pokemon_count: a.pokemon?.length ?? 0,
  };
}

const tools = [
  {
    name: "get_pokemon",
    description:
      "Look up a Pokémon by name or Pokédex ID. Returns types, abilities, base stats, and sprite URL.",
    inputSchema: {
      type: "object",
      properties: {
        name_or_id: {
          type: "string",
          description: "Pokémon name (e.g. 'pikachu') or numeric ID.",
        },
      },
      required: ["name_or_id"],
    },
    handler: async ({ name_or_id }) =>
      summarizePokemon(await fetchJson(`/pokemon/${slug(name_or_id)}`)),
  },
  {
    name: "get_species",
    description:
      "Look up Pokémon species info: flavor text, generation, legendary/mythical flags, evolution chain URL.",
    inputSchema: {
      type: "object",
      properties: {
        name_or_id: { type: "string" },
      },
      required: ["name_or_id"],
    },
    handler: async ({ name_or_id }) =>
      summarizeSpecies(await fetchJson(`/pokemon-species/${slug(name_or_id)}`)),
  },
  {
    name: "get_type",
    description:
      "Get a type's damage relations (what it's strong/weak against).",
    inputSchema: {
      type: "object",
      properties: {
        name_or_id: {
          type: "string",
          description: "Type name like 'fire', 'water', 'ghost'.",
        },
      },
      required: ["name_or_id"],
    },
    handler: async ({ name_or_id }) =>
      summarizeType(await fetchJson(`/type/${slug(name_or_id)}`)),
  },
  {
    name: "get_move",
    description: "Get move details: type, power, accuracy, PP, effect.",
    inputSchema: {
      type: "object",
      properties: {
        name_or_id: { type: "string" },
      },
      required: ["name_or_id"],
    },
    handler: async ({ name_or_id }) =>
      summarizeMove(await fetchJson(`/move/${slug(name_or_id)}`)),
  },
  {
    name: "get_ability",
    description: "Get ability details and effect description.",
    inputSchema: {
      type: "object",
      properties: {
        name_or_id: { type: "string" },
      },
      required: ["name_or_id"],
    },
    handler: async ({ name_or_id }) =>
      summarizeAbility(await fetchJson(`/ability/${slug(name_or_id)}`)),
  },
  {
    name: "get_evolution_chain",
    description:
      "Fetch an evolution chain by ID or URL (as returned by get_species).",
    inputSchema: {
      type: "object",
      properties: {
        id_or_url: {
          type: "string",
          description: "Numeric chain ID or a full evolution-chain URL.",
        },
      },
      required: ["id_or_url"],
    },
    handler: async ({ id_or_url }) => {
      const s = String(id_or_url);
      const path = s.startsWith("http")
        ? new URL(s).pathname.replace("/api/v2", "")
        : `/evolution-chain/${slug(s)}`;
      const data = await fetchJson(path);
      const flatten = (node) => ({
        name: node.species.name,
        evolves_to: node.evolves_to.map(flatten),
      });
      return { id: data.id, chain: flatten(data.chain) };
    },
  },
  {
    name: "list_pokemon",
    description: "Paginated listing of Pokémon names and URLs.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", default: 20, minimum: 1, maximum: 200 },
        offset: { type: "number", default: 0, minimum: 0 },
      },
    },
    handler: async ({ limit = 20, offset = 0 }) => {
      const data = await fetchJson(`/pokemon?limit=${limit}&offset=${offset}`);
      return {
        count: data.count,
        next_offset: data.next ? offset + limit : null,
        results: data.results.map((r) => r.name),
      };
    },
  },
];

const toolMap = new Map(tools.map((t) => [t.name, t]));

const server = new Server(
  { name: "pokeapi-mcp", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: tools.map(({ name, description, inputSchema }) => ({
    name,
    description,
    inputSchema,
  })),
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const tool = toolMap.get(req.params.name);
  if (!tool) {
    return {
      isError: true,
      content: [{ type: "text", text: `Unknown tool: ${req.params.name}` }],
    };
  }
  try {
    const result = await tool.handler(req.params.arguments ?? {});
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  } catch (err) {
    return {
      isError: true,
      content: [{ type: "text", text: `${err.message ?? err}` }],
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
