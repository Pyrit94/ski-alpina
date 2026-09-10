import { z } from "zod";
import { ITEM_IDS } from "../../../config/src/ids.ts";

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
    hexes: z.array(AxialSchema).min(2).max(48),
  }),
  z.object({
    type: z.literal("upgrade"),
    entityId: z.string().min(2).max(48),
    key: UpgradeKeySchema,
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
      }),
    ),
  }),
  z.object({
    type: z.literal("event"),
    title: z.string(),
    body: z.string(),
    kind: z.enum(["ok", "info", "warn"]),
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
