import { z } from "zod";
import { ITEM_IDS } from "../../../config/src/ids.ts";

/** Longest run one stroke may draw. The client stops the draft here too. */
export const MAX_PISTE_HEXES = 48;

export const MatchOptionsPatchSchema = z
  .object({
    economy: z.enum(["shared", "roles", "duel"]),
    roleSplit: z.number().int().min(10).max(90),
    events: z.enum(["off", "first", "vote"]),
    secretGoals: z.boolean(),
    vips: z.boolean(),
    album: z.boolean(),
    research: z.boolean(),
    teamwork: z.boolean(),
  })
  .partial();

export const AxialSchema = z.object({
  q: z.number().int().min(-80).max(80),
  r: z.number().int().min(-80).max(80),
});

export const ItemIdSchema = z.enum(ITEM_IDS);

export const UpgradeKeySchema = z.enum(["speed", "cabins", "capacity"]);

export const IntentSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("place_building"),
    itemId: ItemIdSchema,
    q: z.number().int(),
    r: z.number().int(),
  }),
  z.object({
    type: z.literal("place_lift"),
    itemId: ItemIdSchema,
    a: AxialSchema,
    b: AxialSchema,
  }),
  z.object({
    type: z.literal("place_piste"),
    itemId: ItemIdSchema,
    hexes: z.array(AxialSchema).min(2).max(MAX_PISTE_HEXES),
    width: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
    name: z.string().trim().max(32).optional(),
  }),
  // Rename a run, or change its width (rebuilds the grooming, costs the difference).
  z.object({
    type: z.literal("edit_piste"),
    pisteId: z.string().min(2).max(48),
    name: z.string().trim().max(32).optional(),
    width: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
  }),
  z.object({
    type: z.literal("upgrade"),
    entityId: z.string().min(2).max(48),
    key: UpgradeKeySchema,
  }),
  z.object({
    type: z.literal("expand"),
    entityId: z.string().min(2).max(48),
  }),
  z.object({
    type: z.literal("free_play"),
  }),
  z.object({
    type: z.literal("undo"),
    entityId: z.string().min(2).max(48),
  }),
  z.object({
    type: z.literal("move_building"),
    entityId: z.string().min(2).max(48),
    q: z.number().int(),
    r: z.number().int(),
  }),
  // The village optimiser's proposal, applied at once so buildings can swap places.
  z.object({
    type: z.literal("rearrange"),
    moves: z
      .array(z.object({ entityId: z.string().min(2).max(48), q: z.number().int(), r: z.number().int() }))
      .min(1)
      .max(40),
  }),
  // Playing together: ask the other player before a big step.
  z.object({
    type: z.literal("propose"),
    title: z.string().trim().min(1).max(80),
    // Checked one by one against IntentSchema in the engine; nesting is refused.
    intents: z.array(z.record(z.string(), z.unknown())).min(1).max(16),
  }),
  // Accept or decline a proposal; the proposer declining withdraws it.
  z.object({
    type: z.literal("decide_proposal"),
    proposalId: z.string().min(2).max(48),
    accept: z.boolean(),
  }),
  // Above which cost actions become proposals (0 = never).
  z.object({
    type: z.literal("set_proposal_limit"),
    limit: z.number().int().min(0).max(10_000_000),
  }),
  z.object({
    type: z.literal("set_speed"),
    speed: z.union([z.literal(0), z.literal(1), z.literal(3)]),
  }),
  z.object({
    type: z.literal("name_lift"),
    entityId: z.string().min(2).max(48),
    name: z.string().trim().max(32),
  }),
  z.object({
    type: z.literal("demolish"),
    entityId: z.string().min(2).max(48),
  }),
  z.object({
    type: z.literal("claim_quest"),
    questId: z.string().min(1).max(16),
  }),
  z.object({
    type: z.literal("set_ticket_price"),
    chf: z.number().int(),
  }),
  z.object({
    type: z.literal("rename"),
    name: z.string().min(2).max(28),
  }),
  z.object({
    type: z.literal("next_tutorial"),
  }),
  z.object({
    type: z.literal("dismiss_tutorial"),
  }),
  // Start a match of the given length, or go back to free play. Either one
  // clears the valley; the client asks before sending it.
  z.object({
    type: z.literal("start_match"),
    preset: z.enum(["kurz", "normal", "lang", "sandbox"]),
    options: MatchOptionsPatchSchema.optional(),
  }),
  // Change the rules between rounds; applies from the next round on.
  z.object({
    type: z.literal("set_match_options"),
    options: MatchOptionsPatchSchema,
  }),
  // In "roles" mode: take the mountain or the valley.
  z.object({
    type: z.literal("choose_role"),
    role: z.enum(["berg", "tal"]),
  }),
  // Separate purses: hand money to the other role or player.
  z.object({
    type: z.literal("transfer_coins"),
    to: z.string().min(2).max(64),
    amount: z.number().int().min(1).max(10_000_000),
  }),
  // Research: start (or queue), cancel, and pledge support for an alliance node.
  z.object({
    type: z.literal("start_research"),
    nodeId: z.string().min(1).max(48),
  }),
  // Without a node: stop the running one (points go back). With one: take it out of the queue.
  z.object({
    type: z.literal("cancel_research"),
    nodeId: z.string().min(1).max(48).optional(),
  }),
  // "Mit Geld beschleunigen": buy a fixed package of points.
  z.object({
    type: z.literal("boost_research"),
  }),
  z.object({
    type: z.literal("pledge_research"),
    nodeId: z.string().min(1).max(48),
  }),
  // "I'm done with this round" — or, with ready false, "wait, not yet".
  z.object({
    type: z.literal("end_round"),
    ready: z.boolean(),
  }),
  z.object({
    type: z.literal("choose_event"),
    option: z.number().int().min(0).max(1),
  }),
]);

