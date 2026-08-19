const {
  extractCityToken,
  resolveEventAnchor,
} = require("../utils/similarEventsQuery");

describe("similarEventsQuery", () => {
  describe("extractCityToken", () => {
    test("returns single-part location", () => {
      expect(extractCityToken("Hyderabad")).toBe("Hyderabad");
    });

    test("returns city from venue, city, state", () => {
      expect(extractCityToken("Prism Club, Hyderabad, Telangana")).toBe("Hyderabad");
    });

    test("returns first part for city, state", () => {
      expect(extractCityToken("London, England")).toBe("London");
    });
  });

  describe("resolveEventAnchor", () => {
    test("prefers event coordinates over query", () => {
      const anchor = resolveEventAnchor(
        {
          coordinates: { coordinates: [78.4772, 17.4065] },
          countryCode: "IN",
          location: "Prism Club, Hyderabad, Telangana",
        },
        { lat: 51.5, lng: -0.12, countryCode: "GB" },
      );
      expect(anchor.lat).toBeCloseTo(17.4065);
      expect(anchor.lng).toBeCloseTo(78.4772);
      expect(anchor.countryCode).toBe("IN");
      expect(anchor.cityToken).toBe("Hyderabad");
    });
  });
});
