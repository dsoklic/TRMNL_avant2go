// Run: node test/transform.test.js
const assert = require("assert");
const fs = require("fs");
const transform = new Function(fs.readFileSync(__dirname + "/../src/transform.js", "utf8") + "\nreturn transform;")();

const M1 = "56bdca9c91a36ac61cb11227";
const M2 = "56bdca9c91a36ac61cb11228";

const locations = { pagination: {}, results: [
  { _id: "L1", geoLocation: { lat: 46.1, lng: 14.5 } },
  { _id: "L2", geoLocation: { lat: 46.2, lng: 14.6 } },
  { _id: "L3" }, // no geoLocation -> dropped
  { _id: "L4", geoLocation: { lat: "oops", lng: 14.7 } } // non-numeric lat -> dropped
] };
const cars = [
  { locationID: "L1", carModelID: M1, status: "Free" },
  { locationID: "L1", carModelID: M1, status: "Free" },
  { locationID: "L1", carModelID: M2, status: "Free" },
  { locationID: "L1", carModelID: M2, status: "Reserved" }, // not counted
  { locationID: null, carModelID: M1, status: "Free" },      // not at a location
  { locationID: "L1", carModelID: "</script>", status: "Free" }, // bad id -> not counted
  { locationID: "L1", status: "Free" }                        // missing id -> not counted
];

const expected = { locations: [
  { lat: 46.1, lng: 14.5, n: {} },
  { lat: 46.2, lng: 14.6, n: {} }
] };
expected.locations[0].n[M1] = 2;
expected.locations[0].n[M2] = 1;

assert.deepStrictEqual(transform({ IDX_0: locations, IDX_1: cars }), expected);
assert.deepStrictEqual(transform({ IDX_0: locations, IDX_1: { data: cars } }), expected); // wrapped array
assert.deepStrictEqual(transform({ IDX_0: locations.results, IDX_1: cars }), expected);   // bare locations
assert.deepStrictEqual(transform({ IDX_0: { data: locations }, IDX_1: cars }), expected);  // doubly-wrapped locations
assert.ok(transform({}).error);
assert.ok(transform({ IDX_0: "oops", IDX_1: cars }).error);
console.log("ok");
