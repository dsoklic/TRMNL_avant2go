function transform(input) {
  function list(x) { return Array.isArray(x) ? x : x && typeof x === "object" ? list(x.results || x.data) : undefined; }
  var locs = list(input.IDX_0), cars = list(input.IDX_1);
  if (!Array.isArray(locs) || !Array.isArray(cars)) return { error: "Avant2Go data unavailable" };

  var byLoc = {};
  cars.forEach(function (c) {
    if (c.status !== "Free" || !c.locationID || !/^[a-f0-9]{24}$/.test(c.carModelID)) return;
    var n = byLoc[c.locationID] = byLoc[c.locationID] || {};
    n[c.carModelID] = (n[c.carModelID] || 0) + 1;
  });

  return {
    locations: locs.filter(function (l) {
      return l.geoLocation && Number.isFinite(+l.geoLocation.lat) && Number.isFinite(+l.geoLocation.lng);
    }).map(function (l) {
      return { lat: +l.geoLocation.lat, lng: +l.geoLocation.lng, n: byLoc[l._id] || {} };
    })
  };
}

// ponytail: serverless runtime calls run(), default runtime calls transform(); same logic either way
function run(input) { return transform(input); }
