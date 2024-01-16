import { Action, ActionPanel, Grid, Icon, Toast, useNavigation } from "@raycast/api";
import { Group, Id, Palette, PngUri, PngUriCache, Scene, SmartScene } from "./lib/types";
import UnlinkAction from "./components/UnlinkAction";
import ManageHueBridge from "./components/ManageHueBridge";
import { SendHueMessage, useHue } from "./hooks/useHue";
import HueClient from "./lib/HueClient";
import useGradients from "./hooks/useGradientUris";
import React, { useMemo, useState } from "react";
import "./helpers/arrayExtensions";
import { getColorsFromScene } from "./helpers/hueResources";

import { getTransitionTimeInMs } from "./helpers/raycast";
import Style = Toast.Style;

// Exact dimensions of a 16:9 Raycast 5 column grid item.
const GRID_ITEM_WIDTH = 271;
const GRID_ITEM_HEIGHT = 153;

export default function SetScene(props: { group?: Group; useHue?: ReturnType<typeof useHue> }) {
  const { hueBridgeState, sendHueMessage, isLoading, rooms, zones, scenes, smartScenes } = props.useHue ?? useHue();
  const [palettes, setPalettes] = useState(new Map<Id, Palette>([]));
  const { gradientUris } = useGradients(palettes, GRID_ITEM_WIDTH, GRID_ITEM_HEIGHT);
  const groupTypes = [rooms, zones];
  const { pop } = useNavigation();
  const isSubView = props.group !== undefined;

  // TODO: Add images for smart scenes.

  useMemo(() => {
    setPalettes(new Map<Id, Palette>(scenes.map((scene) => [scene.id, getColorsFromScene(scene)])));
  }, [scenes]);

  const manageHueBridgeElement: React.JSX.Element | null = ManageHueBridge(hueBridgeState, sendHueMessage);
  if (manageHueBridgeElement !== null) return manageHueBridgeElement;

  if (props.group !== undefined) {
    const group = props.group;
    const groupScenes =
      scenes
        .filter((scene: Scene) => scene.group.rid === group.id)
        .sort((sceneA, sceneB) => sceneA.metadata.name.localeCompare(sceneB.metadata.name)) ?? [];
    const groupSmartScenes =
      smartScenes
        .filter((smartScene) => smartScene.group.rid === group.id)
        .sort((smartSceneA, smartSceneB) => smartSceneA.metadata.name.localeCompare(smartSceneB.metadata.name)) ?? [];

    return (
      <Grid
        navigationTitle={`Set Scene for ${props.group.metadata.name}`}
        isLoading={isLoading}
        aspectRatio="16/9"
        filtering={{ keepSectionOrder: true }}
      >
        <Grid.Section title={group.metadata.name}>
          {groupSmartScenes.map((smartScene) => (
            <SmartSceneCard
              key={smartScene.id}
              smartScene={smartScene}
              group={group}
              gradientUri={gradientUris.get(smartScene.id)}
              onSetScene={() => {
                if (isSubView) {
                  pop();
                }
              }}
              hueClient={hueBridgeState.context.hueClient}
              sendHueMessage={sendHueMessage}
            />
          ))}
          {groupScenes.map((groupScene) => (
            <SceneCard
              key={groupScene.id}
              scene={groupScene}
              group={group}
              gradientUri={gradientUris.get(groupScene.id)}
              onSetScene={() => {
                if (isSubView) {
                  pop();
                }
              }}
              hueClient={hueBridgeState.context.hueClient}
              sendHueMessage={sendHueMessage}
            />
          ))}
        </Grid.Section>
      </Grid>
    );
  } else {
    return (
      <Grid isLoading={isLoading} aspectRatio="16/9" filtering={{ keepSectionOrder: true }}>
        {groupTypes.map((groupType: Group[]): React.JSX.Element[] => {
          return groupType.map((group: Group): React.JSX.Element => {
            const groupScenes =
              scenes
                .filter((scene: Scene) => scene.group.rid === group.id)
                .sort((sceneA, sceneB) => sceneA.metadata.name.localeCompare(sceneB.metadata.name)) ?? [];
            const groupSmartScenes =
              smartScenes
                .filter((smartScene) => smartScene.group.rid === group.id)
                .sort((smartSceneA, smartSceneB) =>
                  smartSceneA.metadata.name.localeCompare(smartSceneB.metadata.name),
                ) ?? [];

            return (
              <GroupCard
                key={group.id}
                group={group}
                scenes={groupScenes}
                smartScenes={groupSmartScenes}
                gradientUris={gradientUris}
                hueClient={hueBridgeState.context.hueClient}
                sendHueMessage={sendHueMessage}
              />
            );
          });
        })}
      </Grid>
    );
  }
}

