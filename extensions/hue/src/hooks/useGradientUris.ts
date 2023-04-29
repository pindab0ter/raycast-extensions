import { useMemo, useState } from "react";
import { createGradientPngUri } from "../helpers/createGradientUri";
import { RoomIcon, Id, PngUri, PngUriCache } from "../lib/types";
import { Cache } from "@raycast/api";

const gradientCache = new Cache({ namespace: "hue-room-icons" });

export default function useGradientUris(idsToRoomIcons: Map<Id, RoomIcon>, width: number, height: number) {
  const [gradientUris, setGradientUris] = useState<PngUriCache>(new Map<Id, PngUri>());

  useMemo(() => {
    idsToRoomIcons.forEach((roomIcon, id) => {
      if (roomIcon.palette.length === 0) {
        return;
      }

      const key = `${roomIcon.palette.join("_")}${roomIcon.selected ? "_selected" : ""}_${width}x${height}`;
      const cached = gradientCache.get(key);

      if (cached) {
        setGradientUris((gradients) => new Map(gradients).set(id, JSON.parse(cached)));
      } else {
        createGradientPngUri(roomIcon, width, height).then((gradientUri) => {
          gradientCache.set(key, JSON.stringify(gradientUri));
          setGradientUris((gradients) => new Map(gradients).set(id, gradientUri));
        });
      }
    });
  }, [idsToRoomIcons]);

  return { gradientUris };
}
