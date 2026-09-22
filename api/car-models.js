// Vercel function for the "Car models" xhrSelect field: only Available models,
// in TRMNL's option format [{ "<label>": "<value>" }].
module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");
  if (req.method === "OPTIONS") return res.status(204).end();

  try {
    const models = await (await fetch("https://api.avant2go.com/api/carModels")).json();
    res.setHeader("Cache-Control", "s-maxage=3600");
    res.json(models
      .filter(m => m.status === "Available")
      .map(m => ({ [`${m.manufacturer} ${m.name}`]: m._id })));
  } catch (e) {
    res.status(502).json([]);
  }
};
