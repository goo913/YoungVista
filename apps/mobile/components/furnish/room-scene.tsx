/**
 * The 3D view's Viro scene: the room from core's meshes (walls between the camera and the room
 * fade), soft light with a shadow, and the furniture from the catalog's GLB files (kept on the
 * phone, see lib/catalog.ts). A model that cannot load shows as a labelled box of its real size.
 *
 * The camera stays at the origin looking down -Z and the room moves in front of it (furnish/
 * orbit.ts), so each node turns about a single axis.
 */
import {
  Viro3DObject,
  ViroAmbientLight,
  ViroBox,
  ViroCamera,
  ViroDirectionalLight,
  ViroGeometry,
  ViroMaterials,
  ViroNode,
  ViroQuad,
  ViroScene,
  ViroSphere,
} from '@reactvision/react-viro';
import {
  toViroGeometryParts,
  wallFacesCamera,
  type CatalogDimensions,
  type RoomMeshes,
  type WallMesh,
} from '@youngvista/core';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { eyePosition, FIELD_OF_VIEW, sceneTransform, type Orbit } from '@/furnish/orbit';
import { models } from '@/lib/catalog';
import { useStore, type Store } from '@/lib/store';

/** The scene's colours: the same as the website's 3D view. */
export const SCENE_COLORS = {
  background: '#f1f1f0',
  floor: '#d8c3a2',
  wall: '#f6f4f0',
  frame: '#b9ad9c',
};

ViroMaterials.createMaterials({
  // The floor does not write depth and is drawn first (see Floor): Viro's depth buffer on Android
  // is 16 bits with a 1 cm near plane, about 10 cm of depth precision across a room, so rugs and
  // the selection mark would flicker into a floor that wrote depth.
  yvFloor: {
    lightingModel: 'Lambert',
    diffuseColor: SCENE_COLORS.floor,
    writesToDepthBuffer: false,
  },
  yvWall: { lightingModel: 'Lambert', diffuseColor: SCENE_COLORS.wall },
  yvFrame: { lightingModel: 'Lambert', diffuseColor: SCENE_COLORS.frame },
  yvGlass: {
    lightingModel: 'Constant',
    diffuseColor: 'rgba(169, 203, 232, 0.35)',
    blendMode: 'Alpha',
    writesToDepthBuffer: false,
  },
  // Plain colours, not see-through: Viro on Android left some blended quads out entirely.
  yvSelected: { lightingModel: 'Constant', diffuseColor: '#93c5fd' },
  yvInvalid: { lightingModel: 'Constant', diffuseColor: '#fca5a5' },
  yvLoading: { lightingModel: 'Lambert', diffuseColor: '#e4e4e7' },
  yvMissing: { lightingModel: 'Lambert', diffuseColor: '#a1a1aa' },
  // The background is drawn before everything and writes no depth, so it never covers anything.
  yvSky: {
    lightingModel: 'Constant',
    diffuseColor: SCENE_COLORS.background,
    writesToDepthBuffer: false,
  },
});

/** A piece of furniture as the scene draws it. */
export interface SceneItem {
  id: string;
  x: number;
  y: number;
  z: number;
  rotationY: number;
  /** True size (m). */
  size: CatalogDimensions;
  /** The GLB on the catalog's server, or null when the product is unknown. */
  modelUrl: string | null;
  /** Shown on the box when the model cannot load. */
  label: string;
  highlight: 'none' | 'selected' | 'invalid';
}

export interface SceneState {
  meshes: RoomMeshes;
  items: readonly SceneItem[];
  orbit: Orbit;
  /** Pieces whose model could not load: the 3D view labels them (see Room3D). */
  failed: ReadonlySet<string>;
}

/** What the 3D view passes to the scene through Viro3DSceneNavigator's `viroAppProps`. */
export interface RoomSceneAppProps {
  store: Store<SceneState>;
}

/** The background sphere around the camera (m): beyond the farthest the camera can zoom out. */
const SKY_RADIUS = 300;

/** A wall standing between the camera and the room shows this faintly. */
const FADED = 0.07;

