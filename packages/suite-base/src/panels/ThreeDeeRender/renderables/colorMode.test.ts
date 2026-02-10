// SPDX-FileCopyrightText: Copyright (C) 2023-2026 Bayerische Motoren Werke Aktiengesellschaft (BMW AG)<lichtblick@bmwgroup.com>
// SPDX-License-Identifier: MPL-2.0

import { ColorModeSettings, colorModeSettingsFields, getColorConverter } from "./colorMode";
import { ColorRGBA } from "../ros";

type ColorMap = ColorModeSettings["colorMap"];
type ColorMapSettings = ColorModeSettings & { colorMode: "colormap" };

/** Colormaps added alongside the pre-existing "turbo" and "rainbow" maps. */
const ADDED_COLOR_MAPS = [
  "jet",
  "grayscale",
  "inverseGrayscale",
  "warm",
  "cold",
  "biomes",
  "quantized",
  "hue",
] as const;

function makeSettings(colorMap: ColorMap, explicitAlpha: number): ColorMapSettings {
  return {
    colorMode: "colormap",
    flatColor: "#ffffff",
    gradient: ["#000000", "#ffffff"],
    colorMap,
    explicitAlpha,
  };
}

/** Convert a single value with the given colormap over the range [min, max]. */
function convert(
  colorMap: ColorMap,
  value: number,
  opts: { min?: number; max?: number; explicitAlpha?: number } = {},
): ColorRGBA {
  const { min = 0, max = 1, explicitAlpha = 1 } = opts;
  const output: ColorRGBA = { r: 0, g: 0, b: 0, a: 0 };
  getColorConverter(makeSettings(colorMap, explicitAlpha), min, max)(output, value);
  return output;
}

describe("getColorConverter", () => {
  describe.each(ADDED_COLOR_MAPS)("colormap %s", (colorMap) => {
    it("should produce linear RGB channels inside [0, 1] across the whole range", () => {
      // GIVEN a colormap converter over the range [0, 1]
      // WHEN values spanning that range are converted
      // THEN every channel stays inside the valid linear RGB range
      for (const frac of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1]) {
        const { r, g, b } = convert(colorMap, frac);
        for (const channel of [r, g, b]) {
          expect(channel).toBeGreaterThanOrEqual(0);
          expect(channel).toBeLessThanOrEqual(1);
          expect(Number.isNaN(channel)).toBe(false);
        }
      }
    });

    it("should set alpha from explicitAlpha rather than the colormap", () => {
      // GIVEN a converter configured with a non-default explicit alpha
      // WHEN a value is converted
      // THEN the output alpha is the configured explicit alpha
      expect(convert(colorMap, 0.5, { explicitAlpha: 0.25 }).a).toBe(0.25);
    });

    it("should clamp values outside [minValue, maxValue] to the endpoint colors", () => {
      // GIVEN values below minValue and above maxValue
      // WHEN they are converted
      // THEN they produce the same colors as the range endpoints
      expect(convert(colorMap, -5)).toEqual(convert(colorMap, 0));
      expect(convert(colorMap, 5)).toEqual(convert(colorMap, 1));
    });

    it("should map the value through minValue/maxValue rather than using it directly", () => {
      // GIVEN a converter over the range [100, 200]
      // WHEN the midpoint 150 is converted
      // THEN it matches the midpoint of a [0, 1] converter
      expect(convert(colorMap, 150, { min: 100, max: 200 })).toEqual(convert(colorMap, 0.5));
    });
  });

  it("should map grayscale from white at minValue to black at maxValue", () => {
    // GIVEN the grayscale colormap, which follows the RealSense convention of near = bright
    // WHEN the range endpoints are converted
    // THEN minValue is white and maxValue is black
    expect(convert("grayscale", 0)).toEqual({ r: 1, g: 1, b: 1, a: 1 });
    expect(convert("grayscale", 1)).toEqual({ r: 0, g: 0, b: 0, a: 1 });
  });

  it("should make inverseGrayscale the mirror image of grayscale", () => {
    // GIVEN the grayscale and inverseGrayscale colormaps
    // WHEN the same fraction is converted through each, mirrored about the midpoint
    // THEN the resulting channels match
    for (const frac of [0, 0.25, 0.5, 0.75, 1]) {
      const direct = convert("grayscale", frac);
      const mirrored = convert("inverseGrayscale", 1 - frac);
      expect(direct.r).toBeCloseTo(mirrored.r, 4);
      expect(direct.g).toBeCloseTo(mirrored.g, 4);
      expect(direct.b).toBeCloseTo(mirrored.b, 4);
    }
  });

  it("should start the jet colormap at blue and end at dark red", () => {
    // GIVEN the jet colormap
    // WHEN the range endpoints are converted
    // THEN it runs from pure blue to a dark red with no blue or green component
    expect(convert("jet", 0)).toEqual({ r: 0, g: 0, b: 1, a: 1 });

    const high = convert("jet", 1);
    expect(high.r).toBeGreaterThan(0);
    expect(high.g).toBe(0);
    expect(high.b).toBe(0);
  });

  it("should produce piecewise-constant output for the quantized colormap", () => {
    // GIVEN the quantized colormap, which buckets values into discrete color levels
    // WHEN two nearby values inside the same bucket are converted
    // THEN they yield an identical color, while distant values differ
    expect(convert("quantized", 0.01)).toEqual(convert("quantized", 0.02));
    expect(convert("quantized", 0.01)).not.toEqual(convert("quantized", 0.99));
  });

  it("should produce distinct colors at the two ends of every non-cyclic colormap", () => {
    // GIVEN each added colormap except the cyclic "hue" wheel
    // WHEN the range endpoints are converted
    // THEN the endpoint colors differ, so the map actually varies with value
    for (const colorMap of ADDED_COLOR_MAPS.filter((name) => name !== "hue")) {
      expect(convert(colorMap, 0)).not.toEqual(convert(colorMap, 1));
    }
  });

  it("should wrap the hue colormap back to its starting color at maxValue", () => {
    // GIVEN the hue colormap, which sweeps a full 0-360 degree hue wheel
    // WHEN the range endpoints are converted
    // THEN both ends are the same red, so minValue and maxValue are not distinguishable by color
    expect(convert("hue", 0)).toEqual({ r: 1, g: 0, b: 0, a: 1 });
    expect(convert("hue", 1)).toEqual(convert("hue", 0));
  });

  it("should throw for an unrecognized colormap", () => {
    // GIVEN a settings object naming a colormap that does not exist
    // WHEN a converter is requested
    // THEN construction throws
    expect(() => getColorConverter(makeSettings("nope" as ColorMap, 1), 0, 1)).toThrow(
      "Unrecognized color map: nope",
    );
  });
});

describe("colorModeSettingsFields", () => {
  it("should offer every colormap in the colorMap dropdown", () => {
    // GIVEN a colormap-mode settings tree
    // WHEN the colorMap field options are inspected
    // THEN all supported colormaps, including the added ones, are selectable
    const fields = colorModeSettingsFields({
      config: { colorMode: "colormap", colorMap: "turbo" },
      defaults: { gradient: ["#000000", "#ffffff"] },
      modifiers: { supportsPackedRgbModes: false, supportsRgbaFieldsMode: false },
    });

    const colorMapField = fields.colorMap;
    const options = (colorMapField as { options: Array<{ value: string }> }).options;

    expect(options.map((option) => option.value)).toEqual(
      expect.arrayContaining(["turbo", "rainbow", ...ADDED_COLOR_MAPS]),
    );
  });
});
