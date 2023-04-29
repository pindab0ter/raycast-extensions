import Jimp from "jimp";
import chroma from "chroma-js";
import { RoomIcon } from "../lib/types";
import { environment } from "@raycast/api";

export function createGradientPngUri(gradientInfo: RoomIcon, width: number, height: number): Promise<string> {
  return new Promise((resolve, reject) => {
    new Jimp(width, height, async (error, image) => {
      if (error) {
        return reject(error);
      }

      const scale = chroma.scale(gradientInfo.palette).gamma(0.8).padding(0.15);

      image.scan(0, 0, width, height, (x, y) => {
        const factor = (y / height) * 2.3;
        const rgba = scale(x / width)
          .darken(factor * (factor * 0.5))
          .rgba(true);

        image.setPixelColor(Jimp.rgbaToInt(rgba[0], rgba[1], rgba[2], 254 * rgba[3]), x, y);
      });

      if (gradientInfo.selected) {
        await Jimp.read(environment.assetsPath + "/scene-selected.png").then((overlayImage) => {
          image.composite(overlayImage, 0, 0, {
            mode: Jimp.BLEND_SOURCE_OVER,
            opacitySource: 1,
            opacityDest: 1,
          });
        });
      }

      image.getBase64(Jimp.MIME_PNG, (error, base64) => {
        if (error) {
          return reject(error);
        }
        return resolve(base64);
      });
    });
  });
}
