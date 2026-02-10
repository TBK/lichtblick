// SPDX-FileCopyrightText: Copyright (C) 2023-2026 Bayerische Motoren Werke Aktiengesellschaft (BMW AG)<lichtblick@bmwgroup.com>
// SPDX-License-Identifier: MPL-2.0

// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import { RawImage } from "@foxglove/schemas";
import { Meta, StoryObj } from "@storybook/react-webpack5";

import { MessageEvent } from "@lichtblick/suite";
import { Topic } from "@lichtblick/suite-base/players/types";
import PanelSetup, { Fixture } from "@lichtblick/suite-base/stories/PanelSetup";

import { ImagePanel } from "../../index";
import { ColorModeSettings } from "../../renderables/colorMode";
import { rad2deg, SENSOR_FRAME_ID } from "../common";

export default {
  title: "panels/ThreeDeeRender/DepthColormaps",
  component: ImagePanel,
  parameters: { colorScheme: "light" },
} as Meta;

const WIDTH = 240;
const HEIGHT = 180;

type DepthPattern = "wide" | "narrow";

/**
 * Builds a 16UC1 depth frame.
 *
 * "wide" sweeps the full 16-bit range so a colormap's entire gradient is visible in one frame.
 *
 * "narrow" is what a real depth camera tends to produce: every reading inside a ~1500-count band,
 * plus a block of zeros standing in for "no reading". Rendered against the default 0-65535 range
 * it collapses to a single flat colour, which is the case histogram equalization exists to fix.
 */
function makeDepthFrame(pattern: DepthPattern): MessageEvent<Partial<RawImage>> {
  const view = new DataView(new ArrayBuffer(WIDTH * HEIGHT * 2));
  for (let r = 0; r < HEIGHT; r++) {
    for (let c = 0; c < WIDTH; c++) {
      let val: number;
      if (pattern === "wide") {
        val = Math.round(65535 * (c / (WIDTH - 1)));
      } else if (c < WIDTH * 0.15) {
        val = 0;
      } else {
        const t = (c - WIDTH * 0.15) / (WIDTH * 0.85 - 1);
        const step = r > HEIGHT / 2 ? 400 : 0;
        val = 30000 + Math.round(1100 * t) + step;
      }
      view.setUint16((r * WIDTH + c) * 2, val, true);
    }
  }
  return {
    topic: "/depth/raw",
    receiveTime: { sec: 10, nsec: 0 },
    message: {
      timestamp: { sec: 0, nsec: 0 },
      frame_id: SENSOR_FRAME_ID,
      height: HEIGHT,
      width: WIDTH,
      encoding: "16UC1",
      step: WIDTH * 2,
      data: new Uint8Array(view.buffer),
    },
    schemaName: "foxglove.RawImage",
    sizeInBytes: 0,
  };
}

const DepthPanel = ({
  colorMap,
  histogramEqualization = false,
  pattern = "wide",
  minValue = 0,
  maxValue = 65535,
}: {
  colorMap: ColorModeSettings["colorMap"];
  histogramEqualization?: boolean;
  pattern?: DepthPattern;
  minValue?: number;
  maxValue?: number;
}): React.JSX.Element => {
  const topics: Topic[] = [{ name: "/depth/raw", schemaName: "foxglove.RawImage" }];
  const fixture: Fixture = {
    topics,
    frame: { "/depth/raw": [makeDepthFrame(pattern)] },
    capabilities: [],
    activeData: { currentTime: { sec: 0, nsec: 0 } },
  };

  return (
    <PanelSetup fixture={fixture}>
      <ImagePanel
        overrideConfig={{
          ...ImagePanel.defaultConfig,
          followTf: undefined,
          scene: { transforms: { axisScale: 0, showLabel: false } },
          imageMode: {
            imageTopic: "/depth/raw",
            // colorMap is only read when colorMode is "colormap"; the panel default is "gradient"
            // (black -> white), which renders every colormap as plain grayscale.
            colorMode: "colormap",
            colorMap,
            histogramEqualization,
            explicitAlpha: 1,
            minValue,
            maxValue,
          },
          cameraState: {
            distance: 1.5,
            perspective: true,
            phi: rad2deg(0.975),
            targetOffset: [0, 0.4, 0],
            thetaOffset: rad2deg(0),
            fovy: rad2deg(0.75),
            near: 0.01,
            far: 5000,
            target: [0, 0, 0],
            targetOrientation: [0, 0, 0, 1],
          },
        }}
      />
    </PanelSetup>
  );
};

function story(
  colorMap: ColorModeSettings["colorMap"],
  extra: {
    histogramEqualization?: boolean;
    pattern?: DepthPattern;
    minValue?: number;
    maxValue?: number;
  } = {},
): StoryObj<typeof DepthPanel> {
  return { render: DepthPanel, args: { colorMap, ...extra } };
}

export const Turbo: StoryObj<typeof DepthPanel> = story("turbo");
export const Rainbow: StoryObj<typeof DepthPanel> = story("rainbow");
export const Jet: StoryObj<typeof DepthPanel> = story("jet");
export const Grayscale: StoryObj<typeof DepthPanel> = story("grayscale");
export const InverseGrayscale: StoryObj<typeof DepthPanel> = story("inverseGrayscale");
export const Warm: StoryObj<typeof DepthPanel> = story("warm");
export const Cold: StoryObj<typeof DepthPanel> = story("cold");
export const Biomes: StoryObj<typeof DepthPanel> = story("biomes");
export const Quantized: StoryObj<typeof DepthPanel> = story("quantized");
export const Hue: StoryObj<typeof DepthPanel> = story("hue");

/**
 * Histogram equalization off and on over identical data. These two must not render the same: the
 * flag has to survive the trip from panel config into the image renderable's initial settings,
 * which is a separate path from the one a settings-tree edit takes.
 */
export const NarrowRangeEqualizationOff: StoryObj<typeof DepthPanel> = story("turbo", {
  pattern: "narrow",
});
export const NarrowRangeEqualizationOn: StoryObj<typeof DepthPanel> = story("turbo", {
  pattern: "narrow",
  histogramEqualization: true,
});

/** The same narrow data with the range clamped by hand, for comparison with equalization. */
export const NarrowRangeManualMinMax: StoryObj<typeof DepthPanel> = story("turbo", {
  pattern: "narrow",
  minValue: 30000,
  maxValue: 31500,
});
