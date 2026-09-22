# Avant2Go map plugin — design

Map of Avant2Go locations showing the number of **available** cars of user-selected models at each location.

## Data

- `GET https://api.avant2go.com/api/locations?limit=1000` — all locations (200), `geoLocation {lat,lng}`. With `limit` the response is wrapped: `{pagination, …}`; the default page size otherwise truncates.
- `GET https://api.avant2go.com/api/cars` — undocumented, ~370 cars, ~680 KB. Each car has `carModelID`, `locationID`, `status`. Locations have no per-model breakdown, so this endpoint is required.
- `GET https://api.avant2go.com/api/carModels` — 41 models (`_id`, `manufacturer`, `name`). Used only by the model picker.

## Settings (`src/settings.yml`)

- `strategy: polling`, `polling_verb: get`, `refresh_interval: 15` (minutes).
- `polling_url`: the locations and cars URLs, one per line (multi-URL → `IDX_0`, `IDX_1`).
- Custom fields:
  - `lat` (string, default `46.0569`), `lng` (string, default `14.5058`) — map center.
  - `zoom` (number, `min: 12`, `max: 16`, default `14`). The cap prevents unreadable label pile-ups.
  - `models` — `xhrSelect`, `multiple: true`, `remote:` block: `url` = carModels, `method: GET`, `label_field: "{{ manufacturer }} {{ name }}"`, `value_field: _id`. If empty, all models count.

## Transform (`src/transform.js`, default runtime)

`transform(input)` takes `IDX_0` (locations) and `IDX_1` (cars) and returns:

```json
{ "locations": [{ "lat": 46.07, "lng": 14.51, "n": { "<carModelID>": 2 } }] }
```

- Only cars with `status == "Free"` are counted.
- Every location is included, even with an empty `n`, so empty locations can render "0".
- If either input is missing or malformed, it returns `{ "error": "…" }`.

The model filter is applied in the markup, not the transform, so the transform doesn't depend on the settings.

## Markup

- `src/shared.liquid`:
  - MapLibre script and CSS from `trmnl.com/js/maplibre-gl/5.24.0/`.
  - A `whenReady` helper, then `TRMNLMaps.watch` building `TRMNLMaps.options({ el, preset: "streets", center: [lng, lat], zoom })`.
  - On `load`, for each location: take the sum of `n[id]` over the selected models (all models if none are selected), then `map.project([lng, lat])`. Skip it if it falls outside the container. Otherwise draw a `TRMNLMaps.dot` (hollow when the count is 0) and position a framework `label` with the count over it.
  - Data comes from `{{ locations | json }}` and `{{ trmnl.plugin_settings.custom_fields_values.models | json }}`.
- `src/full.liquid`, `half_horizontal.liquid`, `half_vertical.liquid` and `quadrant.liquid` each render `shared` inside their view with a title bar ("Avant2Go", plus the total available in view).
- `error` set → show a short message instead of the map.
- Use no custom styles except the positioning of the count labels, and keep the OSM credit. Tiles are the default free OSM Shortbread tiles.

## Testing

- `trmnlp serve`: check all four layouts at several zoom levels and model selections.
- `test/transform.test.js`: an `assert`-based Node check of the counting logic against saved API JSON.

## Open questions

1. Does `multiple: true` work on `xhrSelect`? If not, fall back to a `select` with the models listed in the YAML.
2. Does the `remote:` block need a `response_path` for a bare-array response?
3. What exact shape does `IDX_0` / `IDX_1` have in multi-URL polling? Verify in trmnlp.
4. Is there a TRMNL polling payload size limit that `/api/cars` (~680 KB) could exceed?
5. Does `/api/cars` list only free cars? It's undocumented; the `status` filter covers it either way.
6. Labels for locations only a few metres apart will overlap even at zoom 12 or higher. Accepted for now.
