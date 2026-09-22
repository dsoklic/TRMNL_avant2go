# Avant2Go Map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A TRMNL plugin that shows a map of Avant2Go locations, each labelled with the number of available cars of the user-selected models.

**Architecture:** Polling fetches the locations and cars from two URLs. A default-runtime JS transform reduces them to `{locations:[{lat,lng,n:{modelId:count}}]}`. `shared.liquid` embeds that data and the settings, builds a TRMNLMaps map, and puts a dot plus a count label on each location. The four layout files hold only the map container and the title bar.

**Tech Stack:** TRMNL framework 3.3.2, Liquid, TRMNLMaps + MapLibre GL JS 5.24.0, trmnlp (Docker) for local preview, Node for the transform test.

**Spec:** `docs/superpowers/specs/2026-09-22-avant2go-map-design.md`

## Global Constraints

- The map uses TRMNLMaps only: `preset: "streets"`, no `flyTo`/`easeTo`, the map is always built inside `TRMNLMaps.watch()`, and the OSM credit stays.
- MapLibre is loaded from `https://trmnl.com/js/maplibre-gl/5.24.0/` only.
- No custom styles. The one exception is inline `position/left/top/transform` on the count labels.
- Markup never uses a `view` wrapper. It starts with `<div class="layout">`, and `title_bar` is a sibling of it.
- Only cars with `status == "Free"` are counted. Locations with 0 cars show a hollow dot and "0".
- Zoom is clamped to 12–16. Refresh is every 15 minutes. Tiles are the default free OSM tiles.
- No emojis in markup.

## File map

| File | Responsibility |
|---|---|
| `src/transform.js` | API responses → `{locations}` or `{error}` |
| `test/transform.test.js` | assert-based check of the transform |
| `src/settings.yml` | polling URLs, refresh, custom fields |
| `.trmnlp.yml` | local custom field values for the preview |
| `src/shared.liquid` | map script, data embed, filtering by model, labels |
| `src/full.liquid`, `src/half_horizontal.liquid`, `src/half_vertical.liquid`, `src/quadrant.liquid` | map container, error message, title bar |

---

### Task 1: Transform

**Files:**
- Create: `src/transform.js`
- Test: `test/transform.test.js`

**Interfaces:**
- Consumes: `input.IDX_0` = the `/api/locations?limit=1000` response `{pagination, results:[…]}`. `input.IDX_1` = the `/api/cars` response: a bare array, which TRMNL may wrap as `{data:[…]}`.
- Produces: `transform(input) → { locations: [{ lat: number, lng: number, n: { [carModelID]: number } }] }`, or `{ error: string }`.

- [ ] **Step 1: Write the failing test**

`test/transform.test.js`:

```javascript
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node test/transform.test.js`
Expected: FAIL with `ENOENT` (there's no `src/transform.js` yet).

- [ ] **Step 3: Write the implementation**

`src/transform.js`:

```javascript
function transform(input) {
  function list(x) { return Array.isArray(x) ? x : x && (x.results || x.data); }
  var locs = list(input.IDX_0), cars = list(input.IDX_1);
  if (!Array.isArray(locs) || !Array.isArray(cars)) return { error: "Avant2Go data unavailable" };

  var byLoc = {};
  cars.forEach(function (c) {
    if (c.status !== "Free" || !c.locationID) return;
    var n = byLoc[c.locationID] = byLoc[c.locationID] || {};
    n[c.carModelID] = (n[c.carModelID] || 0) + 1;
  });

  return {
    locations: locs.filter(function (l) { return l.geoLocation; }).map(function (l) {
      return { lat: l.geoLocation.lat, lng: l.geoLocation.lng, n: byLoc[l._id] || {} };
    })
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node test/transform.test.js`
Expected: `ok`

- [ ] **Step 5: Check against live data**

Run:
```bash
node -e '
const fs=require("fs");const t=new Function(fs.readFileSync("src/transform.js","utf8")+"\nreturn transform;")();
Promise.all(["locations?limit=1000","cars"].map(p=>fetch("https://api.avant2go.com/api/"+p).then(r=>r.json())))
.then(([a,b])=>{const o=t({IDX_0:a,IDX_1:b});console.log(o.locations.length, JSON.stringify(o).length, o.locations.reduce((s,l)=>s+Object.values(l.n).reduce((x,y)=>x+y,0),0))})'
```
Expected: about 200 locations, a JSON length under 20000, and a total count close to the number of cars (about 370).

- [ ] **Step 6: Commit**

```bash
git add src/transform.js test/transform.test.js
git commit -m "Add locations/cars transform"
```

---

### Task 2: Settings and custom fields

**Files:**
- Modify: `src/settings.yml` (keys `polling_url`, `refresh_interval`, and a new `custom_fields`)
- Modify: `.trmnlp.yml` (`custom_fields`)

**Interfaces:**
- Produces: `trmnl.plugin_settings.custom_fields_values.{lat, lng, zoom, models}`. `models` is an array or a comma-separated string of `carModelID`s; empty means all models.

- [ ] **Step 1: Set the polling URL in `src/settings.yml`**

Replace `polling_url: ''` with:

```yaml
polling_url: |-
  https://api.avant2go.com/api/locations?limit=1000
  https://api.avant2go.com/api/cars
```

Keep `refresh_interval: 15`.

- [ ] **Step 2: Append the custom fields to `src/settings.yml`**

```yaml
custom_fields:
- keyname: lat
  field_type: string
  name: Latitude
  description: Map center latitude
  default: '46.0569'
- keyname: lng
  field_type: string
  name: Longitude
  description: Map center longitude
  default: '14.5058'
- keyname: zoom
  field_type: number
  name: Zoom
  description: 12 (city) to 16 (streets)
  min: 12
  max: 16
  default: 14
- keyname: models
  field_type: xhrSelect
  name: Car models
  description: Leave empty to count all models
  optional: true
  multiple: true
  remote:
    url: https://api.avant2go.com/api/carModels
    method: GET
    label_field: "{{ manufacturer }} {{ name }}"
    value_field: _id
```

- [ ] **Step 3: Set local preview values in `.trmnlp.yml`**

Replace `custom_fields: {}` with:

```yaml
custom_fields:
  lat: '46.0569'
  lng: '14.5058'
  zoom: 14
  models: ''
```

- [ ] **Step 4: Check that the YAML parses**

Run: `ruby -ryaml -e 'p YAML.load_file("src/settings.yml")["custom_fields"].size; p YAML.load_file("src/settings.yml")["polling_url"].lines.size; p YAML.load_file(".trmnlp.yml")["custom_fields"]'`
Expected: `4`, `2`, and the hash of values.

- [ ] **Step 5: Commit**

```bash
git add src/settings.yml .trmnlp.yml
git commit -m "Add polling URLs and custom fields"
```

---

### Task 3: Map and full layout

**Files:**
- Create: `src/shared.liquid`
- Create: `src/full.liquid`

**Interfaces:**
- Consumes: `locations` and `error` (from Task 1), and `trmnl.plugin_settings.custom_fields_values.*` (from Task 2).
- Produces: every layout provides `<div id="a2g-map" class="map stretch w--full">` and `<span id="a2g-total" class="instance">`, and `shared.liquid` fills both.

- [ ] **Step 1: Write `src/shared.liquid`**

```liquid
{% assign cf = trmnl.plugin_settings.custom_fields_values %}
<script src="https://trmnl.com/js/maplibre-gl/5.24.0/maplibre-gl.js"></script>
<link href="https://trmnl.com/js/maplibre-gl/5.24.0/maplibre-gl.css" rel="stylesheet">
<script>
  var A2G = {
    locations: {{ locations | json }} || [],
    models: {{ cf.models | json }},
    center: [{{ cf.lng | default: 14.5058 | plus: 0 }}, {{ cf.lat | default: 46.0569 | plus: 0 }}],
    zoom: Math.min(16, Math.max(12, {{ cf.zoom | default: 14 | plus: 0 }}))
  };
  // models may arrive as an array, a comma string, or null
  A2G.selected = [].concat(A2G.models || []).join(",").split(",").filter(Boolean);

  function a2gCount(n) {
    var ids = A2G.selected.length ? A2G.selected : Object.keys(n);
    return ids.reduce(function (s, id) { return s + (n[id] || 0); }, 0);
  }

  (function whenReady(cb) {
    var tries = 0;
    (function attempt() {
      if (window.TRMNLMaps && window.maplibregl && document.getElementById("a2g-map")) return cb();
      if (++tries > 200) return;
      setTimeout(attempt, 50);
    })();
  })(function () {
    var el = "a2g-map";
    TRMNLMaps.watch(el, function () {
      var map = new maplibregl.Map(TRMNLMaps.options({ el: el, preset: "streets", center: A2G.center, zoom: A2G.zoom }));
      map.on("load", function () {
        var box = map.getContainer(), w = box.clientWidth, h = box.clientHeight, total = 0;
        box.querySelectorAll(".a2g-count").forEach(function (x) { x.remove(); }); // watch() rebuilds reuse the container
        A2G.locations.forEach(function (l, i) {
          var p = map.project([l.lng, l.lat]);
          if (p.x < 0 || p.y < 0 || p.x > w || p.y > h) return;
          var c = a2gCount(l.n);
          total += c;
          TRMNLMaps.dot(map, [l.lng, l.lat], { el: el, id: "loc" + i, radius: 4, hollow: c === 0 });
          var tag = document.createElement("span");
          tag.className = "a2g-count label label--small label--filled";
          tag.textContent = c;
          // ponytail: framework has no map text labels; inline position is the only way to pin one to a point
          tag.style.cssText = "position:absolute;left:" + p.x + "px;top:" + p.y + "px;transform:translate(-50%,-140%)";
          box.appendChild(tag);
        });
        var t = document.getElementById("a2g-total");
        if (t) t.textContent = total + " available";
      });
      return map;
    });
  });
</script>
```

- [ ] **Step 2: Write `src/full.liquid`**

```liquid
<div class="layout layout--col">
  {% if error %}
    <span class="title">{{ error }}</span>
  {% else %}
    <div id="a2g-map" class="map stretch w--full"></div>
  {% endif %}
</div>
<div class="title_bar">
  <span class="title">Avant2Go</span>
  <span id="a2g-total" class="instance"></span>
</div>
```

- [ ] **Step 3: Start the preview**

Run (in the background): `docker run --pull always --publish 4567:4567 --volume "$(pwd):/plugin" trmnl/trmnlp serve --bind 0.0.0.0`
Open `http://localhost:4567`.

- [ ] **Step 4: Check the data shape**

In the preview's data/variables panel, check that `locations` exists (about 200 entries), each entry has an `n` object, and there's no `error`.
If `locations` is missing, trmnlp's transform may expect serverless `run(input)`. Set `transform_runtime` in `.trmnlp.yml` according to the trmnlp README (`https://github.com/usetrmnl/trmnlp`) rather than changing `transform.js`.
If `error` is set, dump `input` with the schema-inspector transform from the template guide (§2) to see what `IDX_0`/`IDX_1` look like, then fix `list()` in `transform.js` and add that shape as another assertion in the test.

- [ ] **Step 5: Check the full render**

Take a screenshot of the full layout. Check that:
- the map is centered on Ljubljana at zoom 14
- dots have count labels above them
- 0-count locations have hollow dots
- the title bar shows "N available"
- the OSM credit is visible
- there's no console error

Set `models` in `.trmnlp.yml` to one ID from `curl -s https://api.avant2go.com/api/carModels | node -e 'JSON.parse(require("fs").readFileSync(0)).forEach(m=>console.log(m._id,m.manufacturer,m.name))'` and check that the counts drop. Set `zoom: 20` and check that it renders at zoom 16.

- [ ] **Step 6: Commit**

```bash
git add src/shared.liquid src/full.liquid
git commit -m "Add map with per-location counts (full layout)"
```

---

### Task 4: Half and quadrant layouts

**Files:**
- Create: `src/half_horizontal.liquid`, `src/half_vertical.liquid`, `src/quadrant.liquid`

**Interfaces:**
- Consumes: the `a2g-map` and `a2g-total` ids from Task 3.

- [ ] **Step 1: Write the three files with identical content**

The contents of `src/half_horizontal.liquid`, `src/half_vertical.liquid` and `src/quadrant.liquid`:

```liquid
<div class="layout layout--col">
  {% if error %}
    <span class="title">{{ error }}</span>
  {% else %}
    <div id="a2g-map" class="map stretch w--full"></div>
  {% endif %}
</div>
<div class="title_bar">
  <span class="title">Avant2Go</span>
  <span id="a2g-total" class="instance"></span>
</div>
```

- [ ] **Step 2: Check each layout in the preview**

Take a screenshot of each layout. Check that:
- the map fills the view with no overflow
- labels outside the view are skipped
- the title bar is visible

If labels crowd the quadrant, that's the accepted limitation in spec open question 6; don't add clustering.

- [ ] **Step 3: Commit**

```bash
git add src/half_horizontal.liquid src/half_vertical.liquid src/quadrant.liquid
git commit -m "Add half and quadrant layouts"
```

---

### Task 5: Verify on TRMNL (open questions 1–4)

These can only be answered on trmnl.com. The user pushes the plugin, because `trmnlp push` needs their login.

- [ ] **Step 1: The user runs** `trmnlp login` and then `trmnlp push` (or the Docker equivalent), from the repo root.
- [ ] **Step 2: Check the model picker** in the plugin settings on trmnl.com:
  - Does the Car models dropdown list "Manufacturer Name" entries?
  - Does it allow picking several?
  - If it doesn't list anything, add `response_path: ''` or remove `remote:` in favour of `endpoint:`.
  - If it allows only one pick, fall back to `field_type: select` with `multiple: true` and `options` generated with: `curl -s https://api.avant2go.com/api/carModels | node -e 'JSON.parse(require("fs").readFileSync(0)).forEach(m=>console.log(`    - "${m.manufacturer} ${m.name}: ${m._id}"`))'`.
- [ ] **Step 3: Check the polling logs** (plugin settings → logs) for payload-size errors on `/api/cars`, and check that the merge variables show `locations`.
- [ ] **Step 4: Check the rendered device screenshot** with two models selected.
- [ ] **Step 5: Commit** any fallback changes: `git commit -am "Adjust model picker for TRMNL"`.
