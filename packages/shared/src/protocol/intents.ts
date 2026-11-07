import { z } from "zod";
import { ITEM_IDS } from "../../../config/src/ids.ts";

/** Longest run one stroke may draw. The client stops the draft here too. */
export const MAX_PISTE_HEXES = 48;

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
  }),
  z.object({
    type: z.literal("upgrade"),
    entityId: z.string().min(2).max(48),
    key: UpgradeKeySchema,
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
    reason: z.string(),
    code: z.string(),
  }),
  z.object({
    type: z.literal("pong"),
    at: z.number(),
  }),
]);

export type ServerMessage = z.infer<typeof ServerMessageSchema>;
