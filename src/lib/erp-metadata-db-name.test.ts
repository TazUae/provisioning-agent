import test from "node:test";
import assert from "node:assert/strict";
import { extractDbNameFromMetadata } from "./erp-metadata-db-name.js";

test("extractDbNameFromMetadata prefers db_name over dbName", () => {
  assert.equal(
    extractDbNameFromMetadata({ db_name: "_snake", dbName: "_camel" }),
    "_snake"
  );
});

test("extractDbNameFromMetadata falls back to dbName when db_name missing", () => {
  assert.equal(extractDbNameFromMetadata({ dbName: "_legacy" }), "_legacy");
});

test("extractDbNameFromMetadata falls back to dbName when db_name empty after trim", () => {
  assert.equal(extractDbNameFromMetadata({ db_name: "   ", dbName: "_legacy" }), "_legacy");
});

test("extractDbNameFromMetadata returns undefined when neither key is usable", () => {
  assert.equal(extractDbNameFromMetadata({}), undefined);
  assert.equal(extractDbNameFromMetadata(undefined), undefined);
});