/**
 * The scene Viro starts with: empty. The 3D view then pushes `RoomScene` (see Room3D). On Android
 * two things in react-viro 3.0.3 make this necessary:
 * - A node placed (or added to a parent) before the navigator's renderer exists crashes the app
 *   (VROPlatformGetJNIEnv: "sVM != nullptr"), and React creates a scene's nodes before the
 *   navigator itself. An empty scene has no nodes.
 * - The first scene added after the 3D view's GL start never gets its Viro context (the navigator
 *   only hands it over once a scene was added before), so it shows no models, camera or sky.
 *   The empty scene is that first scene; the room's scene comes second.
 */
export function WaitingScene() {
  return <ViroScene />;
}

export function RoomScene(props: { sceneNavigator?: { viroAppProps?: RoomSceneAppProps } }) {
  const store = props.sceneNavigator?.viroAppProps?.store;
  return <ViroScene>{store ? <SceneNodes store={store} /> : null}</ViroScene>;
}

function SceneNodes({ store }: RoomSceneAppProps) {
  const orbit = useStore(store, (s) => s.orbit);
  const meshes = useStore(store, (s) => s.meshes);
  const items = useStore(store, (s) => s.items);
  const t = sceneTransform(orbit);
  const eye = eyePosition(orbit);
  // The 3D view labels pieces whose model could not load (see Room3D).
  const onFailed = useCallback(
    (id: string, failed: boolean) =>
      store.set((s) => {
        if (s.failed.has(id) === failed) return s;
        const next = new Set(s.failed);
        if (failed) next.add(id);
        else next.delete(id);
        return { ...s, failed: next };
      }),
    [store],
  );
  return (
    <>
      <ViroNode position={t.push}>
        <ViroNode rotation={t.tilt}>
          <ViroNode rotation={t.turn}>
            <ViroNode position={t.shift}>
              <Lights meshes={meshes} />
              <Floor meshes={meshes} />
              {meshes.walls.map((wall) => (
                <Wall key={wall.id} wall={wall} faded={wallFacesCamera(wall, eye, 0.05)} />
              ))}
              {items.map((item) => (
                <Furniture key={item.id} item={item} onFailed={onFailed} />
              ))}
            </ViroNode>
          </ViroNode>
        </ViroNode>
      </ViroNode>
      <ViroCamera position={[0, 0, 0]} active fieldOfView={FIELD_OF_VIEW} />
      {/* The background: a large sphere around the camera, seen from inside. */}
      <ViroSphere
        radius={SKY_RADIUS}
        facesOutward={false}
        widthSegmentCount={16}
        heightSegmentCount={8}
        materials={['yvSky']}
        renderingOrder={-20}
        shadowCastingBitMask={0}
        lightReceivingBitMask={0}
      />
    </>
  );
}

/** Soft light all round, plus one light from above to one side that casts a shadow. */
const Lights = memo(function Lights({ meshes }: { meshes: RoomMeshes }) {
  const { min, max } = meshes.bounds;
  const extent = Math.max(max[0] - min[0], max[2] - min[2]) * 0.75 + 1;
  const dir: [number, number, number] = [0.35, -1, -0.45];
  const len = Math.hypot(...dir);
  const reach = extent * 2;
  const c = meshes.center;
  return (
    <>
      <ViroAmbientLight color="#ffffff" intensity={420} />
      <ViroDirectionalLight
        color="#ffffff"
        intensity={620}
        direction={dir}
        castsShadow
        shadowOpacity={0.32}
        shadowMapSize={2048}
        shadowOrthographicSize={extent * 2.2}
        shadowOrthographicPosition={[
          c[0] - (dir[0] / len) * reach,
          -(dir[1] / len) * reach,
          c[2] - (dir[2] / len) * reach,
        ]}
        shadowNearZ={0.1}
        shadowFarZ={reach * 2 + 4}
      />
    </>
  );
});

type GeometryProps = ReturnType<typeof toViroGeometryParts<string>>;

/** Core's index lists are one flat list per material, which is what Viro's renderers read. */
const indices = (g: GeometryProps) => g.triangleIndices as unknown as [number, number, number][];

const Floor = memo(function Floor({ meshes }: { meshes: RoomMeshes }) {
  const g = useMemo(
    () => toViroGeometryParts([{ mesh: meshes.floor, material: 'yvFloor' }]),
    [meshes],
  );
  if (!g.vertices.length) return null;
  return (
    <ViroGeometry
      vertices={g.vertices}
      normals={g.normals}
      texcoords={g.texcoords}
      triangleIndices={indices(g)}
      materials={g.materials}
      renderingOrder={-10}
      shadowCastingBitMask={0}
    />
  );
});

