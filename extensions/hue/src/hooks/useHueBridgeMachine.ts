import React, { useMemo } from "react";
import { GroupedLight, Light, Room, Scene, SmartScene, Zone } from "../lib/types";
import { useMachine } from "@xstate/react";
import { HueMessage, SendHueMessage } from "./useHue";
import hueBridgeMachine from "../lib/hueBridgeMachine";

export function useHueBridgeMachine(
  setLights: React.Dispatch<React.SetStateAction<Light[]>>,
  setGroupedLights: React.Dispatch<React.SetStateAction<GroupedLight[]>>,
  setRooms: React.Dispatch<React.SetStateAction<Room[]>>,
  setZones: React.Dispatch<React.SetStateAction<Zone[]>>,
  setScenes: React.Dispatch<React.SetStateAction<Scene[]>>,
  setSmartScenes: React.Dispatch<React.SetStateAction<SmartScene[]>>,
) {
  const machine = useMemo(
    () => hueBridgeMachine(setLights, setGroupedLights, setRooms, setZones, setScenes, setSmartScenes),
    [],
  );

  const [hueBridgeState, send] = useMachine(machine);
  const sendHueMessage: SendHueMessage = (message: HueMessage) => {
    send({ type: message.toUpperCase() });
  };

  return {
    hueBridgeState,
    sendHueMessage,
  };
}