export type Intent = z.infer<typeof IntentSchema>;

export const ClientMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("join"),
    roomId: z.string().min(2).max(32).default("zermatt"),
    name: z.string().min(2).max(24),
    token: z.string().min(8).max(80).optional(),
  }),
  z.object({
    type: z.literal("intent"),
    id: z.string().min(1).max(48),
    intent: IntentSchema,
  }),
  z.object({
    type: z.literal("ping"),
    at: z.number(),
  }),
  // Where this player is pointing. Not an intent: it changes nobody's resort,
  // it only lets the other person see where the work is happening.
  z.object({
    type: z.literal("focus"),
    hex: AxialSchema.nullable(),
  }),
  // A line of team chat. Not an intent either: it changes nothing built.
  z.object({
    type: z.literal("chat"),
    text: z.string().trim().min(1).max(200),
  }),
  // "Look here": a marker on the map for the other player, gone after a while.
  z.object({
    type: z.literal("mark"),
    hex: AxialSchema,
    kind: z.enum(["look", "build", "warn"]),
  }),
  // Games and save points (runtime/saves.ts). Allowed before joining, so the
  // start screen can list them; `reqId` comes back on the reply.
  z.object({ type: z.literal("list_games"), reqId: z.string().max(40).optional() }),
  z.object({
    type: z.literal("create_game"),
    reqId: z.string().max(40).optional(),
    kind: z.enum(["shared", "own"]),
    name: z.string().max(60).optional(),
    /** Which map; unknown ids fall back to the classic valley. */
    region: z.string().max(32).optional(),
  }),
  z.object({
    type: z.literal("save_game"),
    reqId: z.string().max(40).optional(),
    /** Which game; the one this socket is in when left out. */
    gameId: z.string().min(2).max(40).optional(),
    name: z.string().max(80).optional(),
  }),
  z.object({ type: z.literal("load_save"), reqId: z.string().max(40).optional(), saveId: z.string().min(2).max(40) }),
  // A resort exported as a file, brought back as a new game.
  z.object({
    type: z.literal("import_game"),
    reqId: z.string().max(40).optional(),
    kind: z.enum(["shared", "own"]),
    name: z.string().max(60).optional(),
    snapshot: z.record(z.string(), z.unknown()),
  }),
  z.object({ type: z.literal("delete_save"), reqId: z.string().max(40).optional(), saveId: z.string().min(2).max(40) }),
]);

export type ClientMessage = z.infer<typeof ClientMessageSchema>;

export const ServerMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("welcome"),
    playerId: z.string(),
    token: z.string(),
    roomId: z.string(),
  }),
  z.object({
    type: z.literal("snapshot"),
    seq: z.number(),
    state: z.unknown(),
    players: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        role: z.enum(["builder", "visitor"]),
        lastSeen: z.number(),
        focus: AxialSchema.nullable().optional(),
        mark: z
          .object({ hex: AxialSchema, kind: z.enum(["look", "build", "warn"]), at: z.number() })
          .nullable()
          .optional(),
      }),
    ),
  }),
  z.object({
    type: z.literal("event"),
    title: z.string(),
    body: z.string(),
    kind: z.enum(["ok", "info", "warn"]),
    actorId: z.string().optional(),
    actorName: z.string().optional(),
  }),
  z.object({
    type: z.literal("error"),
    intentId: z.string().optional(),
    reqId: z.string().optional(),
    reason: z.string(),
    code: z.string(),
  }),
  z.object({
    type: z.literal("games"),
    reqId: z.string().optional(),
    games: z.array(z.unknown()),
  }),
  z.object({
    type: z.literal("created"),
    reqId: z.string().optional(),
    roomId: z.string(),
  }),
  z.object({
    type: z.literal("pong"),
    at: z.number(),
  }),
]);

export type ServerMessage = z.infer<typeof ServerMessageSchema>;
