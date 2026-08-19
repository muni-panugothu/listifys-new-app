const {
  applyStrictCountryFilter,
  applyStrictGeoFilter,
} = require("../utils/geoQuery");

describe("upcoming events location filters", () => {
  test("applyStrictCountryFilter requires exact country match", () => {
    const filter = {};
    applyStrictCountryFilter(filter, "US");
    expect(filter.countryCode).toEqual({ $regex: /^US$/i });
  });

  test("applyStrictCountryFilter ignores empty values", () => {
    const filter = {};
    applyStrictCountryFilter(filter, "  ");
    expect(filter.countryCode).toBeUndefined();
  });

  test("applyStrictGeoFilter requires coordinates within radius", () => {
    const filter = {};
    applyStrictGeoFilter(filter, 35.7796, -78.6382, 100);
    expect(filter.coordinates.$geoWithin.$centerSphere[0]).toEqual([
      -78.6382, 35.7796,
    ]);
  });

  test("applyStrictGeoFilter ignores invalid coordinates", () => {
    const filter = {};
    applyStrictGeoFilter(filter, "bad", "data", 100);
    expect(filter.coordinates).toBeUndefined();
  });
});
