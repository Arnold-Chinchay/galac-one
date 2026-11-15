import { test } from "node:test";
import assert from "node:assert/strict";
import { skyVerdict, spotVerdict } from "../src/consensus.js";

test("too few people or too little weight stays open", () => {
  assert.equal(spotVerdict({ moving: 1 }, 2).status, "open");
  assert.equal(skyVerdict({ red: 0.3, star: 0.3, glare: 0.3 }, 3).status, "open");
});
test("a clear weighted majority decides; reliable people count more", () => {
  assert.deepEqual(spotVerdict({ moving: 1.5, artifact: 0.5 }, 3), { status: "lead", label: "moving", share: 0.75 });
  assert.equal(spotVerdict({ artifact: 2, moving: 0.5 }, 3).status, "rejected");
  // two unreliable "moving" answers lose to one very reliable "glitch" plus one more
  assert.equal(spotVerdict({ moving: 0.4, artifact: 1.7 }, 4).status, "rejected");
  assert.equal(spotVerdict({ unsure: 2, moving: 0.5 }, 3).status, "open");
});
test("sky: every kind of no counts together against a red dot", () => {
  assert.equal(skyVerdict({ red: 1.6, star: 0.5 }, 4).status, "lead");
  assert.equal(skyVerdict({ red: 0.5, star: 0.6, glare: 0.7 }, 4).status, "rejected");
  assert.equal(skyVerdict({ red: 1, glare: 1 }, 4).status, "open");
});
