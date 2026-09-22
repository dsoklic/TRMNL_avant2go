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
