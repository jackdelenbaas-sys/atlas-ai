# Atlas action integration guide

Atlas's permanent home is https://jackdelenbaas-sys.github.io/atlas-ai/ (repository jackdelenbaas-sys/atlas-ai). All 20 original Mixamo FBX files and the GLB human are hosted on the public Atlas Motion Library asset service. The single registry is `assets/motions.json`.

## Adding a new action
1. Upload the original user's FBX to the Atlas Motion Asset Pipeline's hosted assets. `With Skin` files are supported; no Blender conversion or user Safari import is necessary.
2. Copy the immutable, absolute public URL into `assets/motions.json` as exactly one uniquely named motion (avoid duplicate content and names).
3. To use it in a surprise sequence, register the motion name under the appropriate `ACTION_LIBRARY` category in root `index.html`; add sequence steps to `SHOW_LIBRARY` if useful. The action selector automatically lists every motion in the registry.
4. Update the displayed version using Atlas patch numbering: 4.9.7 -> 4.9.8 -> 4.9.9 -> 5.0.
5. Verify all paths load, scripts parse, and the actual model rig moves appropriately.

## Crucial rigging fix (4.9.7)
The original `model.glb` has 73 bones, a normal body height around 1.81 meters, and different local bind orientations from Mixamo's FBX rig. **Never copy Mixamo absolute bone rotations or use naive SkeletonUtils.retargetClip here**. That inverted the original leg bones and put the character's feet above his head.

The production `importMotion` uses FBXLoader tracks on all 52 matching Mixamo bones and recalculates every quaternion as:

`AtlasRestQuaternion * inverse(SourceRestQuaternion) * SourceAnimationQuaternion`

It also preserves vertical hip offsets relative to each rig's rest position. This preserves the original lengths and bone orientations. The animation mixer must target the actual `THREE.SkinnedMesh` and use `.bones[BoneName].quaternion` (and the Hips position) tracks. Camera and stage travel happen on the outer model group, not by moving the Mixamo hip horizontally.

Test the motions on the real original GLB, especially idle, walk, pointing, hip-hop dance, and floor animations. Check the foot/hip world coordinates at multiple animation times. The body must never lose its legs in an idle pose.

## Resilience and startup
The original GLB loads automatically from the motion registry and is cached in IndexedDB when available. The animation files load on demand; the core idle/walk/wave/point/dance files are parsed first and all original FBX binaries are downloaded into the browser's CacheStorage asynchronously. No user-side import is needed for hosted actions. Settings has a **Reset Atlas body and animations** button to recover the full rig when needed.

GitHub Pages hosts the app; the Floot Atlas Motion Asset Pipeline project only serves binary assets. Maintain the original site URL and preserve chat history and the split-pane controls.
