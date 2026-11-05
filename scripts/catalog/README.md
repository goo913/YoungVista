# Furniture catalog pipeline

Builds the furniture catalog that the phone app (ViroReact) and the website (three.js) load from
Firebase Hosting under `/catalog/`. Output goes to `apps/web/public/catalog/` and is committed;
CI never runs this pipeline.

| File | What it is |
|---|---|
| `catalog.json` | Matches `Catalog` in `packages/core/src/catalog.ts`. Paths are relative to `/catalog/`. |
| `models/{id}.glb` | One GLB per item. Colour variants: `models/{id}--{variant}.glb`. |
| `thumbs/{id}.webp` | 512 px WebP thumbnail, front three-quarter view. Variants: `thumbs/{id}--{variant}.webp`. |
| `credits.json` | Title, author, source link, licence, "modified: rescaled and optimised", plus where each size came from and how the front was checked. |

## Run it

Needs Node 24 and Google Chrome (`/Applications/Google Chrome.app`, or set `CHROME_PATH`).

```sh
npm --prefix scripts/catalog install          # first time only (own package and lockfile)
npm run catalog                               # from the repo root: build everything and validate
npm --prefix scripts/catalog run build -- --only sofa-velvet,rug-round --review
npm --prefix scripts/catalog run validate     # checks only, no rebuild
```

- `--only a,b` rebuilds those models and keeps the rest (they must have been built once).
- `--phase 1` limits the catalog to the first 15 models.
- `--review` also writes review sheets to `.cache/review/` (front, side, back, top and thumbnail
  views per model). Look at them before committing.
- Downloads are cached in `.cache/` (gitignored), so later runs are fast.

The run ends with two tables (the catalog, then the checks) and exits with an error if any check
fails.

## Add a model

1. Add an entry to `src/models.ts`: a new kebab-case `id` (saved in designs, never rename or reuse
   one), a neutral `name` (no brand or product-line names), `category`, `placement`, `source`, and
   a `front` note saying how the front was checked.
   - ABO: `{ kind: 'abo', id: '<3dmodel_id>' }`. Poly Haven: `{ kind: 'polyhaven', id: '<slug>' }`.
     Khronos: `{ kind: 'khronos', id: '<folder>' }` (also add a size note in `src/sources.ts`).
   - Colour options: `baseVariant` names the item's own look; each entry in `variants` is either
     another ABO model of the same product in another colour (`{ abo: '<id>' }`) or a
     `KHR_materials_variants` name in the source (`{ khrVariant: '<name>' }`). Each becomes its
     own GLB, so only add variants that look clearly different.
2. Run `npm --prefix scripts/catalog run build -- --only <id> --review` and look at the review sheet
   and thumbnail. If the front is not facing the camera in the front view, set `rotateY`.
3. Commit the changed files under `apps/web/public/catalog/` with `src/models.ts`.

Hosting caches `/catalog/` files for a year (`catalog.json` for 5 minutes). Once a model is live,
publish a changed model under a new id rather than overwriting its file.

## Rules the pipeline enforces

- **Licences.** Only CC0 1.0 and CC BY 4.0. Each build re-reads the official pages: the ABO page
  must still say CC BY 4.0 with credit to "Amazon.com", Poly Haven's licence page must still say
  CC0, and each Khronos model's `metadata.json` (pinned commit) must list only CC0 or CC BY 4.0.
  Credits go into `catalog.json` (`license`, `credit`, `sourceUrl`), `credits.json` and each
  GLB's `asset.copyright`.
- **Size and placement.** Metres, Y up, origin at the centre of the footprint on the floor
  (min y = 0, x and z centred), front facing +Z. Each model is scaled to its listed real size:
  the ABO product listing, the Poly Haven API `dimensions`, or for Khronos models the size the
  source states it was built at. Listing labels are unreliable, so the three listed values are
  matched to the model's axes by best fit. A model is rejected if that would stretch it more than
  5% on any axis (changes of 5 mm or less aside) or rescale it more than 10% overall; pick
  another model then. `credits.json` records where each size came from.
- **Front.** Seats and beds are checked automatically (the top 40% of the surface must sit behind
  the centre). Everything else is checked by eye on the review sheet.
- **ViroReact.** ViroCore's glTF loader reads only `TEXCOORD_0`, ignores `KHR_texture_transform`
  and adds `KHR_lights_punctual` lights to the scene. So every GLB is core glTF 2.0 with no
  extensions: one variant is picked from `KHR_materials_variants`, lights, cameras and animation
  are removed, texture transforms are baked into the UVs or the texture, a second UV set is moved
  to the first (textures tiled on another layout are flattened to their average colour), sheen is
  blended into the base colour and transmission becomes alpha (glass) or opaque. Alpha blending
  sorts badly, so a BLEND material whose alpha is really on/off becomes MASK (or OPAQUE when
  nothing is transparent); avoid models that need real blending over the whole object. Never use Draco,
  meshopt, KTX2/Basis, WebP or AVIF textures, or quantised attributes.
- **Budgets.** Textures 1024 px or less, JPEG (PNG only when alpha is really used). About 50k
  triangles or less (plants 30k), simplified with meshoptimizer when needed. Aim for about 1 MB
  per GLB; the hard limits are 3 MB per GLB and 60 MB for everything under `/catalog/`.
  Thumbnails 60 KB or less.

## Checks (any failure fails the build)

Per GLB: Khronos glTF-Validator reports zero errors; the bounding box matches the listed size
within 1 cm; min y = 0 and the footprint is centred within 1 mm; triangle count; file size; no
banned extensions; JPEG/PNG textures of 1024 px or less and a single UV set; the thumbnail
exists. Then `catalog.json` must parse, pass a runtime shape check (keys, categories, files
exist) and type-check as an object literal that `satisfies Catalog`.

## For the app and website

- Load `/catalog/catalog.json`, then `model` and `thumb` relative to `/catalog/`.
- `variants[0]` is the item's own look (no `model`); the others carry their own `model` and
  `thumb`. A design item's `variant` holds a variant `id`; when it is missing or unknown, use the
  item's `model`.
- Models face +Z with the origin on the floor, so place them at `(x, 0, z)` and turn them by
  `rotationY`; never scale them.
- Normal maps ship without tangents; ViroReact and three.js compute them at load.
