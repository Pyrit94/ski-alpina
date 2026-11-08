import assert from "node:assert/strict";
import { test } from "node:test";
import { inviteUrl, parseInvite, withoutInvite } from "./invite.ts";

test("an invitation link names the game on the start page", () => {
  assert.equal(inviteUrl("https://ski.example.ch", "g_abc123"), "https://ski.example.ch/?spiel=g_abc123");
  assert.equal(inviteUrl("http://127.0.0.1:8098", "own_x-1"), "http://127.0.0.1:8098/?spiel=own_x-1");
});

test("the link is read back to the same game", () => {
  for (const id of ["g_abc123", "own_lq3k9abcd1", "zermatt"]) {
    assert.equal(parseInvite(inviteUrl("https://ski.example.ch", id)), id);
  }
  assert.equal(parseInvite("https://ski.example.ch/?foo=1&spiel=g_1a2b#x"), "g_1a2b");
});

test("anything that is not a game id is ignored", () => {
  assert.equal(parseInvite("https://ski.example.ch/"), null);
  assert.equal(parseInvite("https://ski.example.ch/?spiel="), null);
  assert.equal(parseInvite("https://ski.example.ch/?spiel=%3Cscript%3E"), null);
  assert.equal(parseInvite("https://ski.example.ch/?spiel=../../etc"), null);
  assert.equal(parseInvite(`https://ski.example.ch/?spiel=${"a".repeat(41)}`), null);
  assert.equal(parseInvite("not a url"), null);
});

test("after following it, the address is clean but keeps everything else", () => {
  assert.equal(withoutInvite("https://ski.example.ch/?spiel=g_1"), "/");
  assert.equal(withoutInvite("https://ski.example.ch/?a=1&spiel=g_1&b=2#top"), "/?a=1&b=2#top");
});
