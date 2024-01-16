import { assign, fromPromise, setup } from "xstate";
import { getPreferenceValues, LocalStorage, Toast } from "@raycast/api";
import HueClient from "./HueClient";
import { BridgeConfig, GroupedLight, Light, Room, Scene, SmartScene, Zone } from "./types";
import React from "react";
import { discoverBridgeUsingHuePublicApi, discoverBridgeUsingMdns } from "../helpers/hueNetworking";
import net from "net";
import { BRIDGE_CONFIG_KEY } from "../helpers/constants";
import createHueClient from "./createHueClient";
import { getBridgeConfig } from "./getBridgeConfig";
import Style = Toast.Style;

/**
 * @see https://stately.ai/registry/editor/fb75a44c-277d-49c0-932b-8b447a677ad3
 */
export default function hueBridgeMachine(
  setLights: React.Dispatch<React.SetStateAction<Light[]>>,
  setGroupedLights: React.Dispatch<React.SetStateAction<GroupedLight[]>>,
  setRooms: React.Dispatch<React.SetStateAction<Room[]>>,
  setZones: React.Dispatch<React.SetStateAction<Zone[]>>,
  setScenes: React.Dispatch<React.SetStateAction<Scene[]>>,
  setSmartScenes: React.Dispatch<React.SetStateAction<SmartScene[]>>,
) {
  return setup({
    actors: {
      loadPreferences: fromPromise(async () => {
        const preferences = getPreferenceValues<Preferences>();
        const bridgeIpAddress = preferences.bridgeIpAddress;
        const bridgeUsername = preferences.bridgeUsername;

        if (bridgeIpAddress && !net.isIP(bridgeIpAddress)) {
          throw Error("Bridge IP address is not a valid IPv4 address");
        }

        if (bridgeIpAddress && bridgeUsername) {
          console.info("Using bridge IP address and username from preferences");
        } else if (bridgeIpAddress) {
          console.info("Using bridge IP address from preferences");
        } else if (bridgeUsername) {
          console.info("Using bridge username from preferences");
        }

        return {
          bridgeIpAddress: bridgeIpAddress,
          bridgeUsername: bridgeUsername,
        };
      }),

      loadConfiguration: fromPromise(
        async ({
          input,
        }: {
          input: { bridgeIpAddress?: string; bridgeUsername?: string };
        }): Promise<{ bridgeConfig?: BridgeConfig }> => {
          console.info("Loading configuration…");
          const bridgeConfigString = await LocalStorage.getItem<string>(BRIDGE_CONFIG_KEY);
          if (bridgeConfigString === undefined) {
            return { bridgeConfig: undefined };
          }

          let bridgeConfig = JSON.parse(bridgeConfigString);

          // Override bridge IP address and username if they are loaded from preferences
          bridgeConfig = {
            ...bridgeConfig,
            ...(input.bridgeIpAddress ? { ipAddress: input.bridgeIpAddress } : {}),
            ...(input.bridgeUsername ? { username: input.bridgeUsername } : {}),
          };

          return { bridgeConfig: bridgeConfig };
        },
      ),

      instantiateHueClient: fromPromise(async ({ input }: { input: { bridgeConfig?: BridgeConfig } }) => {
        if (input.bridgeConfig === undefined) {
          throw Error("Bridge configuration is undefined when trying to connect");
        }

        const hueClient = await createHueClient(
          input.bridgeConfig,
          setLights,
          setGroupedLights,
          setRooms,
          setZones,
          setScenes,
          setSmartScenes,
        );

        new Toast({ title: "" }).hide().then();

        return hueClient;
      }),

      discoverBridgeUsingMdns: fromPromise(discoverBridgeUsingMdns),

      discoverBridgeUsingHuePublicApi: fromPromise(discoverBridgeUsingHuePublicApi),

      linkWithBridge: fromPromise(
        async ({ input }: { input: { bridgeIpAddress?: string; bridgeId?: string; bridgeUsername?: string } }) => {
          if (input.bridgeIpAddress === undefined) throw Error("No bridge IP address");

          console.info("Linking with Hue Bridge…");

          const bridgeConfig = await getBridgeConfig(input.bridgeIpAddress, input.bridgeId, input.bridgeUsername);

          const hueClient = await createHueClient(
            bridgeConfig,
            setLights,
            setGroupedLights,
            setRooms,
            setZones,
            setScenes,
            setSmartScenes,
          );

          return { bridgeConfig, hueClient };
        },
      ),

      unlinkBridge: fromPromise(async () => {
        console.info("Unlinking (clearing configuration)…");
        await LocalStorage.clear();
      }),

      saveBridgeConfigToLocalStorage: fromPromise(async ({ input }: { input: { bridgeConfig?: BridgeConfig } }) => {
        console.info("Saving bridge configuration to local storage…");
        if (input.bridgeConfig === undefined) {
          throw Error("Bridge configuration is undefined when trying to save it");
        }
        await LocalStorage.setItem(BRIDGE_CONFIG_KEY, JSON.stringify(input.bridgeConfig));
      }),
    },
  }).createMachine({
    id: "manageHueBridge",
    initial: "loadingPreferences",
    types: {} as {
      context: {
        bridgeIpAddress?: string;
        bridgeUsername?: string;
        bridgeId?: string;
        bridgeConfig?: BridgeConfig;
        hueClient?: HueClient;
      };
    },
    context: {
      bridgeIpAddress: undefined,
      bridgeUsername: undefined,
      bridgeId: undefined,
      bridgeConfig: undefined,
      hueClient: undefined,
    },
    on: {
      UNLINK: {
        target: ".unlinking",
      },
    },
    states: {
      loadingPreferences: {
        invoke: {
          id: "loadingPreferences",
          src: "loadPreferences",
          onDone: {
            target: "loadingConfiguration",
            actions: assign({
              bridgeIpAddress: ({ event }) => event.output.bridgeIpAddress,
              bridgeUsername: ({ event }) => event.output.bridgeUsername,
            }),
          },
          onError: {
            target: "failedToLoadPreferences",
            actions: ({ event }) => console.error(event.error),
          },
        },
      },

      failedToLoadPreferences: {
        type: "final",
      },

      loadingConfiguration: {
        invoke: {
          id: "loadingConfiguration",
          src: "loadConfiguration",
          input: ({ context }) => ({
            bridgeIpAddress: context.bridgeIpAddress,
            bridgeUsername: context.bridgeUsername,
          }),
          onDone: [
            {
              target: "connecting",
              actions: assign({
                bridgeConfig: ({ event }) => event.output.bridgeConfig,
              }),
              guard: ({ event }) => event.output.bridgeConfig !== undefined,
            },
            {
              target: "linking",
              guard: ({ context }) => !!context.bridgeIpAddress,
            },
            {
              target: "discoveringUsingHuePublicApi",
            },
          ],
        },
      },

      connecting: {
        invoke: {
          id: "connecting",
          src: "instantiateHueClient",
          input: ({ context }) => ({ bridgeConfig: context.bridgeConfig }),
          onDone: {
            actions: assign({ hueClient: ({ event }) => event.output }),
            target: "connected",
          },
          onError: {
            actions: ({ event }) => {
              console.error(event.error);
              new Toast({
                style: Style.Failure,
                title: "Failed to connect to bridge",
                message: event.error as string,
              })
                .show()
                .then();
            },
            target: "failedToConnect",
          },
        },
      },

      connected: {},

      failedToConnect: {
        on: {
          RETRY: {
            target: "connecting",
          },
        },
      },

      discoveringUsingHuePublicApi: {
        invoke: {
          id: "discoverBridgeUsingHuePublicApi",
          input: ({ context }) => ({
            bridgeIpAddress: context.bridgeIpAddress,
            bridgeUsername: context.bridgeUsername,
          }),
          src: "discoverBridgeUsingHuePublicApi",
          onDone: [
            {
              target: "linking",
              actions: assign({
                bridgeIpAddress: ({ event }) => event.output.ipAddress,
                bridgeId: ({ event }) => event.output.id,
              }),
              guard: ({ context }) => !!context.bridgeUsername,
            },
            {
              target: "linkWithBridge",
              actions: assign({
                bridgeIpAddress: ({ event }) => event.output.ipAddress,
                bridgeId: ({ event }) => event.output.id,
              }),
            },
          ],
          onError: {
            actions: ({ event }) => console.error(event.error),
            target: "discoveringUsingMdns",
          },
        },
      },

      discoveringUsingMdns: {
        invoke: {
          id: "discoverBridgeUsingMdns",
          src: "discoverBridgeUsingMdns",
          onDone: [
            {
              target: "linking",
              actions: assign({
                bridgeIpAddress: ({ event }) => event.output.ipAddress,
                bridgeId: ({ event }) => event.output.id,
              }),
              guard: ({ context }) => !!context.bridgeUsername,
            },
            {
              actions: assign({
                bridgeIpAddress: ({ event }) => event.output.ipAddress,
                bridgeId: ({ event }) => event.output.id,
              }),
              target: "linkWithBridge",
            },
          ],

          onError: {
            target: "noBridgeFound",
            actions: ({ event }) => console.error(event.error),
          },
        },
      },

      noBridgeFound: {
        on: {
          RETRY: {
            target: "discoveringUsingHuePublicApi",
          },
        },
      },

      linkWithBridge: {
        on: {
          LINK: {
            target: "linking",
          },
        },
      },

      linking: {
        invoke: {
          id: "linking",
          src: "linkWithBridge",
          input: ({ context }) => ({
            bridgeIpAddress: context.bridgeIpAddress,
            bridgeId: context.bridgeId,
            bridgeUsername: context.bridgeUsername,
          }),
          onDone: {
            target: "linked",
            actions: assign({
              bridgeConfig: ({ event }) => event.output.bridgeConfig,
              hueClient: ({ event }) => event.output.hueClient,
            }),
          },
          onError: {
            target: "failedToLink",
            actions: ({ event }) => {
              console.error(event.error);
              new Toast({
                style: Style.Failure,
                title: "Failed to link with bridge",
                message: event.error as string,
              })
                .show()
                .then();
            },
          },
        },
      },

      failedToLink: {
        on: {
          RETRY: {
            target: "linking",
          },
        },
      },

      linked: {
        invoke: {
          id: "linked",
          input: ({ context }) => ({
            bridgeConfig: context.bridgeConfig,
          }),
          src: "saveBridgeConfigToLocalStorage",
        },
        on: {
          DONE: {
            target: "connecting",
          },
        },
      },

      unlinking: {
        invoke: {
          id: "unlinking",
          src: "unlinkBridge",
          onDone: [
            {
              target: "linking",
              actions: assign({
                bridgeUsername: () => getPreferenceValues<Preferences>().bridgeUsername,
                bridgeId: () => undefined,
                bridgeConfig: () => undefined,
              }),
              guard: () => !!getPreferenceValues<Preferences>().bridgeIpAddress,
            },
            {
              target: "discoveringUsingHuePublicApi",
              actions: assign({
                bridgeIpAddress: () => undefined,
                bridgeUsername: () => getPreferenceValues<Preferences>().bridgeUsername,
                bridgeId: () => undefined,
                bridgeConfig: () => undefined,
              }),
            },
          ],
        },
      },
    },
  });
}