const Wall = memo(function Wall({ wall, faded }: { wall: WallMesh; faded: boolean }) {
  const g = useMemo(
    () =>
      toViroGeometryParts([
        { mesh: wall.panels, material: 'yvWall' },
        { mesh: wall.frames, material: 'yvFrame' },
        { mesh: wall.glass, material: 'yvGlass' },
      ]),
    [wall],
  );
  if (!g.vertices.length) return null;
  return (
    <ViroGeometry
      vertices={g.vertices}
      normals={g.normals}
      texcoords={g.texcoords}
      triangleIndices={indices(g)}
      materials={g.materials}
      opacity={faded ? FADED : 1}
      shadowCastingBitMask={faded ? 0 : 1}
    />
  );
});

/** The model's local file: from the phone's cache, downloaded first if needed. */
function useLocalModel(url: string | null): { uri: string | null; failed: boolean } {
  // On the phone already? (A quick file check, once per model.)
  const cached = useMemo(() => (url ? models.cached(url) : null), [url]);
  const [download, setDownload] = useState<{ url: string; uri: string | null } | null>(null);
  useEffect(() => {
    if (!url || cached) return;
    let live = true;
    models.get(url).then(
      (uri) => live && setDownload({ url, uri }),
      () => live && setDownload({ url, uri: null }),
    );
    return () => {
      live = false;
    };
  }, [url, cached]);
  if (!url) return { uri: null, failed: true };
  if (cached) return { uri: cached, failed: false };
  if (download?.url === url) return { uri: download.uri, failed: download.uri === null };
  return { uri: null, failed: false };
}

interface FurnitureProps {
  item: SceneItem;
  /** Told whether the piece's model could not load (a stable function). */
  onFailed?: (id: string, failed: boolean) => void;
}

const sameItem = (a: FurnitureProps, b: FurnitureProps) =>
  a.onFailed === b.onFailed &&
  a.item.id === b.item.id &&
  a.item.x === b.item.x &&
  a.item.y === b.item.y &&
  a.item.z === b.item.z &&
  a.item.rotationY === b.item.rotationY &&
  a.item.modelUrl === b.item.modelUrl &&
  a.item.label === b.item.label &&
  a.item.highlight === b.item.highlight &&
  a.item.size === b.item.size;

/**
 * A piece of furniture, true size, in the coordinates of the node it is in (room space in the 3D
 * view and in AR). Its helper parts (the box shown while loading or when the model is missing,
 * the selection mark) always exist and are shown or hidden: on Android, Viro nodes added to an
 * existing node do not always appear until that node changes again, while a changed `visible`
 * always shows. The model itself comes last, where a new child does appear.
 */
export const Furniture = memo(function Furniture({ item, onFailed }: FurnitureProps) {
  const { uri, failed: missing } = useLocalModel(item.modelUrl);
  const [loaded, setLoaded] = useState<string | null>(null);
  const [broken, setBroken] = useState<string | null>(null);
  const failed = missing || (uri !== null && broken === uri);
  const ready = uri !== null && loaded === uri && !failed;
  const { w, d, h } = item.size;

  // The label of a piece whose model cannot load is drawn by the view over the scene, where it
  // stays sharp and readable.
  useEffect(() => {
    onFailed?.(item.id, failed);
  }, [onFailed, item.id, failed]);

  return (
    <ViroNode position={[item.x, item.y, item.z]} rotation={[0, item.rotationY, 0]}>
      <ViroNode position={[0, h / 2, 0]} visible={!ready}>
        <ViroBox
          width={w}
          height={Math.max(h, 0.01)}
          length={d}
          materials={[failed ? 'yvMissing' : 'yvLoading']}
        />
      </ViroNode>
      <ViroNode position={[0, 0.02, 0]} visible={item.highlight !== 'none'}>
        <ViroQuad
          rotation={[-90, 0, 0]}
          width={w + 0.24}
          height={d + 0.24}
          materials={[item.highlight === 'invalid' ? 'yvInvalid' : 'yvSelected']}
          shadowCastingBitMask={0}
        />
      </ViroNode>
      {uri && !failed ? (
        <Viro3DObject
          key={uri}
          source={{ uri }}
          type="GLB"
          onLoadEnd={() => setLoaded(uri)}
          onError={() => setBroken(uri)}
        />
      ) : null}
    </ViroNode>
  );
}, sameItem);
