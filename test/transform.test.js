// Run: node test/transform.test.js
const assert = require("assert");
const fs = require("fs");
const transform = new Function(fs.readFileSync(__dirname + "/../src/transform.js", "utf8") + "\nreturn transform;")();

const locations = { pagination: {}, results: [
  { _id: "L1", geoLocation: { lat: 46.1, lng: 14.5 } },
  { _id: "L2", geoLocation: { lat: 46.2, lng: 14.6 } },
  { _id: "L3" } // no geoLocation -> dropped
] };
const cars = [
  { locationID: "L1", carModelID: "M1", status: "Free" },
  { locationID: "L1", carModelID: "M1", status: "Free" },
  { locationID: "L1", carModelID: "M2", status: "Free" },
  { locationID: "L1", carModelID: "M2", status: "Reserved" }, // not counted
  { locationID: null, carModelID: "M1", status: "Free" }       // not at a location
];

const expected = { locations: [
  { lat: 46.1, lng: 14.5, n: { M1: 2, M2: 1 } },
  { lat: 46.2, lng: 14.6, n: {} }
] };

assert.deepStrictEqual(transform({ IDX_0: locations, IDX_1: cars }), expected);
assert.deepStrictEqual(transform({ IDX_0: locations, IDX_1: { data: cars } }), expected); // wrapped array
assert.deepStrictEqual(transform({ IDX_0: locations.results, IDX_1: cars }), expected);   // bare locations
assert.ok(transform({}).error);
assert.ok(transform({ IDX_0: "oops", IDX_1: cars }).error);
console.log("ok");
