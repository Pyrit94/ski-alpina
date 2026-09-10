import assert from "node:assert/strict";
import { test } from "node:test";
import { FlowNetwork, UNCAPPED } from "./maxflow.ts";

test("a single chain is limited by its narrowest edge", () => {
  const net = new FlowNetwork(4);
  net.addEdge(0, 1, 900);
  const narrow = net.addEdge(1, 2, 300);
  net.addEdge(2, 3, 900);
  assert.equal(net.maxFlow(0, 3), 300);
  assert.equal(net.flowOn(narrow), 300);
});

test("parallel routes add up", () => {
  const net = new FlowNetwork(4);
  net.addEdge(0, 1, 500);
  net.addEdge(0, 2, 400);
  net.addEdge(1, 3, 500);
  net.addEdge(2, 3, 400);
  assert.equal(net.maxFlow(0, 3), 900);
});

test("an unreachable sink carries nothing", () => {
  // The disconnected-lift case: capacity exists but no path does.
  const net = new FlowNetwork(4);
  const stranded = net.addEdge(1, 2, 2400);
  assert.equal(net.maxFlow(0, 3), 0);
  assert.equal(net.flowOn(stranded), 0);
});

test("flow is conserved at every intermediate node", () => {
  const net = new FlowNetwork(6);
  net.addEdge(0, 1, 1000);
  const a = net.addEdge(1, 2, 600);
  const b = net.addEdge(1, 3, 600);
  const c = net.addEdge(2, 4, 600);
  const d = net.addEdge(3, 4, 200);
  net.addEdge(4, 5, 1000);
  const total = net.maxFlow(0, 5);
  assert.equal(total, 800);
  assert.equal(net.flowOn(a), net.flowOn(c));
  assert.equal(net.flowOn(b), net.flowOn(d));
});

test("the classic augmenting-path trap still finds the optimum", () => {
  // Greedy routing through the middle edge would stop at 1.
  const net = new FlowNetwork(4);
  net.addEdge(0, 1, 1000);
  net.addEdge(0, 2, 1000);
  net.addEdge(1, 2, 1);
  net.addEdge(1, 3, 1000);
  net.addEdge(2, 3, 1000);
  assert.equal(net.maxFlow(0, 3), 2000);
});

test("a pure cycle off the source-sink path carries no flow", () => {
  // Skiers lapping a lift must not invent throughput out of nothing.
  const net = new FlowNetwork(5);
  net.addEdge(0, 1, 100);
  net.addEdge(1, 4, 100);
  const loopUp = net.addEdge(2, 3, 900);
  const loopDown = net.addEdge(3, 2, 900);
  assert.equal(net.maxFlow(0, 4), 100);
  assert.equal(net.flowOn(loopUp), 0);
  assert.equal(net.flowOn(loopDown), 0);
});

test("uncapped edges never become the bottleneck", () => {
  const net = new FlowNetwork(3);
  net.addEdge(0, 1, UNCAPPED);
  net.addEdge(1, 2, 1800);
  assert.equal(net.maxFlow(0, 2), 1800);
});

test("solving twice in a row is idempotent", () => {
  const net = new FlowNetwork(3);
  net.addEdge(0, 1, 700);
  net.addEdge(1, 2, 700);
  assert.equal(net.maxFlow(0, 2), 700);
  // The residual graph is saturated, so a second solve adds nothing.
  assert.equal(net.maxFlow(0, 2), 0);
});