function GroupCard(props: {
  group: Group;
  scenes: Scene[];
  smartScenes: SmartScene[];
  gradientUris: PngUriCache;
  onSetScene?: () => void;
  hueClient?: HueClient;
  sendHueMessage: SendHueMessage;
}) {
  return (
    <Grid.Section key={props.group.id} title={props.group.metadata.name}>
      {props.smartScenes.map(
        (smartScene: SmartScene): React.JSX.Element => (
          <SmartSceneCard
            key={smartScene.id}
            group={props.group}
            smartScene={smartScene}
            gradientUri={props.gradientUris.get(smartScene.id)}
            onSetScene={props.onSetScene}
            hueClient={props.hueClient}
            sendHueMessage={props.sendHueMessage}
          />
        ),
      )}
      {props.scenes.map(
        (scene: Scene): React.JSX.Element => (
          <SceneCard
            key={scene.id}
            group={props.group}
            scene={scene}
            gradientUri={props.gradientUris.get(scene.id)}
            onSetScene={props.onSetScene}
            hueClient={props.hueClient}
            sendHueMessage={props.sendHueMessage}
          />
        ),
      )}
    </Grid.Section>
  );
}

function SmartSceneCard(props: {
  smartScene: SmartScene;
  group: Group;
  gradientUri: PngUri | undefined;
  onSetScene?: () => void;
  sendHueMessage: SendHueMessage;
  hueClient?: HueClient;
}) {
  const activeEmoji = !(props.smartScene.state === "inactive") ? "💡 " : "";
  return (
    <Grid.Item
      title={activeEmoji + props.smartScene.metadata.name}
      keywords={[props.group.metadata.name]}
      content={props.gradientUri ?? ""}
      actions={
        <ActionPanel>
          <SetSmartSceneAction
            group={props.group}
            smartScene={props.smartScene}
            onSet={() => {
              handleSetSmartScene(props.hueClient, props.group, props.smartScene).then();
              props.onSetScene?.();
            }}
          />
          <ActionPanel.Section>
            <UnlinkAction sendHueMessage={props.sendHueMessage} />
          </ActionPanel.Section>
        </ActionPanel>
      }
    />
  );
}

function SetSmartSceneAction(props: { group: Group; smartScene: SmartScene; onSet: () => void }) {
  return <Action title="Set Smart Scene" icon={Icon.Image} onAction={() => props.onSet()} />;
}

function SceneCard(props: {
  scene: Scene;
  group: Group;
  gradientUri: PngUri | undefined;
  onSetScene?: () => void;
  sendHueMessage: SendHueMessage;
  hueClient?: HueClient;
}) {
  const activeEmoji = !(props.scene.status?.active === "inactive") ? "💡 " : "";
  return (
    <Grid.Item
      title={activeEmoji + props.scene.metadata.name}
      keywords={[props.group.metadata.name]}
      content={props.gradientUri ?? ""}
      actions={
        <ActionPanel>
          <SetSceneAction
            group={props.group}
            scene={props.scene}
            onSet={() => {
              handleSetScene(props.hueClient, props.group, props.scene).then();
              props.onSetScene?.();
            }}
          />
          <ActionPanel.Section>
            <UnlinkAction sendHueMessage={props.sendHueMessage} />
          </ActionPanel.Section>
        </ActionPanel>
      }
    />
  );
}

function SetSceneAction(props: { group: Group; scene: Scene; onSet: () => void }) {
  return <Action title="Set Scene" icon={Icon.Image} onAction={() => props.onSet()} />;
}

async function handleSetScene(hueClient: HueClient | undefined, group: Group, scene: Scene) {
  const toast = new Toast({ title: "" });

  try {
    if (hueClient === undefined) throw new Error("Hue client not initialized.");

    await hueClient.updateScene(scene, {
      recall: {
        action: "active",
        duration: getTransitionTimeInMs(),
      },
    });

    // TODO: Mark all other scenes as inactive.
    // TODO: Mark all smart scenes as inactive.

    toast.style = Style.Success;
    toast.title = `Scene ${scene.metadata.name} set for ${group.metadata.name}.`;
    await toast.show();
  } catch (error) {
    toast.style = Style.Failure;
    toast.title = `Failed setting scene ${scene.metadata.name} for ${group.metadata.name}.`;
    toast.message = error instanceof Error ? error.message : undefined;
    await toast.show();
  }
}

async function handleSetSmartScene(hueClient: HueClient | undefined, group: Group, smartScene: SmartScene) {
  const toast = new Toast({ title: "" });

  try {
    if (hueClient === undefined) throw new Error("Hue client not initialized.");

    // TODO: Add 'deactivate'
    await hueClient.updateSmartScene(smartScene, {
      recall: {
        action: "activate",
      },
    });

    // TODO: Mark all other smart scenes as inactive.
    // TODO: Mark all scenes as inactive.

    toast.style = Style.Success;
    toast.title = `Scene ${smartScene.metadata.name} set for ${group.metadata.name}.`;
    await toast.show();
  } catch (error) {
    toast.style = Style.Failure;
    toast.title = `Failed setting scene ${smartScene.metadata.name} for ${group.metadata.name}.`;
    toast.message = error instanceof Error ? error.message : undefined;
    await toast.show();
  }
}
