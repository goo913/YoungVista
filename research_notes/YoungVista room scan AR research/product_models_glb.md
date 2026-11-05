# Product 3D models for the YoungVista demo: sources, starter set, GLB vs USDZ, asset pipeline, metadata, AI generation

Research date 2026-11-05. **"Verified"** means read on a primary page or **measured by this researcher** on files downloaded today (marked *[own measurement]*). **"Inference"** means my reasoning. Measurement method: I parsed the glTF JSON/GLB files, applied node transforms, and computed world-space bounding boxes, triangle counts and backrest position. For ABO I joined the 3D-model CSV with the product-listing JSON and compared model extents with the listed product dimensions.

---

## 1. Which free/open sources can YoungVista use? (license, commercial use, attribution, redistribution in an app, formats, realism, scale, size)

### Takeaway
Three sources are both **commercially usable** and **realistic** enough for a convincing demo:
- **Amazon Berkeley Objects (ABO).** CC BY 4.0. About 7,950 PBR GLBs of real retail furniture, at real-world scale in meters.
- **Poly Haven.** CC0. 85 furniture models, photoreal but leaning vintage, rustic or worn.
- **Khronos glTF Sample Assets.** About a dozen home items from Wayfair and DGG, each CC0 or CC BY 4.0. Best-in-class materials, including built-in color variants.

The other sources fall short for one of these reasons:
- **Low-poly:** Kenney, Quaternius, Poly Pizza.
- **Licenses vary model by model:** Sketchfab, Objaverse.
- **Research or non-commercial only:** 3D-FUTURE, the NC slice of Objaverse.
- **License forbids shipping open-format files to end users:** TurboSquid, CGTrader, BIM/manufacturer libraries, IKEA.

### Cited Findings

**Summary table** (details and citations in the bullets below)

| Source | License → commercial? / attribution? | Redistribute inside app? | Formats | Realism | Real-world scale? | ~Furniture models | Demo verdict |
|---|---|---|---|---|---|---|---|
| **ABO (Amazon)** | CC BY 4.0 → commercial **yes**, attribution **required** ("Amazon.com") | Yes, with attribution. No added restrictions allowed | glTF 2.0 `.glb`, PBR (2K–4K textures) | Photoreal retail products | **Yes** (meters, Y-up, origin at floor) | 7,953 models (furniture-heavy) | **Primary source** |
| **Poly Haven** | CC0 → commercial **yes**, attribution **no** | Yes, explicitly | `.blend`, glTF (`.gltf`+`.bin`+JPG, 1k–8k), USD, FBX | Photoreal PBR, often vintage/worn | **Yes** (39/40 checked) | 85 furniture, 57 plants, 29 lighting | **Primary CC0 source** |
| **Khronos glTF Sample Assets** | Per model: CC0 or CC BY 4.0 | Yes (CC) | glTF, GLB (some KTX2/Draco variants) | Showcase-grade PBR (sheen, transmission, variants) | **Yes** | ~12 home/furniture items | **Hero items + color-variant demo** |
| Kenney Furniture Kit | CC0 | Yes | GLB per Kenney KB (kit page lists none) | Low-poly, stylized | n/a | 140 files (v1.0, 2018) | Prototyping only |
| Quaternius | CC0 | Yes (CC0) | `.blend`, FBX | Low-poly | n/a | No furniture pack named | Not suitable |
| Poly Pizza | CC0 or CC-BY per model (third-party info) | Per license | GLB/glTF, OBJ | Low-poly | n/a | >10,000 models of all kinds | Not suitable |
| Sketchfab | Per model: CC BY / BY-SA / BY-NC / CC0 …, or Standard | CC-BY yes with credit; NC no; API needs end-user login | Download API: glTF, GLB, USDZ | Varies widely | Not guaranteed | 700K+ downloadable CC models (all categories) | Case by case, with vetting |
| Objaverse 1.0 / XL | Dataset ODC-By; per-object CC mix incl. NC | Per object | Mixed | Varies | Not guaranteed | 800K+ / 10M+ objects (all kinds) | Research/AI use, not a catalog |
| 3D-FUTURE (Alibaba) | **Research-only**, no commercialization | **No** | n/a | High | n/a | 9,992 (or 16,563, see below) | **Blocked** |
| Blendkit (formerly BlenderKit) | Royalty Free (commercial OK, no credit, **no resale "in the same form"**) or CC0 | RF: unclear/risky. CC0: yes | Blender-native (inference) | High | n/a | Unknown | CC0 subset only |
| TurboSquid (incl. free) | Royalty-free, **with closed-format rule for apps** | **No** for GLB/USDZ shipped to devices or web | Many | High | n/a | n/a | **Avoid** |
| CGTrader (incl. free) | Royalty Free (secondary sources: closed-format requirement) | Likely no | Many | High | n/a | n/a | Avoid unless verified |
| Smithsonian Open Access | CC0 (per item) | Yes | OBJ, glTF/GLB | Photogrammetry of artifacts | Mostly | 2,000+ 3D models (2020), mostly artifacts | Not relevant |
| Google Scanned Objects | CC BY 4.0 | Yes | Gazebo/Bullet-ready | Photoreal scans | Yes | 1,030 household items, **no furniture** | Small décor only |
| BIMobject / manufacturer BIM | EULA + manufacturer terms; non-transferable | Generally no | Revit/IFC/CAD | CAD-accurate | Yes | n/a | Only via partnership |
| IKEA / Wayfair official | No open program found | No | n/a | n/a | n/a | n/a | Only via partnership |

**ABO (Amazon Berkeley Objects)**
- The official page describes "A CC BY 4.0-licensed dataset of Amazon products with metadata, catalog images, and 3D models". The archive ships `LICENSE-CC-BY-4.0.txt` — [ABO](https://amazon-berkeley-objects.s3.amazonaws.com/index.html)
- Attribution: "Credit for the data, including all images and 3D models, must be given to: Amazon.com" — [ABO](https://amazon-berkeley-objects.s3.amazonaws.com/index.html)
- License terms quoted on the same page:
  - "You must give appropriate credit, provide a link to the license, and indicate if changes were made".
  - "No additional restrictions — You may not apply legal terms or technological measures that legally restrict others from doing anything the license permits" — [ABO](https://amazon-berkeley-objects.s3.amazonaws.com/index.html)
- Content: "high-quality 3D models with 4K texture maps for physically based rendering for more than 7'900 products … in the standard glTF 2.0 format". Materials are base color, metallic and roughness. The page covers 147,702 products overall. The full 3D archive is 154 GB — [ABO](https://amazon-berkeley-objects.s3.amazonaws.com/index.html)
- *[own measurement]* `3dmodels.csv.gz` lists **7,953 models**, linked to **7,960 listings**.
  - Product types among listings that have 3D: CHAIR 1,184 · SOFA 859 · RUG 817 · WALL_ART 599 · TABLE 584 · LAMP 345 · STOOL_SEATING 340 · OTTOMAN 288 · PILLOW 275 · HEADBOARD 206 · PLANTER 182 · DESK 145 · BED 140 · CABINET 137 · HOME_MIRROR 109 · SHELF 106 · DRESSER 62 · BED_FRAME 52.
  - There are **no artificial-plant models** and no true kitchen base cabinets (only shoe cabinets and sideboards).
  - Sources: [3dmodels.csv.gz](https://amazon-berkeley-objects.s3.amazonaws.com/3dmodels/metadata/3dmodels.csv.gz), [listings metadata](https://amazon-berkeley-objects.s3.amazonaws.com/listings/metadata/listings_0.json.gz)
- *[own measurement]* **Scale.** I compared model extents (meters) with listed product dimensions (inches), sorting the axes on both sides.
  - 5,198 of 7,792 comparable items (67%) were within ±15% on all three axes.
  - The median ratio was **1.001** (p10 0.955, p90 1.463), so models are authored in meters at real size.
  - The outliers look like listing-data issues. The listing fields are inconsistently labeled: e.g., the "height" field holds 95" for a 93"-wide sofa — [ABO listings](https://amazon-berkeley-objects.s3.amazonaws.com/listings/metadata/listings_0.json.gz)
- *[own measurement]* Two GLBs inspected:
  - The Rivet sofa B072C8Q9RF is 4.1 MB with 2K JPEG/PNG textures. The Alkove nightstand B07K7K7GTZ is **30.6 MB** with 4K PNG textures.
  - Both are Y-up with the origin at floor center (minY = 0), and the sofa's front faces **+Z**.
  - The S3 metadata files are dated June 2021, so the products may be discontinued.
  - Direct GLB URL pattern: `https://amazon-berkeley-objects.s3.amazonaws.com/3dmodels/original/<path>` (HTTP 200 verified) — [ABO](https://amazon-berkeley-objects.s3.amazonaws.com/index.html)

**Poly Haven**
- License: "Our assets are all licensed as CC0".
  - "You can use our assets for any purpose, including commercial work".
  - "You do not need to give credit".
  - Redistribution is explicitly allowed, including inside "a product you sell".
  - The site ToS §3.2 bars "Web scraping or data mining without express permission", and the API has its own terms — [Poly Haven license](https://polyhaven.com/license)
- *[own measurement via the public API]* 521 models in total. Of these, 85 are in the "furniture" category (seating 34, table 27, shelves 16, bed 3), 57 are "plants" (6 "potted plants") and 29 are "lighting". Each asset lists `dimensions` (mm) and `polycount` — [Poly Haven API](https://api.polyhaven.com/assets?t=models)
- Download formats per model: `blend`, `gltf` (`.gltf` + `.bin` + JPG textures at 1k/2k/4k/8k), `usd`, `fbx`, plus loose texture maps — [Poly Haven files API (sofa_03)](https://api.polyhaven.com/files/sofa_03)
- *[own measurement]* glTF bounding boxes for 40 furniture and plant models: all are Y-up, centered, with the origin at the floor (minY ≈ 0), and 39/40 match the listed real dimensions. Exceptions:
  - **`steel_frame_shelves_01` exports 10× too large** (10.97 × 21.4 × 5.0 m against a listed 110 × 50 × 214 cm).
  - `wooden_display_shelves_01` and `modern_coffee_table_01` are rotated 90° about the vertical axis relative to the listed dimension order.
  - Sources: [Poly Haven API](https://api.polyhaven.com/assets?t=models), [steel_frame_shelves_01](https://polyhaven.com/a/steel_frame_shelves_01)
- *[own measurement]* Facing: `sofa_03` and `ArmChair_01` both have the backrest at −Z, so the front faces **+Z**, the same as ABO and Khronos — [sofa_03](https://polyhaven.com/a/sofa_03)

**Khronos glTF Sample Assets.** Licenses come from each model's README.

| Model | License / owner | Origin notes |
|---|---|---|
| SheenChair | **CC0** (© 2020 Wayfair) | Fabrics matched to a real Wayfair slipper chair — [README](https://github.com/KhronosGroup/glTF-Sample-Assets/blob/main/Models/SheenChair/README.md) |
| GlamVelvetSofa | **CC BY 4.0** (© 2021 Wayfair) | "represents a real product, a velvet sofa bed" (Mercer41 Frankie 86") — [README](https://github.com/KhronosGroup/glTF-Sample-Assets/blob/main/Models/GlamVelvetSofa/README.md) |
| ChairDamaskPurplegold | CC BY 4.0 (© 2021 Wayfair) | — [README](https://github.com/KhronosGroup/glTF-Sample-Assets/blob/main/Models/ChairDamaskPurplegold/README.md) |
| SheenWoodLeatherSofa | CC BY 4.0 (© 2024 Darmstadt Graphics Group) | "The original is available from Polyhaven" (sofa_03, CC0). **Requires** `EXT_texture_webp` — [README](https://github.com/KhronosGroup/glTF-Sample-Assets/blob/main/Models/SheenWoodLeatherSofa/README.md) |
| SpecularSilkPouf | CC BY 4.0 (© 2023 Wayfair) | — [README](https://github.com/KhronosGroup/glTF-Sample-Assets/blob/main/Models/SpecularSilkPouf/README.md) |
| IridescenceLamp | CC BY 4.0 (© 2022 Wayfair) | Real "Bonsell 19" Table Lamp" — [README](https://github.com/KhronosGroup/glTF-Sample-Assets/blob/main/Models/IridescenceLamp/README.md) |
| StainedGlassLamp | CC BY 4.0 (© 2021 Wayfair) | — [README](https://github.com/KhronosGroup/glTF-Sample-Assets/blob/main/Models/StainedGlassLamp/README.md) |
| AnisotropyBarnLamp | CC BY 4.0 (© 2023 Wayfair) | — [README](https://github.com/KhronosGroup/glTF-Sample-Assets/blob/main/Models/AnisotropyBarnLamp/README.md) |
| LightsPunctualLamp | CC BY 4.0 (© 2021 DGG) | — [README](https://github.com/KhronosGroup/glTF-Sample-Assets/blob/main/Models/LightsPunctualLamp/README.md) |
| DiffuseTransmissionPlant | CC BY 4.0 (© 2024 DGG) | "The original model is available from Polyhaven" (potted_plant_02, CC0) — [README](https://github.com/KhronosGroup/glTF-Sample-Assets/blob/main/Models/DiffuseTransmissionPlant/README.md) |
| GlassVaseFlowers | **CC0** | — [README](https://github.com/KhronosGroup/glTF-Sample-Assets/blob/main/Models/GlassVaseFlowers/README.md) |
| ClearcoatWicker | **CC0** | — [README](https://github.com/KhronosGroup/glTF-Sample-Assets/blob/main/Models/ClearcoatWicker/README.md) |

- *[own measurement]* Scale is real-world:
  - GlamVelvetSofa is **2.188 m** wide, matching the real 86" (2.18 m) product. IridescenceLamp is 0.476 m tall, matching the real 19" (0.48 m) lamp. Every floor item has minY = 0.
  - GlamVelvetSofa (4,196 triangles) and SheenChair (39,936) both use `KHR_materials_variants`.
  - Source: [model-index.json](https://github.com/KhronosGroup/glTF-Sample-Assets/blob/main/Models/model-index.json)

**Kenney, Quaternius, Poly Pizza (low-poly)**
- Kenney Furniture Kit: "Creative Commons CC0", 140 files, version 1.0 "Released in 2018". The page lists no file formats — [Kenney Furniture Kit](https://kenney.nl/assets/furniture-kit)
- Kenney's knowledge base says its glTF models come packaged as GLB — [Kenney KB](https://kenney.nl/knowledge-base/game-assets-3d/importing-3d-models-into-game-engines)
- Quaternius: "All models are under the CC0 License", free for commercial use without attribution. Files are `.blend` and FBX — [Quaternius FAQ](https://quaternius.com/faq.html)
- Poly Pizza:
  - Per third-party guides only: >10,000 low-poly models under CC0 and CC-BY (per-model license), GLB/OBJ downloads, and it includes the archived Google Poly collection — [Cinevva guide (2026)](https://app.cinevva.com/guides/game-assets-guide.html); [GameFromScratch](https://gamefromscratch.com/poly-pizza-a-replacement-to-google-poly/)
  - Its FAQ URL returned 404 and its press page did not parse — [Poly Pizza press](https://poly.pizza/docs/press)

**Sketchfab**
- "More than 700,000 3D models are available for download under Creative Commons licenses"; "Most models allow commercial use" — [Download API guidelines](https://sketchfab.com/developers/download-api/guidelines)
- Download API rules:
  - Formats: "Models are available in glTF, GLB, and USDZ formats". Source formats (FBX/OBJ) are not available via the API.
  - "Downloading models requires users to be authenticated with a Sketchfab account". Contact Sketchfab for downloads without end-user login — [Download API](https://sketchfab.com/developers/download-api)
- Attribution duties under the API agreement:
  - §4.6: end-user authentication is required unless there is "a specific agreement in place with Sketchfab".
  - §4.7: "your app must provide attribution to the original creator" and "must clearly display the Creative Commons license"; for user-distributed creations, "the original creator attribution must be accessible to all end users".
  - §4.5: "should clearly mention that downloadable models are provided by Sketchfab".
  - Guidelines: "The Creative Commons license and attribution must follow the asset everywhere it is used" — [API agreement](https://sketchfab.com/developers/terms); [guidelines](https://sketchfab.com/developers/download-api/guidelines)
- **Ownership change, flagged as recent:**
  - KitBash (owner of KitBash3D and Greyscalegorilla) bought Sketchfab and ArtStation from Epic Games. The deal was announced around 10 Aug 2026. Fab is not included, and pricing and logins are said to continue for now — [Epic Games news](https://www.epicgames.com/site/news/kitbash-acquires-artstation-and-sketchfab?lang=en-ca); [Game Developer](https://www.gamedeveloper.com/business/epics-sells-artstation-and-sketchfab-to-kitbash); [Digital Production, 12 Aug 2026](https://digitalproduction.com/2026/08/12/kitbash-buys-artstation-and-sketchfab/)
  - The API agreement footer now reads "© 2026, KitBash SF Operations LLC" — [API agreement](https://sketchfab.com/developers/terms)
- Uploaders choose Sketchfab's Standard License or a CC option. CC BY-NC blocks commercial use — [Sketchfab help](https://help.sketchfab.com/en/articles/16152220)

**Objaverse / Objaverse-XL**
- Objaverse 1.0:
  - "The use of the dataset as a whole is licensed under the ODC-By v1.0 license", with 800K+ objects. Per-object licenses: CC-BY 4.0 721K · CC-BY-NC 4.0 25K · CC-BY-NC-SA 4.0 52K · CC-BY-SA 4.0 16K · CC0 3.5K.
  - "The metadata will provide the license for each object" — [Objaverse README](https://huggingface.co/datasets/allenai/objaverse/blob/main/README.md)
- Objaverse-XL: 10M+ objects with ODC-By as the umbrella license, but per-object terms vary. The Polycam-sourced subset is limited to non-commercial academic research — [Objaverse-XL README](https://huggingface.co/datasets/allenai/objaverse-xl/blob/main/README.md); [arXiv 2307.05663](https://arxiv.org/abs/2307.05663)
- Caveat raised by 3DVF: many CC-labeled 3D uploads may not actually be validly CC-licensed — [3DVF](https://3dvf.com/en/ai-this-massive-dataset-of-3d-objects-is-a-game-change-heres-why-it-may-include-some-of-your-3d-assets/)

**3D-FUTURE (Alibaba): blocked**
- License "Version: March 28, 2020", with Tao Bao (China) Software Co. The grant covers use "for scientific research purpose only".
- Prohibitions: "You shall not commercialize the data sets"; no use of derivatives or results "for commercialization or providing external services"; "You shall not distribute … to any third party" — [3D-FUTURE license](https://terms.aliyun.com/legal-agreement/terms/suit_bu1_ali_cloud/suit_bu1_ali_cloud202004171628_60052.html)
- Counts conflict. The abstract gives "9,992 unique detailed 3D instances of furniture with high-resolution textures", while the Google Scanned Objects paper's table lists 3D-Future with 16,563 objects — [arXiv 2009.09633](https://arxiv.org/abs/2009.09633); [GSO paper](https://ar5iv.labs.arxiv.org/html/2204.11918)

**Blendkit (formerly BlenderKit)**
- The footer now reads "© 2026 Blendkit (formerly known as BlenderKit)". There are two licenses:
  - **Royalty Free** "allows commercial use without mentioning the author", but re-sale "of the asset in the same form" is barred, and RF "doesn't allow to re-sell 3D models even if modified".
  - **CC0**.
- Redistribution inside apps or web viewers is not addressed — [Blendkit licenses](https://www.blendkit.com/docs/licenses/)

**TurboSquid / CGTrader (royalty-free marketplaces)**
- TurboSquid license clauses (free downloads count as a "Purchase" under the same terms, "3D Models acquired at free-of-charge are not indemnified") — [TurboSquid license explainer](https://blog.turbosquid.com/turbosquid-3d-model-license/):
  - Apps are allowed only where the model "must be contained in proprietary formats so that they cannot be opened or imported … or extracted without reverse engineering".
  - Excluded: "Any other open format or format encrypted with decryptable open standards"; "Redistributing or otherwise making TurboSquid 3D Models available to end-users"; and Creations with "general functionality for importing and/or exporting 3D Models".
  - WebGL is allowed only for Unity, Unreal and Lumberyard builds.
- CGTrader: secondary sources only. Royalty-free models must be embedded in a larger project in a closed format — [license comparison](https://licenseorg.com/compare/cgtrader-vs-turbosquid); [CGTrader forum](https://cgtrader.com/forum/general-discussions/can-i-download-royalty-free-models-and-publish-them-in-my-scene-in-a-youtube-video)

**Smithsonian / Google Scanned Objects**
- Smithsonian: the Open Access page says the CC0-marked 3D objects are free to download, change and redistribute for any purpose (paraphrased from a search summary). Formats are OBJ or glTF. About 2,000+ 3D models were released in 2020, mostly cultural-heritage artifacts. The 2020 figures may be outdated — [3d.si.edu Open Access highlights](https://3d.si.edu/collections/openaccesshighlights); [CG Channel, Mar 2020](https://www.cgchannel.com/2020/03/get-2000-free-3d-models-from-the-smithsonian-collection/)
- Google Scanned Objects: "1030 scanned objects … totalling 13Gb, licensed under the CC-BY 4.0 License". These are "household items", not furniture, preprocessed for Gazebo and Bullet — [GSO paper](https://ar5iv.labs.arxiv.org/html/2204.11918); [arXiv 2204.11918](https://arxiv.org/abs/2204.11918)

**BIMobject / manufacturers / IKEA / Wayfair**
- BIMobject's EULA (effective 27 Sep 2024) could not be read beyond its opening clauses — [BIMobject EULA](https://business.bimobject.com/terms-of-service-eula)
- Manufacturer BIM licenses are typically free but revocable and non-transferable, with no sublicensing — [Saint-Gobain BIM licence](https://bimlibrary.saint-gobain.com/en/south%20africa/licence); [Wavin terms](https://eu-assets.contentstack.com/v3/assets/blt573fdbfcb1106c2a/blt9492b29f74d3c24c/646eeee897949e2d758b4423/180924_Standard_Licence_Terms.pdf)
- IKEA: I found no open or developer 3D-model program.
  - IKEA Kreativ was built by Geomagical Labs, an IKEA subsidiary (2022) — [Webrazzi 2022](https://webrazzi.com/2022/06/24/ikea-kreativ-yapay-zeka-ve-3d-karma-gerceklik-destekli-tasarim-araci/)
  - The IKEA Kitchen Planner license restricts transfer to third parties — [IKEA Kitchen Planner license](https://www.ikea.com/au/en/customer-service/license-agreement-for-the-ikea-kitchen-planner-puba6cf9be0)
  - Informal 2014 forum guidance says to avoid IKEA names and exact replicas — [Sweet Home 3D forum](https://www.sweethome3d.com/support/forum/printpost_post,22942)
- Wayfair's only open models are its Khronos donations listed above.

### Inferences
- **Recommended mix for the demo:** ABO for most "real product" SKUs, Poly Haven (CC0) to fill gaps without attribution, and Khronos/Wayfair for one or two hero items that show off color variants.
  - This covers every requested category except a fitted kitchen base cabinet and a modern houseplant (see Q2 gaps).
- **Attribution and licensing practice**
  - A CC BY item (ABO, most Khronos models, any Sketchfab CC-BY model) needs an in-app and web "3D model credits" screen: author, source, license link, and a "modified" note.
  - Keep a per-asset license ledger.
  - ABO's "no additional restrictions" term means YoungVista should not wrap CC-BY assets in DRM or in terms that forbid users from reusing the models.
- **Trademarks are not covered.** CC licenses cover copyright in the 3D files, not trademarks or brand names.
  - This is the standard CC BY 4.0 term, §2(b)(2) "Patent and trademark rights are not licensed", not re-fetched in this session — [CC BY 4.0 legal code](https://creativecommons.org/licenses/by/4.0/legalcode).
  - In the demo, give ABO and Wayfair items neutral names (e.g., "Midtown 3-seat sofa") and don't present Amazon or Wayfair brands as partners.
- **Avoid for a launchable product:** 3D-FUTURE, the NC slices of Objaverse and Sketchfab, TurboSquid/CGTrader (GLB/USDZ are open, extractable formats), BIM/manufacturer files without a contract, and IKEA lookalikes.
- **Blendkit royalty-free assets are a grey area.** A GLB sent to a phone is extractable, which arguably amounts to redistributing the asset "in the same form". Use only Blendkit's CC0 assets unless Blendkit confirms otherwise.
- **Sketchfab:** the end-user-login rule applies to fetching models through the API inside the app. For a fixed preset catalog, the team would curate and download models once, and then each model's CC license governs redistribution. Confirm this with Sketchfab's ToS and the new owner (KitBash).

### Gaps
- No primary Poly Pizza license page was found (FAQ 404), and Kenney's kit file formats are unconfirmed.
- CGTrader's primary license text was not retrieved. The BIMobject EULA body was not retrievable.
- I could not get furniture-specific counts for Sketchfab, Objaverse or Smithsonian. Sketchfab's search API was not queried.
- Whether Sketchfab's Standard License allows shipping the file in an open format inside an app is unknown.
- Poly Haven's API terms of use, which matter for bulk downloads, were not read.

---

## 2. Curated starter set: 40 specific models (sofas, cabinets, beds, tables and the other requested categories)

### Takeaway
The 40 models below cover all 19 requested categories with realistic PBR assets at verified real-world scale (except where flagged). Each pick is either CC0 (Poly Haven, SheenChair) or CC BY 4.0 (ABO, credit "Amazon.com"; Khronos, credit Wayfair/DGG). Main cleanup:
- Downscale ABO's 4K textures.
- Decimate the Poly Haven plants.
- Repack Poly Haven `.gltf` files into GLB.
- Rotate one coffee table.
- Fill the kitchen-cabinet gap differently.

### Cited Findings

Sizes are W × H × D in meters (glTF X × Y × Z, front faces +Z), *[own measurement]* from the GLB/glTF bounding box or ABO extents. "Tris" is the triangle count.

**Links:**
- ABO GLBs: `https://amazon-berkeley-objects.s3.amazonaws.com/3dmodels/original/<path>` — license from [ABO](https://amazon-berkeley-objects.s3.amazonaws.com/index.html).
- Poly Haven: `https://polyhaven.com/a/<id>`, CC0 — [license](https://polyhaven.com/license).
- Khronos: `https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/<Name>`.

| # | Category | Model (source, ID) | Link | License | Size W×H×D (m) | Tris | Notes |
|---|---|---|---|---|---|---|---|
| 1 | 3-seat sofa | Rivet "Midtown" upholstered sofa 92.1"W, charcoal (ABO B072C8Q9RF) | [GLB](https://amazon-berkeley-objects.s3.amazonaws.com/3dmodels/original/F/B072C8Q9RF.glb) | CC BY 4.0 | 2.31×0.79×0.97 | 7,024 | 4.1 MB, 2K textures. **Verified to convert to RealityKit-valid USDZ** (Q4) |
| 2 | 3-seat sofa | Stone & Beam "Westcott" 93" sofa, Haze (ABO B07HYY8ZGY) | [GLB](https://amazon-berkeley-objects.s3.amazonaws.com/3dmodels/original/Y/B07HYY8ZGY.glb) | CC BY 4.0 | 2.42×0.87×0.97 | 15,422 | Same model in Silver ([B07HZ65Q43](https://amazon-berkeley-objects.s3.amazonaws.com/3dmodels/original/3/B07HZ65Q43.glb)) and Flannel ([B07HZ6LVGP](https://amazon-berkeley-objects.s3.amazonaws.com/3dmodels/original/P/B07HZ6LVGP.glb)), a ready-made colorway demo |
| 3 | Sofa / sofa bed | GlamVelvetSofa (Khronos/Wayfair) | [repo](https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/GlamVelvetSofa) | CC BY 4.0 © Wayfair | 2.19×0.79×1.02 | 4,196 | Real 86" product. **`KHR_materials_variants` colors built in**, plus velvet sheen |
| 4 | Sofa (leather, large) | sofa_03 (Poly Haven) | [page](https://polyhaven.com/a/sofa_03) | CC0 | 2.73×1.12×0.93 | 8,004 | Original of Khronos SheenWoodLeatherSofa (CC BY, 46K tris, needs WebP) |
| 5 | Sectional | Rivet "Revolve" sofa + reversible chaise 80"W (ABO B072FVHRZ1) | [GLB](https://amazon-berkeley-objects.s3.amazonaws.com/3dmodels/original/1/B072FVHRZ1.glb) | CC BY 4.0 | 2.05×0.96×1.67 | 33,024 | L-shape (1.67 m deep). The chaise side is fixed in the mesh; mirror it for the other hand |
| 6 | Sectional | Stone & Beam "Genesse" sectional 91"W (ABO B07HZ7X963) | [GLB](https://amazon-berkeley-objects.s3.amazonaws.com/3dmodels/original/3/B07HZ7X963.glb) | CC BY 4.0 | 2.34×0.93×0.99 | 28,632 | 0.99 m deep, so check visually that it reads as a sectional |
| 7 | Armchair | Rivet "Berkshire" accent chair 37"W (ABO B07B4GZ675) | [GLB](https://amazon-berkeley-objects.s3.amazonaws.com/3dmodels/original/5/B07B4GZ675.glb) | CC BY 4.0 | 1.03×0.86×0.80 | 9,548 | 2K textures |
| 8 | Armchair | Rivet "Charlotte" mid-century accent chair 29"W (ABO B0746H4BNS) | [GLB](https://amazon-berkeley-objects.s3.amazonaws.com/3dmodels/original/S/B0746H4BNS.glb) | CC BY 4.0 | 0.76×0.96×0.81 | 8,306 | Dusty Rose variant [B0746GYJJD](https://amazon-berkeley-objects.s3.amazonaws.com/3dmodels/original/D/B0746GYJJD.glb) |
| 9 | Armchair (slipper) | SheenChair (Khronos/Wayfair) | [repo](https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/SheenChair) | **CC0** © Wayfair | 0.83×0.69×0.57 | 39,936 | Fabric variants via `KHR_materials_variants`. ChairDamaskPurplegold uses the same shape (CC BY, 9,984 tris) |
| 10 | Armchair (classic) | ArmChair_01 (Poly Haven) | [page](https://polyhaven.com/a/ArmChair_01) | CC0 | 0.85×1.07×0.77 | 5,626 | Victorian style |
| 11 | Bed (queen) | Rivet mid-century leather-headboard queen platform bed 65"W (ABO B075X2CVQK) | [GLB](https://amazon-berkeley-objects.s3.amazonaws.com/3dmodels/original/K/B075X2CVQK.glb) | CC BY 4.0 | 1.65×1.17×2.31 | 9,872 | 4K textures, downscale them |
| 12 | Bed (king) | AmazonBasics upholstered platform bed, King (ABO B075XZMMG7) | [GLB](https://amazon-berkeley-objects.s3.amazonaws.com/3dmodels/original/7/B075XZMMG7.glb) | CC BY 4.0 | 2.02×1.05×2.15 | 7,482 | 2K textures |
| 13 | Bed (ornate double) | GothicBed_01 (Poly Haven) | [page](https://polyhaven.com/a/GothicBed_01) | CC0 | 1.49×1.53×2.04 | 18,745 | Vintage style |
| 14 | Nightstand | Rivet "West" oak nightstand 22"W (ABO B07177355J) | [GLB](https://amazon-berkeley-objects.s3.amazonaws.com/3dmodels/original/J/B07177355J.glb) | CC BY 4.0 | 0.56×0.58×0.44 | 2,020 | 2K textures |
| 15 | Nightstand | ClassicNightstand_01 (Poly Haven) | [page](https://polyhaven.com/a/ClassicNightstand_01) | CC0 | 0.57×0.70×0.42 | 2,002 | |
| 16 | Dresser | Stone & Beam "Rylee" 6-drawer dresser 61"W (ABO B07HSNQW37) | [GLB](https://amazon-berkeley-objects.s3.amazonaws.com/3dmodels/original/7/B07HSNQW37.glb) | CC BY 4.0 | 1.55×0.80×0.45 | 3,466 | Matches the sideboard in #21 (same "Rylee" collection) |
| 17 | Dresser/commode | GothicCommode_01 (Poly Haven) | [page](https://polyhaven.com/a/GothicCommode_01) | CC0 | 1.20×1.21×0.58 | 3,897 | |
| 18 | Wardrobe | Movian "Kolva" sliding 2-door wardrobe 180×61×197 cm, white (ABO B07GFSJ69T) | [GLB](https://amazon-berkeley-objects.s3.amazonaws.com/3dmodels/original/T/B07GFSJ69T.glb) | CC BY 4.0 | 1.78×1.96×0.63 | 7,880 | Oak ([B07GFS1VB6](https://amazon-berkeley-objects.s3.amazonaws.com/3dmodels/original/6/B07GFS1VB6.glb)) and dark grey ([B07GFWW3S8](https://amazon-berkeley-objects.s3.amazonaws.com/3dmodels/original/8/B07GFWW3S8.glb)) variants |
| 19 | Wardrobe | Movian "Moselle" 2-door wardrobe 100×60×196 cm (ABO B07H8V7P3H) | [GLB](https://amazon-berkeley-objects.s3.amazonaws.com/3dmodels/original/H/B07H8V7P3H.glb) | CC BY 4.0 | 1.00×1.96×0.60 | 1,620 | 4K textures |
| 20 | Kitchen/base cabinet (stand-in) | painted_wooden_cabinet (Poly Haven) | [page](https://polyhaven.com/a/painted_wooden_cabinet) | CC0 | 1.20×1.18×0.62 | 2,227 | Rustic freestanding cabinet, **not** a fitted kitchen base unit (see gaps) |
| 21 | Sideboard | Stone & Beam "Rylee" 3-drawer sideboard 63"W (ABO B07HSLVMP2) | [GLB](https://amazon-berkeley-objects.s3.amazonaws.com/3dmodels/original/2/B07HSLVMP2.glb) | CC BY 4.0 | 1.60×0.79×0.46 | 3,834 | |
| 22 | Sideboard / low cabinet | modern_wooden_cabinet (Poly Haven) | [page](https://polyhaven.com/a/modern_wooden_cabinet) | CC0 | 2.44×0.68×0.52 | 24,976 | Also works as a TV unit |
| 23 | Bookshelf | Alkove "Velle" bookcase 95×202 cm, honey oak (ABO B07JGY5LNV) | [GLB](https://amazon-berkeley-objects.s3.amazonaws.com/3dmodels/original/V/B07JGY5LNV.glb) | CC BY 4.0 | 0.95×2.02×0.42 | 2,424 | 4K textures |
| 24 | Bookshelf | wooden_bookshelf_worn (Poly Haven) | [page](https://polyhaven.com/a/wooden_bookshelf_worn) | CC0 | 1.37×2.06×0.58 | 10,106 | Worn look. **Avoid `steel_frame_shelves_01`** (10× scale bug) |
| 25 | TV stand | Movian "Oker" TV stand 150×57×42 cm (ABO B07H8P3K2R) | [GLB](https://amazon-berkeley-objects.s3.amazonaws.com/3dmodels/original/R/B07H8P3K2R.glb) | CC BY 4.0 | 1.50×0.57×0.42 | 2,364 | |
| 26 | TV stand / media console | Rivet "King Street" media console 47.2"W (ABO B072ZNMKGM) | [GLB](https://amazon-berkeley-objects.s3.amazonaws.com/3dmodels/original/M/B072ZNMKGM.glb) | CC BY 4.0 | 1.20×0.80×0.40 | 1,676 | Tall (0.80 m) |
| 27 | Dining table | Stone & Beam "Parson" trestle dining table 78"L (ABO B075YMW6VR) | [GLB](https://amazon-berkeley-objects.s3.amazonaws.com/3dmodels/original/R/B075YMW6VR.glb) | CC BY 4.0 | 1.98×0.76×1.00 | 2,028 | |
| 28 | Dining table | Alkove "Hayes" solid-wood table 130×90×75 cm (ABO B07SJ75Y1M) | [GLB](https://amazon-berkeley-objects.s3.amazonaws.com/3dmodels/original/M/B07SJ75Y1M.glb) | CC BY 4.0 | 1.30×0.75×0.90 | 2,860 | Seats 4–6 |
| 29 | Coffee table | modern_coffee_table_01 (Poly Haven) | [page](https://polyhaven.com/a/modern_coffee_table_01) | CC0 | 0.60×0.39×1.20 | 4,504 | **Long axis is on Z; rotate 90°** to match the width convention |
| 30 | Coffee table (round) | coffee_table_round_01 (Poly Haven) | [page](https://polyhaven.com/a/coffee_table_round_01) | CC0 | 1.30×0.49×1.30 | 4,044 | |
| 31 | Coffee table (glass) | Ravenna Home "Parker" glass & gold table 47.2"W (ABO B07DBDMN5F) | [GLB](https://amazon-berkeley-objects.s3.amazonaws.com/3dmodels/original/F/B07DBDMN5F.glb) | CC BY 4.0 | 1.21×0.40×0.58 | 2,156 | Glass, so check alpha and transparency in each renderer |
| 32 | Desk | Rivet mid-century desk 42"W (ABO B07QGFS4JC) | [GLB](https://amazon-berkeley-objects.s3.amazonaws.com/3dmodels/original/C/B07QGFS4JC.glb) | CC BY 4.0 | 1.07×0.75×0.66 | 2,924 | |
| 33 | Desk | metal_office_desk (Poly Haven) | [page](https://polyhaven.com/a/metal_office_desk) | CC0 | 2.00×0.79×0.95 | 6,898 | Industrial style |
| 34 | Dining chair | Rivet "Eli" curved-back dining chair, Lemongrass (ABO B0853KTR7M) | [GLB](https://amazon-berkeley-objects.s3.amazonaws.com/3dmodels/original/M/B0853KTR7M.glb) | CC BY 4.0 | 0.49×0.84×0.59 | 6,328 | Graphite ([B0853KXQX1](https://amazon-berkeley-objects.s3.amazonaws.com/3dmodels/original/1/B0853KXQX1.glb)) and Flannel ([B0853L224Z](https://amazon-berkeley-objects.s3.amazonaws.com/3dmodels/original/Z/B0853L224Z.glb)) variants |
| 35 | Dining chair | painted_wooden_chair_01 (Poly Haven) | [page](https://polyhaven.com/a/painted_wooden_chair_01) | CC0 | 0.43×0.96×0.54 | 724 | Very light. Alternative: `dining_chair_02` (22,013 tris) |
| 36 | Office chair | Rivet "Swope" swivel office chair 26"W, felt grey (ABO B075Z8769G) | [GLB](https://amazon-berkeley-objects.s3.amazonaws.com/3dmodels/original/G/B075Z8769G.glb) | CC BY 4.0 | 0.64×0.87×0.68 | 18,770 | |
| 37 | Office chair | AmazonBasics low-back mesh swivel chair (ABO B01D7P5JW8) | [GLB](https://amazon-berkeley-objects.s3.amazonaws.com/3dmodels/original/8/B01D7P5JW8.glb) | CC BY 4.0 | 0.53×0.81×0.48 | 16,350 | 4K textures |
| 38 | Rug | Rivet hand-tufted diamond rug 5'×8' (ABO B07QHKYCVB) | [GLB](https://amazon-berkeley-objects.s3.amazonaws.com/3dmodels/original/B/B07QHKYCVB.glb) | CC BY 4.0 | 2.44×0.02×1.52 | 1,504 | 8'×10' size: [B07QC8B6R3](https://amazon-berkeley-objects.s3.amazonaws.com/3dmodels/original/3/B07QC8B6R3.glb) (3.05×2.44 m) |
| 39 | Floor lamp | Stone & Beam "Lily" arc floor lamp (ABO B0742FPL25) | [GLB](https://amazon-berkeley-objects.s3.amazonaws.com/3dmodels/original/5/B0742FPL25.glb) | CC BY 4.0 | 0.41×2.10×1.45 | 3,820 | Alternatives: column lamp [B07374SBFN](https://amazon-berkeley-objects.s3.amazonaws.com/3dmodels/original/N/B07374SBFN.glb) (0.42×1.48×0.42), and Khronos [LightsPunctualLamp](https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/LightsPunctualLamp) (CC BY © DGG, 1.13×1.86×0.72, 6,000 tris, includes a punctual light) |
| 40 | Plant | potted_plant_02 (Poly Haven) | [page](https://polyhaven.com/a/potted_plant_02) | CC0 | 0.70×0.84×0.66 | 69,806 | **Decimate to ≤20–30K** for mobile. Alternatives: `potted_plant_01` (1.35 m tall, 176K tris, needs heavy decimation) and `potted_plant_04` (small succulent, 17×19×27 cm per API) |

- **Licensing basis for the table:** Poly Haven CC0 — [Poly Haven license](https://polyhaven.com/license). ABO CC BY 4.0 with credit to Amazon.com — [ABO](https://amazon-berkeley-objects.s3.amazonaws.com/index.html). Khronos per-model licenses — the READMEs cited in Q1.
- **Dimensions, triangles, texture sizes and variant IDs** are *[own measurement]* from [ABO 3dmodels.csv](https://amazon-berkeley-objects.s3.amazonaws.com/3dmodels/metadata/3dmodels.csv.gz) and [listings](https://amazon-berkeley-objects.s3.amazonaws.com/listings/metadata/listings_0.json.gz), the [Poly Haven API](https://api.polyhaven.com/assets?t=models) and glTF files, and the [Khronos model index](https://github.com/KhronosGroup/glTF-Sample-Assets/blob/main/Models/model-index.json).
- **Every ABO pick in the table passed a ±10% check** of model extents against the listed product dimensions.
- **Bonus décor (not counted above):**
  - Khronos IridescenceLamp (table lamp, CC BY), StainedGlassLamp (CC BY), SpecularSilkPouf (CC BY; 0.61×0.20×0.61 m, 81K tris) and GlassVaseFlowers (CC0).
  - Poly Haven `Ottoman_01`, `side_table_01`, ceramic vases, picture frames and `ornate_mirror_01`, all CC0.

### Inferences
- **Demo hero set.** Use #1–3 and #18/#34. These have several real colorways (separate ABO models), or variants built into one GLB (GlamVelvetSofa, SheenChair), so the demo can show a color switcher.
  - For ABO colorways, merge the separate models into one GLB with `KHR_materials_variants` when the geometry is identical. On iOS, use USD variants (Q5).
- **Expected cleanup**
  1. Downscale ABO 4K PNG textures to 2K or 1K and compress them (the nightstand GLB was 30.6 MB before optimization).
  2. Decimate the plants and check alpha.
  3. Pack Poly Haven `.gltf`+`.bin`+JPG files into GLB.
  4. Rotate #29.
  5. Rename branded products.
  6. Regenerate thumbnails consistently.
  7. Spot-check that each model's front faces +Z (4 of 4 checked did).
- **Style mix.** ABO is modern retail, Poly Haven is mostly vintage or rustic, and Khronos/Wayfair is glam. For a coherent-looking demo, lean on ABO plus a few Poly Haven pieces.

### Gaps
- **Kitchen base cabinet.** No realistic, permissively licensed fitted kitchen base cabinet was found in ABO, Poly Haven or Khronos.
  - Options: generate parametric box cabinets procedurally, look for CC0 or CC-BY models on Sketchfab or Blendkit (CC0 only), or get real manufacturer data later.
- **Modern houseplants.** ABO has no artificial-plant models, and Poly Haven's plants are heavy. A CC0 or CC-BY modern plant (fiddle-leaf fig, monstera) would still need a search.
- **Not checked visually:** only geometry, metadata and scale were verified. Visual quality, broken materials and alpha problems still need review in a viewer.
- **Product pages are not cited.** amazon.com product pages for the ABO IDs may no longer exist (2021 data).

---

## 3. Is GLB the right format? (GLB vs USDZ vs glTF+.bin vs FBX vs OBJ; RealityKit glTF support as of iOS 26/27)

### Takeaway
**Yes. GLB is the right master and interchange format and the native runtime format for Android and the web, but it is not enough on its own for iOS.**
- Apple's RealityKit still loads only USD (`.usd/.usda/.usdc/.usdz`) and `.reality` files, and AR Quick Look takes only `.usdz`/`.reality`. I found no Apple statement that RealityKit loads glTF natively in iOS 26 or iOS 27.
- So keep **GLB as the source of truth** and **auto-generate a USDZ sibling** for each product. Shopify does the same: it keeps both a GLB and a USDZ for every 3D model.
- macOS now ships command-line tools that turn GLB into a RealityKit-valid USDZ, which I verified on macOS 27.0.1.

### Cited Findings
- **RealityKit formats.** "RealityKit supports loading entities from USD (.usd, .usda, .usdc, .usdz) and Reality (.reality) files". The "Loading entities from a file" article says the same — [Apple: Entity init(contentsOf:withName:)](https://developer.apple.com/documentation/realitykit/entity/init(contentsof:withname:)); [Apple: Loading entities from a file](https://developer.apple.com/documentation/realitykit/loading-entities-from-a-file) (both read 2026-11-05).
- **AR Quick Look formats.** "You provide content for your AR experience in .usdz or .reality format". Websites link it with `<a rel="ar" href="…usdz">` — [Apple: Previewing a model with AR Quick Look](https://developer.apple.com/documentation/arkit/previewing-a-model-with-ar-quick-look)
- The Quick Look page names only USDZ and `.reality` and never mentions glTF. It also notes a new HTML `<model>` element in Safari on visionOS 26 — [Apple AR Quick Look](https://developer.apple.com/augmented-reality/quick-look/)
- **WWDC26 is USD-centric:**
  - New "USDKit" Swift framework for USD stages (session 285).
  - Reality Composer Pro 3 imports USD.
  - No glTF announcement appeared in session summaries (third-party summaries) — [wwdc.ai session 285](https://wwdc.ai/2026/285); [wwdc.ai session 281](https://wwdc.ai/2026/281)
- Apple's AR tools page now lists only **Reality Composer Pro 3** ("requires macOS 26.5 or later"; includes "generative intelligence to help with asset creation") and does not list Reality Converter — [Apple AR tools](https://developer.apple.com/augmented-reality/tools/)
- Apple's current USD guide:
  - **Preview has replaced Reality Converter:** "If you have been using Reality Converter to create USDZ files, Preview is the recommended replacement".
  - Conversion with "Preview or the usdcat command line tool" and packaging with "Preview or the usdzip command line tool".
  - **"USDZ is the recommended format for distributing and sharing assets."**
  - **Renderer changes:** "Starting with macOS 27, Preview uses the USDKit backend for RealityKit rendering".
  - Source: [Apple: Creating USD files for Apple devices](https://developer.apple.com/documentation/usd/creating-usd-files-for-apple-devices)
- **Third-party iOS evidence**
  - The SceneView project's issue tracker (opened 15 Sep 2026) says its iOS build on RealityKit takes USDZ/Reality files, and GLB has to go through a converter — [sceneview issue #3655](https://github.com/sceneview/sceneview/issues/3655)
  - Swift glTF loaders exist but are immature: SwiftGLTF converts glTF to RealityKit entities but is "unfinished" and not for production; GLTFKit2 targets SceneKit — [SwiftGLTF](https://github.com/schwa/SwiftGLTF); [GLTFKit2 fork](https://github.com/Sitelink-Spatial/GLTFKit2)
- **Android and web use glTF natively**
  - Google Scene Viewer requires glTF 2.0 or GLB, with "1 unit = 1 meter", +Y up, and the front facing +Z — [Scene Viewer](https://developers.google.com/ar/develop/scene-viewer)
  - Filament (the renderer behind SceneView on Android) supports `KHR_draco_mesh_compression`, `KHR_texture_basisu`, `EXT_meshopt_compression`, `KHR_materials_variants`, sheen, specular, transmission and more — [Filament README](https://github.com/google/filament/blob/main/README.md)
  - `<model-viewer>`: if `ios-src` is omitted, "the USDZ will instead be auto-generated when the user clicks the AR button on iOS". The auto-generated USDZ "does not support animations yet" — [model-viewer AR](https://modelviewer.dev/examples/augmentedreality/)
- **Commerce precedent.** Shopify accepts "GLB, USDZ" up to 500 MB. "Files are converted to ensure both a .USDZ and .GLB version of the model is available … compatibility with both Android and iOS". Files over 15 MB are auto-optimized — [Shopify product media types](https://help.shopify.com/en/manual/products/product-media/product-media-types)
- **OBJ and FBX.** Kenney's guide rates FBX and GLB as equal in capability, with GLB producing smaller files, and advises against OBJ unless nothing else is supported — [Kenney KB](https://kenney.nl/knowledge-base/game-assets-3d/importing-3d-models-into-game-engines)
- Apple's conversion guidance lists "Alembic, OBJ, STL, and PLY" as common formats that Preview or `usdcat` convert to USD — [Apple USD guide](https://developer.apple.com/documentation/usd/creating-usd-files-for-apple-devices)

**Format comparison** (synthesis of the citations above, with inference where noted)

| Format | Role for YoungVista | Pros | Cons |
|---|---|---|---|
| **GLB** (binary glTF 2.0) | **Master + Android/web runtime** | Single file, meters/Y-up by spec, PBR, variants, Draco/Meshopt/KTX2 compression, supported by Scene Viewer, Filament/SceneView, three.js and model-viewer | Not loadable by RealityKit or AR Quick Look |
| `.gltf` + `.bin` + textures | Authoring/debug only | Human-readable JSON, easy diffing (Poly Haven ships this) | Many files per asset, so pack to GLB for delivery (inference) |
| **USDZ** | **iOS runtime + AR Quick Look + web "View in AR" on iPhone** | Required by RealityKit/AR Quick Look. Supports variants shown as configuration options in Quick Look | Textures limited to JPEG/PNG/EXR/AVIF (no KTX2/Draco). Fewer advanced material extensions |
| FBX | Avoid | Common in DCC tools and marketplaces | Proprietary. Not loadable by RealityKit or Scene Viewer |
| OBJ | Avoid | Universal import | No PBR metal/roughness standard, no hierarchy or animation, separate `.mtl` file (inference + Kenney KB) |

### Inferences
- **Keep GLB as the master.** Fully switching to USDZ would hurt Android and web. Fully switching to GLB would break iOS native AR unless the iOS app avoids RealityKit.
  - Options for a non-RealityKit iOS app are Unity, Filament on iOS, a WebView with three.js, or a custom Metal renderer. That choice belongs to the cross-platform-architecture researcher; I did not verify Filament on iOS or Unity glTFast here.
- **Pragmatic path:** GLB master → USDZ generated in CI on a Mac (Q4). Ship USDZ to iOS/RealityKit and Quick Look, and compressed GLB to Android and web.
- **Absence of evidence on iOS 27.** It is possible that iOS 27 or USDKit can import glTF at runtime, since macOS's USD stack has a glTF reader (usdextract accepts `.glb` and `.gltf`). I found no Apple documentation saying so, so don't rely on it.
- **Brief notes for other researchers** (unverified, third-party summaries):
  - WWDC26 RealityKit sessions mention **Gaussian-splat support** and "physical-space lighting" — [wwdc.ai 287](https://wwdc.ai/2026/287); [note.com article](https://note.com/angework/n/nf984debd4a48?hl=en)
  - On macOS 27, Preview gained a path-traced "Raytracer" renderer and can adjust axis and scale on import — [Apple USD guide](https://developer.apple.com/documentation/usd/creating-usd-files-for-apple-devices)

### Gaps
- I found no Apple release notes for iOS 26 or iOS 27 that explicitly say whether glTF import exists. The conclusion rests on the current RealityKit docs listing only USD/.reality.
- I did not test whether iOS (not macOS) ships the USD glTF file-format plugin, which would allow on-device conversion.
- Unity, Unreal and Flutter runtime glTF loaders on iOS were not researched.

---

## 4. Asset pipeline: conventions, validation, optimization, USDZ conversion, and polygon/texture/file-size budgets

### Takeaway
Pipeline:
1. **Ingest** the source asset.
2. **Normalize** it to a canonical uncompressed master GLB: meters, Y-up, origin at bottom-center on the floor, front facing +Z, real product dimensions.
3. **Validate** with the Khronos glTF Validator or `gltf-transform validate`.
4. **Optimize** delivery GLBs: resize textures, Meshopt or Draco geometry compression, KTX2 or WebP textures.
5. **Convert** the uncompressed master to USDZ with Apple's macOS USD tools (`usdextract` → `usdzip --arkitAsset` → `usdchecker --arkit` → optional `usdcrush`).
6. **Store** everything with metadata.

Budget targets: about ≤30–50K triangles per item (100K hard cap), ≤2K textures, and ≤5–10 MB per file.

### Cited Findings
**Conventions**
- **glTF/Scene Viewer:** "1 unit = 1 meter"; right-handed, +X right, +Y up; the asset's front should face +Z — [Scene Viewer](https://developers.google.com/ar/develop/scene-viewer)
- **RealityKit:** "RealityKit uses Y-up orientation and meters as its unit scale"; "RealityKit expects normal maps in OpenGL format" (glTF uses the same convention) — [Apple USD guide](https://developer.apple.com/documentation/usd/creating-usd-files-for-apple-devices)
- *[own measurement]* Real assets already follow these conventions: Poly Haven glTF (40 models), Khronos (11) and ABO (2 inspected) are all Y-up, meters, centered on X/Z with minY ≈ 0, and the 4 seating models tested face +Z. Exceptions: the Poly Haven 10× scale bug and two rotated models, and the Khronos wall lamp, whose origin is not at the floor (AnisotropyBarnLamp minY −0.198 m) — [Poly Haven API](https://api.polyhaven.com/assets?t=models); [Khronos index](https://github.com/KhronosGroup/glTF-Sample-Assets/blob/main/Models/model-index.json); [ABO](https://amazon-berkeley-objects.s3.amazonaws.com/index.html)
- **Khronos Asset Creation Guidelines 2.0** (7 Aug 2025) cover coordinates, scale and units, origin placement, Draco and MeshOpt, texel density and atlases, PBR-next extensions, and inspection with glTF Compressor, glTF Asset Auditor and **glTF Validator**. The blog post gives **no numeric budgets** — [Khronos blog](https://www.khronos.org/blog/introducing-asset-creation-guidelines-2.0-siggraph-2025); [guidelines repo](https://github.com/KhronosGroup/3DC-Asset-Creation/blob/main/asset-creation-guidelines/RealtimeAssetCreationGuidelines.md)

**Validation and optimization tooling**
- **gltf-transform CLI:**
  - Install: `npm install --global @gltf-transform/cli`.
  - Commands: `gltf-transform inspect input.glb` reports geometry, texture and draw-call problems. `validate` checks conformance to the glTF spec.
  - One-step optimization: `gltf-transform optimize input.glb output.glb --compress draco --texture-compress webp`.
  - Standalone commands: `simplify`, `join`, `instance`, `prune`, `dedup`, `meshopt`, `quantize`, plus `etc1s`/`uastc` (KTX2 with Basis Universal) and `ktxfix`.
  - Use `optimize -h` to see the current options.
  - Source: [glTF Transform CLI](https://gltf-transform.dev/cli)
- **Runtime support for compressed GLB**
  - Filament/SceneView supports Draco, Meshopt and KTX2 (BasisU) — [Filament README](https://github.com/google/filament/blob/main/README.md)
  - Scene Viewer's documentation lists only `KHR_materials_unlit` and `KHR_texture_transform` as supported extensions and does not mention Draco, KTX2 or Meshopt — [Scene Viewer](https://developers.google.com/ar/develop/scene-viewer)
- **USDZ texture limits.** "USDZ files may only include JPEG, PNG, EXR, and AVIF. Use AVIF textures where possible … use Preview or the usdcrush command line tool to compress the textures within your USDZ file to use AVIF". Xcode also compresses textures at build time — [Apple USD guide](https://developer.apple.com/documentation/usd/creating-usd-files-for-apple-devices)
- **Other Apple USD rules:**
  - Set `subdivisionScheme` to `none`, because the default is Catmull-Clark and each subdivision level multiplies polygons by 4.
  - Keep `doubleSided` off unless needed.
  - Pack roughness, metallic and AO into the channels of one texture.
  - Use sRGB only for color textures.
  - Minimize alpha transparency.
  - Variants under `defaultPrim` "are shown to the user as configuration options when using QuickLook with USDZ files".
  - Validate with `usdchecker`.
  - Source: [Apple USD guide](https://developer.apple.com/documentation/usd/creating-usd-files-for-apple-devices)
- **The older converters are gone.** Apple's Python `usdzconvert` tools were removed from Apple's developer site, noticed in July 2024.
  - Alternatives discussed then: Adobe's USD file-format plugins with `usdcat`/`usdzip`; `guc`, whose RealityKit material binding needed a fix; and Blender, which loses occlusion on USDZ export.
  - A forum participant said macOS 15 converts glTF directly with Preview or `usdzip` — [AOUSD forum, Jul 2024](https://forum.aousd.org/t/obj-gltf-to-usdz-usdzconvert-discontinued/1648)
- *[own measurement]* **The built-in macOS 27.0.1 conversion works end to end**, using the binaries in `/usr/bin`: `usdcat`, `usdzip`, `usdchecker`, `usdcrush`, `usdextract`, `usdtree`, `usdrecord`.
  1. `usdextract model.glb -o outdir`. The help text reads "Extract file(s) from a .usdz, .glb, or .gltf file". It wrote a `.usdc` (upAxis "Y", metersPerUnit 1, UsdPreviewSurface materials) plus 3 textures.
  2. `usdzip --arkitAsset outdir/model.usdc model.usdz`. This produced a 4.13 MB USDZ containing all textures, with non-fatal "failed to resolve reference" warnings. Passing the GLB directly to `usdzip` **fails** ("Cannot determine file format").
  3. `usdchecker --arkit model.usdz` → **"Success!"**
  4. `usdcrush model.usdz -o out.usdz -c widest` → 3.57 MB (−13.5%). It re-encoded the PNG normal map as JPEG, and the result still passes `--arkit`.
  - Tested on the ABO sofa GLB B072C8Q9RF (4.15 MB) — [ABO GLB](https://amazon-berkeley-objects.s3.amazonaws.com/3dmodels/original/F/B072C8Q9RF.glb); [Apple USD guide (usdcat/usdzip/usdcrush)](https://developer.apple.com/documentation/usd/creating-usd-files-for-apple-devices)

**Budgets** (official numbers are scarce)
- **Google Scene Viewer:**
  - Triangles: "100,000 recommended; 30,000 to 50,000 ideal".
  - Textures: max 2048×2048 recommended.
  - Materials: ≤10 recommended. One UV set per mesh.
  - File size: 10 MB recommended; validator error above 15 MB.
  - Textures as PNG or JPG. No baked shadows. Morph targets and vertex colors unsupported.
  - Source: [Scene Viewer](https://developers.google.com/ar/develop/scene-viewer)
- **Apple:** the current guide gives no numeric polygon budget. It says to focus on triangles visible at once and to size textures to visual importance — [Apple USD guide](https://developer.apple.com/documentation/usd/creating-usd-files-for-apple-devices)
  - A 2021 developer-forum rule of thumb is about 100K polygons and 2048² textures, which "can be exceeded when only newer devices are targeted". This is dated, so treat it as a rough guide — [Apple Developer Forums 693867](https://developer.apple.com/forums/thread/693867)
- **Shopify:** up to 500 MB, auto-optimizes files over 15 MB — [Shopify](https://help.shopify.com/en/manual/products/product-media/product-media-types)
- *[own measurement]* **Real-world reference points**
  - ABO picks run 1.5K–37K triangles, with 2K textures at about 4 MB per GLB and 4K PNG textures at about 30 MB.
  - Poly Haven furniture runs 0.2K–61K triangles; the plants run 70K–176K.
  - Khronos showcase items run 4K–81K triangles.

### Inferences
**Recommended pipeline**, implementable as a Node + macOS CI job:
1. **Ingest.** Store the source file, URL, author, license and attribution text, and a checksum.
2. **Normalize.** Convert to an uncompressed master GLB:
   - Apply transforms. Units in meters, Y-up, front facing +Z.
   - Pivot and origin at **bottom-center of the footprint** for floor items, at the **back-center** of the mounting plane for wall items, and top-center for ceiling items.
   - Scale to the real catalog dimensions, preferring uniform scale.
   - One root node named after the SKU.
   - Materials limited to metal/rough PBR, with occlusion, roughness and metallic packed into one texture.
   - Blender headless or gltf-transform scripting can do this.
3. **Validate.**
   - Run the Khronos glTF Validator or `gltf-transform validate`.
   - Add custom checks:
     - Bounding box within ±2–3% of the catalog W/H/D.
     - minY = 0 (floor items).
     - Triangle and texture budgets met.
     - No unsupported required extensions (for example, SheenWoodLeatherSofa *requires* `EXT_texture_webp`).
   - Then render turntable thumbnails.
4. **Optimize delivery GLBs.**
   - `simplify` to the triangle budget.
   - Resize textures to 2K for large items and 1K for small ones (check the exact gltf-transform flag with `-h`).
   - Meshopt or Draco compression.
   - KTX2: UASTC for normal maps, ETC1S for color.
   - Optionally make LOD0 and LOD1 versions.
   - If Scene Viewer intents are used, keep an extension-free fallback GLB, because Scene Viewer documents no Draco, KTX2 or Meshopt support.
5. **Convert to USDZ from the *uncompressed master*, not from the compressed GLB.** USDZ cannot carry KTX2 or Draco. Use the verified macOS chain above (`usdextract` → `usdzip --arkitAsset` → `usdchecker --arkit` → `usdcrush`).
   - Set `subdivisionScheme=none` before packaging.
   - Advanced glTF extensions (sheen, transmission, iridescence, variants) may not survive conversion, so check visually in Preview or Reality Composer Pro.
   - Alternatives for Linux CI: Blender USD export or `guc`. Both need RealityKit verification.
6. **Publish.** Content-addressed URLs on a CDN, with both formats referenced from the catalog record (Q5).

**Recommended budgets per product** (inference, anchored on Scene Viewer and the Apple forum):
- Triangles: 10–30K for case goods and tables, ≤50K for upholstered or complex pieces, and plants decimated to ≤30K. Never over 100K.
- Textures: one material set, 2048² for large items (sofa, bed, wardrobe, rug) and 1024² for small ones.
- Delivery GLB ≤ ~5 MB (hard cap 10 MB). USDZ ≤ ~10 MB.
- A room with 10–15 placed items should stay under about 500K triangles.

**Do-not-skip checks:**
- Dimension check against the catalog (catches the Poly Haven 10× bug).
- Facing direction (catches rotated models).
- Origin at the floor (catches wall-mounted items and offsets).
- Texture color spaces (sRGB vs linear).

### Gaps
- No authoritative numeric polygon or texture budgets from Apple or Khronos were found.
- The Khronos "Publishing Targets" page URL returned 404.
- gltf-transform's exact current `optimize` flags (e.g., `--compress meshopt`, `--texture-compress ktx2`) were not confirmed on the fetched page. Check with `-h`.
- I did not test how much the advanced materials (sheen, transmission, variants) degrade in USDZ conversion.
- I did not test Blender or guc conversion, or Linux-only pipelines.

---

## 5. Product metadata each item needs, and how retail AR catalogs structure it

### Takeaway
Each product needs four kinds of data:
- **Identity and commerce:** SKU, variant SKUs, name, brand, category path, price, currency, URL.
- **Physical facts:** real W×D×H in mm with explicit axis semantics, weight, materials and colors (with hex codes).
- **Placement rules:** floor, wall, ceiling or tabletop; default mount height; whether scaling is locked; clearance.
- **Asset references:** master GLB, delivery GLB(s), USDZ, thumbnail, triangle and texture stats, checksum, and **license and attribution**.

Color options should map 1:1 to glTF `KHR_materials_variants` names and USD variant names, as retail 3D commerce does.

### Cited Findings
- *[own measurement]* **ABO's real Amazon listing schema** (fields present among the 7,960 listings that have 3D models):
  - Fields: `item_id`, multilingual `item_name`, `product_type`, `3dmodel_id`, `brand`, `main_image_id`/`other_image_id`, `model_number`, `bullet_point`, `item_dimensions` (h/l/w with units), `spin_id` (360° images), `item_keywords`, multilingual `color` with standardized values, `color_code` (hex), `item_weight`, `material`, `node` (category path, e.g., `/Categories/Furniture/Living Room Furniture/Sofas & Couches`), `style`, `item_shape`, `fabric_type`, `pattern`, `finish_type`.
  - Localized values include `ko_KR`.
  - **There is no price field**, so demo prices must be mocked.
  - Dimension labels are inconsistent: "length" can hold width, and "height" sometimes holds width.
  - Source: [ABO listings metadata](https://amazon-berkeley-objects.s3.amazonaws.com/listings/metadata/listings_0.json.gz); [ABO](https://amazon-berkeley-objects.s3.amazonaws.com/index.html)
- **KHR_materials_variants** (ratified Khronos extension) is "a compact glTF representation of multiple material variants of an asset".
  - Contributors include Shopify, Facebook, Adobe, Emersya, OLV and Wayfair.
  - Its stated design goals map variants to SKUs or product codes, and keep the variant list bounded and defined per asset.
  - Building full configurators is out of scope — [KHR_materials_variants](https://github.com/KhronosGroup/glTF/blob/main/extensions/2.0/Khronos/KHR_materials_variants/README.md)
- **On iOS:** "Variants that are defined in this defaultPrim hierarchy path are shown to the user as configuration options when using QuickLook with USDZ files". Apple provides a script to merge USDZ files that differ only in material into one file with variants — [Apple USD guide](https://developer.apple.com/documentation/usd/creating-usd-files-for-apple-devices)
- **Retail hooks in AR viewers**
  - AR Quick Look URLs take fragment parameters such as `callToAction`, `checkoutTitle`, `checkoutSubtitle`, `price` and `allowsContentScaling=0` — [Apple AR Quick Look](https://developer.apple.com/augmented-reality/quick-look/)
  - Scene Viewer has `resizable=false` to block scaling in AR — [Scene Viewer](https://developers.google.com/ar/develop/scene-viewer)
  - model-viewer has `ar-placement` (floor default, or `wall`) and `ar-scale="fixed"` — [model-viewer AR](https://modelviewer.dev/examples/augmentedreality/)
- **How Shopify structures 3D media.** A 3D model is a product *media* item, in GLB or USDZ up to 500 MB. Shopify auto-converts so that both GLB and USDZ exist, and auto-optimizes files over 15 MB. Extra product data lives in metafields — [Shopify product media types](https://help.shopify.com/en/manual/products/product-media/product-media-types); [Shopify product media](https://help.shopify.com/en/manual/products/product-media/3d-models)
- **Attribution must travel with the asset.** CC-BY needs credit, a license link and a modification note (ABO). Sketchfab requires that "the Creative Commons license and attribution must follow the asset everywhere it is used" — [ABO](https://amazon-berkeley-objects.s3.amazonaws.com/index.html); [Sketchfab guidelines](https://sketchfab.com/developers/download-api/guidelines)

### Inferences
Suggested product record for the demo, synthesized from ABO, Shopify, KHR_materials_variants and Apple variants:
- **Identity:** `product_id`, `sku`; `variants[]` with `{variant_sku, name, color_hex, material_name, gltf_variant_name, usd_variant_name, thumbnail_url, price}`; `name` and localized names (ko/en); `brand` (neutral or fictional for the demo); `category_path` with a fixed taxonomy (sofa/3-seat, sofa/sectional, chair/armchair, bed, nightstand, dresser, wardrobe, cabinet/kitchen-base, sideboard, bookcase, tv-stand, table/dining, table/coffee, desk, chair/dining, chair/office, rug, lamp/floor, plant); `style_tags`.
- **Physical:** `dimensions_mm {width (X), depth (Z), height (Y)}` with the **axis convention stated in the schema**; `dimension_tolerance_pct`; `weight_kg`; `materials[]`; `seat_height_mm` (for seating); `configurable` (e.g., chaise left/right → mirrored asset).
- **Placement:** `placement {floor|wall|ceiling|tabletop}`; `default_wall_height_mm` for wall items; `snap_to_wall_back` (boolean); `min_clearance_mm` (e.g., for drawers or doors to open); `scale_locked=true` (real products must not be resized in AR); `front_axis="+Z"`; `origin="bottom-center"`.
- **Assets:** `glb_master_url`; `glb_delivery_urls {lod0, lod1}` with byte size; `usdz_url`; `thumbnail_url` (transparent PNG/WebP); `poster_url`; `triangle_count`; `max_texture_px`; `bbox_m` (measured, used for automatic checks against `dimensions_mm`); `asset_version`; `sha256`.
- **Commerce (mocked for the demo):** `price`, `currency`, `availability`, `product_url`.
- **Rights:** `source`, `source_url`, `author`, `license` (CC0 / CC-BY-4.0), `attribution_text`, `modified=true`, `ai_generated` (for later), `trademark_notes`.

**Wall versus floor matters** for AR anchoring and for snapping in the scanned room. Store it explicitly, and set the origin to match (bottom-center for floor items, back-center for wall items).

### Gaps
- I could not access a public schema from IKEA, Wayfair or Amazon "View in Your Room" describing how they structure AR catalogs internally.
- schema.org's `3DModel` type was not fetched or verified.
- Shopify's detailed upload limits (the "Uploading and managing files" page) were not read.

---

## 6. Future: AI image-to-3D generation of products from photos (quality for furniture, scale accuracy, licenses, cost)

### Takeaway
- **Commercially usable today:**
  - Paid hosted tools: Meshy (outputs "customer owned" on paid plans), Rodin/Hyper3D ("any use" on Creator and above).
  - Open models with permissive terms: Microsoft **TRELLIS.2** (MIT, but a key dependency, NVIDIA nvdiffrast, is non-commercial) and Meta **SAM 3D Objects** (royalty-free SAM License with trade-control limits).
- **Tencent Hunyuan3D 2.x weights:** these exclude the EU, UK and **South Korea**, and above 1M monthly active users a separate license is required.
- **Outputs have no reliable real-world scale.** Every AI asset must be rescaled to catalog dimensions and pass the Q4 validation.
- I found no rigorous public benchmark of furniture quality. Treat AI generation as suited to long-tail and décor items, and use manufacturer CAD or photogrammetry for hero SKUs.

### Cited Findings

| Tool | License / ownership | Cost (as read 2026-11-05 unless noted) | Output / notes |
|---|---|---|---|
| **Meshy** | Free plan outputs are **CC BY 4.0** ("commercial use with attribution"). Paid plans are "Private & Customer owned" | Free: 100 credits/mo (max 10 assets). Pro $20/mo, 1,000 credits (max 100 assets). Premium $40/mo, 3,000. Ultra $100/mo, 8,000. Studio $70/mo. API on paid plans (20 req/s) | Downloads in `.fbx, .obj, .usdz, .glb, .stl, .blend`. The free tier mentions "Meshy 6 Lite" — [Meshy pricing](https://www.meshy.ai/pricing) |
| **Rodin / Hyper3D (Deemos)** | Creator plan: "Unlimited export and any use". Paid plans "include broader export and usage rights". Free plan's rights shown as "—" | Free: 10 private assets. Creator $30/mo ($24/mo yearly), about 60 models. Business $120/mo ($96 yearly), about 416 models, with API. Direct credits $1.5/credit. "Pay by result" | The page showed "Prices can't be shown right now", so verify. Model version not stated — [Hyper3D pricing](https://hyper3d.ai/pricing) |
| **Tripo** | *Unverified (third-party only):* free tier ~300 credits/mo, with outputs reportedly CC BY. Commercial rights on paid tiers | *Unverified:* ~$19.90/mo Professional for ~3,000 credits. A reported ~31% top-tier price rise in May 2026 | Official pricing page returned 403 — [CostBench](https://www.costbench.com/software/ai-3d-generation/tripo-ai/); [CostBench changelog](https://costbench.com/changelog/tripo-ai-price-increase-2026-05/) |
| **Hunyuan3D 2.1 (Tencent, open weights)** | "TENCENT HUNYUAN 3D 2.1 COMMUNITY LICENSE AGREEMENT" (13 Jun 2025). Territory: worldwide **"excluding … European Union, United Kingdom and South Korea"**. More than 1M MAU requires a Tencent license. Outputs may not be used "to improve any other AI model". "Tencent claims no rights in Outputs" | Free weights. Self-hosting cost depends on your GPUs | — [Hunyuan3D-2.1 LICENSE](https://huggingface.co/tencent/Hunyuan3D-2.1/blob/main/LICENSE). Hunyuan3D 2.0 (21 Jan 2025) has the same territorial exclusion — [Hunyuan3D-2 LICENSE](https://huggingface.co/tencent/Hunyuan3D-2/blob/main/LICENSE) |
| **Hunyuan3D 3.0** | Hosted service. Open-source plans unclear | Free to use on Tencent's platform (Sept 2025 report) | — [Notebookcheck, Sept 2025](https://www.notebookcheck.net/Tencent-s-new-Hunyuan-3D-3-0-brings-realistic-AI-model-generation-to-developers-and-creators.1116964.0.html) |
| **Microsoft TRELLIS.2** (arXiv 2512.14692, ~Dec 2025) | "This model and code are released under the MIT License". But "certain dependencies operate under separate license terms": nvdiffrast and nvdiffrec | Self-host: needs an NVIDIA GPU with ≥24 GB (A100/H100 tested, Linux). Time per asset on H100: ~3 s at 512³, ~17 s at 1024³, ~60 s at 1536³ | 4B-parameter model. GLB output with PBR (base color, roughness, metalness, opacity). Claims "crisp edges" and handles open surfaces — [TRELLIS.2](https://github.com/microsoft/TRELLIS.2) |
| nvdiffrast (TRELLIS dependency) | "Nvidia Source Code License (1-Way Commercial)": the work "only may be used or intended for use non-commercially" | — | — [nvdiffrast LICENSE](https://github.com/NVlabs/nvdiffrast/blob/main/LICENSE.txt) |
| **Meta SAM 3D Objects** | "SAM License" (last updated 19 Nov 2025): "non-exclusive, worldwide, non-transferable and royalty-free limited license … to use, reproduce, distribute, copy, create derivative works". Trade-control and ITAR/military use prohibited | Free weights | — [SAM 3D Objects LICENSE](https://github.com/facebookresearch/sam-3d-objects/blob/main/LICENSE). Roboflow reads it as royalty-free for commercial work — [Roboflow](https://roboflow.com/model-licenses/segment-anything-3) |

- **Apple tooling:** Reality Composer Pro 3 advertises "generative intelligence to help with asset creation" — [Apple AR tools](https://developer.apple.com/augmented-reality/tools/)
- Apple's Quick Look gallery labels a sample model "Made with Object Capture", Apple's photogrammetry tool, which is a non-AI route to capturing real products — [Apple AR Quick Look](https://developer.apple.com/augmented-reality/quick-look/)

### Inferences
- **Scale accuracy.** None of the sources state that image-to-3D outputs come out in metric scale. Single-image generators work in normalized space, so YoungVista must rescale each output to the known product W/D/H.
  - Rescale uniformly, ideally fitting the largest dimension. Then check the other dimensions, and reject the asset if they deviate by more than about 3–5% instead of stretching it.
  - Real products need dimensionally faithful assets, because customers judge fit in their room.
- **Likely quality for furniture** (inference, no benchmark found):
  - Upholstered, soft or organic items such as sofas, cushions and plants generate well.
  - Thin legs, slats, straight veneer edges, glass, mirrors, drawers and exact symmetry are typical failure modes.
  - Generators also bake lighting into textures and produce single fused meshes, so there are no separable parts, drawers or doors.
  - Best use: placeholders for long-tail catalog items. Hero products should come from manufacturer CAD or retopologized photogrammetry.
- **Rough cost per asset** (inference):
  - Meshy Pro: about 10 credits per asset at plan caps, roughly $0.20/asset.
  - Rodin: about $0.29–0.50/model on subscriptions, or $1.5/credit direct.
  - TRELLIS.2 self-hosted: seconds to about a minute of H100 time, but commercial use needs the non-commercial nvdiffrast removed, replaced or licensed.
  - Hunyuan3D 2.x is unusable if YoungVista operates in or targets South Korea, the EU or the UK. Check where YoungVista is based.
- **Licensing hygiene for AI assets.** Record the generator, version, plan or license, and the source-photo rights in the asset's metadata. Avoid free tiers whose outputs are CC BY or public, such as Meshy Free (CC BY 4.0), for proprietary catalog items.
- **Pipeline reuse.** AI outputs (GLB) go through the same Q4 pipeline: normalize, set scale, validate, decimate, compress, convert to USDZ.

### Gaps
- No independent, recent benchmark of image-to-3D quality specifically for furniture was found.
- Tripo's official pricing and terms could not be accessed (HTTP 403). Rodin's live prices did not render.
- Hunyuan3D 3.x open-weight status and license are unconfirmed.
- I did not verify whether newer TRELLIS.2 or Hunyuan builds removed the nvdiffrast dependency.
- Meshy's per-task credit cost for image-to-3D is not stated on its pricing page; the ~10 credits per asset figure is inferred from the plan caps.
