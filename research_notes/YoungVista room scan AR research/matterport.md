# Matterport: capture hardware, reconstruction and rendering, measurement accuracy, business status, and what a phone-only app can match (status as of 2026-11-05)

Verification tags: **[V]** = I fetched and read the page in this session. **[S]** = I saw it only in search-engine result text, because the page would not load (Matterport Support pages are rendered with JavaScript and returned an empty shell to both WebFetch and curl). Treat [S] as likely but not fully verified. **[3P]** = third-party, non-primary source. Dates in parentheses are publication dates. Everything under "Inferences" is my own reasoning unless it carries a citation.

## 1. Capture devices, how each senses depth, and Matterport's published accuracy per device class

### Takeaway
Matterport's capture devices fall into two groups. The first measures depth directly with active sensors: Pro3 LiDAR, Pro2 structured-light IR, Leica BLK360 laser scanner, and LiDAR iPhones/iPads. The second captures images only (consumer 360° cameras, phones without LiDAR), and Matterport's Cortex AI *infers* depth from those images. Matterport's own accuracy figures are roughly: Pro3 ±20 mm at 10 m on raw depth (about 0.2%), Pro2 ±1%, and about 4–5% average error for 360-camera or phone captures. Older documents give 4–8%, an "8% max error" (2019), and about 10% for converted 360° views.

### Cited Findings
**Pro3 (launched August 2022; current flagship)**
- Specs [V] ([Matterport store, Pro3 Plus Package](https://matterport.com/store/product/pro3-plus-package)):
  - Sensor: "Lidar", Class 1 laser, 904 nm. Field of view 360° horizontal × 295° vertical.
  - Accuracy: "+/- 20mm @10m", which applies to raw depth data.
  - Range: minimum 0.5 m. "Standard range" in processed Matterport models is 20 m. The maximum "up to 100m" applies only to E57 exports.
  - Data: 100k points per second, up to 1.5M points per scan, "Automatic" scan registration.
  - Imaging: 134.2 MP panorama output, 5 HDR exposures, four camera stops per panorama, automatic white balance across the full model.
  - Operation: sweep time "<20 seconds per scan", more than 220 scans per battery, GPS included.
  - Physical and environment: 2.2 kg, IP43, 0–40 °C. "Full-sun capture outdoors" is supported.
- The same page's FAQ says nearby points (within 10 m) are "more reliable" for measuring — [Matterport store [V]](https://matterport.com/store/product/pro3-plus-package)
- Launch prices (August 31, 2022) — [AEC Magazine [V]](https://aecmag.com/reality-capture-modelling/matterport-pro3-camera-places-greater-emphasis-on-aec/):
  - Camera: $5,995 (£4,995).
  - Acceleration Kit: $7,995. It adds ten E57 files, ten MatterPaks, extra batteries and a 3-year warranty.
  - Matterport framed the Pro3 against $22–42k terrestrial laser scanners.
  - Lou Marzano of Matterport called it "a portable device that achieves a new threshold for price-to-performance of commercial LiDAR capture."
- How the Pro3 is sold today — [Matterport store [V]](https://matterport.com/store/product/pro3-plus-package):
  - It is bundled at "$245/month" with a "Professional Subscription starting at 50 spaces", on a 24-month term that cannot be cancelled early.
  - The Pro3 requires "a Professional or higher plan".
  - Online purchases are limited to one camera.
  - I found no current standalone price on Matterport's site (see Gaps).
- Matterport's own "right tool for your job" table — [Matterport cameras page [V]](https://matterport.com/cameras):
  - Pro3 is rated "Excellent" for large industrial spaces, outdoor areas, luxury properties and documenting as-built conditions.
  - Pro3 is only "Good" for small and medium residential, where Pro2 is "Excellent".

**Pro2 (launched 2017)**
- Depth sensing is "Structured light" (laser wavelength 826.8 nm), accuracy "+/- 1%", range "Up to 5m", minimum 0.5 m — [Matterport cameras page [V]](https://matterport.com/cameras)
- AEC Magazine (2022) gives Pro2 accuracy as "±44~58mm at 4.5m" and calls it "better suited to indoor spaces alone" — [AEC Magazine [V]](https://aecmag.com/reality-capture-modelling/matterport-pro3-camera-places-greater-emphasis-on-aec/)
- The pre-order price at launch in 2017 was $3,995 — [TechCrunch 2017 [S]](https://techcrunch.com/2017/05/31/matterport-launches-pro2-camera-optimized-for-2d-and-3d-imagery/). A reseller spec sheet describes a three-camera system with 134 MP equirectangular output and an IR structured-light depth sensor — [spec sheet PDF [S][3P]](https://cdn2.antbuildz.com/images/e408b9dc5b792ee1bb740733a.pdf)
- Matterport describes the Pro2 as "capable of capturing buildings more than 500,000 square feet in size". FY2024 product revenue still included Pro2 sales — [Matterport 10-K FY2024 [V]](https://www.sec.gov/Archives/edgar/data/1819394/000181939425000007/mttr-20241231.htm)
- Status flag: Matterport's June 9, 2026 guide to compatible cameras lists Pro3 but not Pro2 — [Matterport blog 2026 [V]](https://matterport.com/en-GB/blog/unveiling-the-perfect-lens-cameras-compatible-with-matterports-spatial-data). The cameras comparison page still shows Pro2 — [V](https://matterport.com/cameras).

**Leica BLK360 (partner laser scanner)**
- The BLK360 "captures up to 360,000 points per second with millimeter-level precision", and the G1 model "can be used directly with Matterport". The same guide says professional scanners like it cost "upwards of $20,000" — [Matterport 2026 guide [V]](https://matterport.com/en-GB/blog/unveiling-the-perfect-lens-cameras-compatible-with-matterports-spatial-data)
- Matterport's 10-K calls the Leica integration "the solution of choice for AEC professionals when exacting precision is required" — [10-K FY2024 [V]](https://www.sec.gov/Archives/edgar/data/1819394/000181939425000007/mttr-20241231.htm)
- In 2022 Matterport itself listed scanner accuracy at 10 m as BLK360 ±6 mm, Trimble X7 ±2.4 mm and Faro Focus S ±1 mm, against Pro3 ±20 mm. It called Pro3 accuracy "good enough for most use cases" — [AEC Magazine [V]](https://aecmag.com/reality-capture-modelling/matterport-pro3-camera-places-greater-emphasis-on-aec/)

**Consumer 360° cameras (no depth sensor)**
- Matterport's June 2026 list — [Matterport 2026 guide [V]](https://matterport.com/en-GB/blog/unveiling-the-perfect-lens-cameras-compatible-with-matterports-spatial-data):
  - Insta360 X3, Insta360 X5, Ricoh Theta X, Ricoh Theta Z1 and Ricoh Theta A1. The A1 launched in June 2025 and is "not yet officially available to US buyers".
  - Unsupported cameras can use an "Import 360 feature".
  - The guide says lower-cost third-party cameras trade off "measurement accuracy and point cloud density".
- Older, dated compatibility lists:
  - The 2021 Android launch listed Insta360 ONE X, ONE R and ONE X2, and Ricoh Theta Z1, V and SC2 — [Matterport blog [S]](https://matterport.com/blog/matterport-capture-app-android-officially-here)
  - iOS added ONE X2, ONE R and ONE RS 1-Inch in December 2022 — [PetaPixel [S]](https://petapixel.com/2022/12/08/select-insta360-cameras-are-now-compatible-with-matterport)
  - An April 2025 snapshot of the support list did not include Insta360 X4 — [WGAN forum [S][3P]](https://www.wegetaroundnetwork.com/topic/20864/matterport-to-support-insta360-x4-and-insta360-x5-in-2025)
- For these cameras, Cortex is "an AI-powered, computer-vision processor that infers 3D models from the 360° data". The source stresses that it is "not taking the 360° images and generating a model with photogrammetry" and that "the system is not actually capturing 3D data per se" (February 13, 2019) — [Geo Week News [V]](https://www.geoweeknews.com/articles/matterport-cortex-gets-quick-3d-from-360-photos-using-ai-and-computer-vision/)

**Smartphones**
- Capture on iPhones and iPads without LiDAR has been available since May 2020 — [Geo Week News 2020 [S]](https://geoweeknews.com/news/matterport-capture-brings-3d-digital-twins-to-iphones)
- Capture app 4.1 added LiDAR capture as a beta for the iPad Pro and iPhone 12 Pro/Pro Max (February 18, 2021). Matterport wrote: "Our camera has long had active depth sensing." The post gives no accuracy figures — [Matterport blog [V]](https://matterport.com/blog/matterport-iphone-lidar-support-here)
- Android capture (2021): more than 3,500 supported devices, Android 9 or later, and an ultra-wide camera recommended — [Matterport news [S]](https://matterport.com/news/matterport-now-available-billions-android-customers-175-countries); [compatible devices page [S]](https://matterport.com/en-gb/compatible-mobile-devices)
- Matterport's 10-K says "Our capture apps are commercially available for both iOS and Android" and that the platform "is designed to work with a wide range of LiDAR, spherical, 3D and 360 cameras" — [10-K FY2024 [V]](https://www.sec.gov/Archives/edgar/data/1819394/000181939425000007/mttr-20241231.htm)
- The June 2026 guide still says "you can even get started using a smartphone with the Matterport app" — [V](https://matterport.com/en-GB/blog/unveiling-the-perfect-lens-cameras-compatible-with-matterports-spatial-data)
- Matterport Axis, a motorized phone mount (launch year not verified) — [Matterport Axis store page [S]](https://matterport.com/store/product/cam-axis):
  - Depth-data capture works only on LiDAR phones.
  - One rotation takes about 28 s with LiDAR (iPhone 12/13 Pro) and about 14 s without.
  - Recommended placement is 0.5–1 m from walls, moving 1.5–2 m between setups.
  - The launch release claimed better speed, precision and consistency for phone capture (paraphrased) — [CRETECH repost of launch release [S]](https://www.cretech.com/News/page/177)

**Accuracy Matterport publishes per device class**

| Device class | Depth source | Matterport-published accuracy | Source |
|---|---|---|---|
| Pro3 | LiDAR, 904 nm | ±20 mm @ 10 m on raw depth (about 0.2%). Paraphrasing Support: the figure describes a single horizontal reading under test conditions; measurements viewers take in Showcase come out similar for Pro3 and Pro2, and the Pro3's advantage shows up in E57 generation | [store [V]](https://matterport.com/store/product/pro3-plus-package); [Support "Measurement Accuracy in Matterport Spaces", updated April 2026 [S]](https://support.matterport.com/s/article/How-accurate-are-dimensions-in-Matterport-Spaces?language=en_US) |
| Pro2 / original Pro | Structured-light IR | ±1%. In Matterport's test of one US home, room dimensions usually came within about 1% of a Leica laser reference rated ±1 mm. A 5.761 m living room was usually within about 6 cm, worst case about 12 cm | [cameras page [V]](https://matterport.com/cameras); [Support [S]](https://support.matterport.com/s/article/How-accurate-are-dimensions-in-Matterport-Spaces?language=en_US) |
| Leica BLK360 | Laser scanner | "millimeter-level precision" | [2026 guide [V]](https://matterport.com/en-GB/blog/unveiling-the-perfect-lens-cameras-compatible-with-matterports-spatial-data) |
| 360° cameras (Ricoh Theta, Insta360) | Cortex inference from images | About 4–5% average, and no single-scan figure is published (2026). Older: 4–8% (Capture 3.0 FAQ, about 2020–21) and "8% max error" (2019 beta). About 10% for 360° views converted to 3D | [Support [S]](https://support.matterport.com/s/article/How-accurate-are-dimensions-in-Matterport-Spaces?language=en_US); [Capture 3.0 FAQ [S]](https://support.matterport.com/hc/en-us/articles/360016184514-FAQ-Matterport-Capture-3-0); [Geo Week 2019 [V]](https://www.geoweeknews.com/articles/matterport-cortex-gets-quick-3d-from-360-photos-using-ai-and-computer-vision/); [Support: convert 360 view [S]](https://support.matterport.com/s/article/How-to-Convert-a-360-View-to-a-3D-Scan?language=en_US) |
| Phones without LiDAR (iPhone, Android) | Cortex inference from photos | Grouped with 360° cameras: about 4–5% average for 360° or smartphone captures made with Axis (paraphrased). I found no separate figure | [Support [S]](https://support.matterport.com/s/article/How-accurate-are-dimensions-in-Matterport-Spaces?language=en_US) |
| iPhone/iPad with LiDAR | Apple LiDAR (plus Cortex) | No Matterport-published figure found | (gap) |

- Supporting caveats from Matterport Support:
  - Older guidance put typical error near 1% in standard use, so a 3 m room could be off by up to about 3 cm. Lost calibration or unusual temperatures can reduce accuracy — [older Support article [S]](https://support.matterport.com/hc/en-us/articles/212629928-How-accurate-are-dimensions-in-Matterport-Spaces-)
  - Matterport does not guarantee the accuracy of point clouds and meshes built from 360-derived or hybrid depth — [Support: MatterPak [S]](https://support.matterport.com/s/article/Download-the-MatterPak-Bundle?language=en_US)
- Third-party and conflicting claims:
  - A third-party FAQ says Pro3 is about ±1% (≈±2 cm at 10 m). That is internally inconsistent, since 1% of 10 m is 10 cm, and it contradicts Matterport's own 0.2% — [Thefuture3d [S][3P]](https://www.thefuture3d.com/faq/equipment/matterport-pro3-accuracy/)
  - A non-Matterport site claims about 1% with iPhone LiDAR and about 5% without, with no method given — [hometrack.net [S][3P]](https://www.hometrack.net/matterport-for-iphone-now-supports-lidar)
  - One search summary of the Support article reported a Pro2 table value of "±54 mm (~1%)" with no distance given. AEC Magazine reports ±44–58 mm at 4.5 m. I could not reconcile the two.
- Independent study, IEEE Consumer Electronics Magazine (arXiv 2506.14771, submitted March 27, 2025) — [arXiv [V]](https://arxiv.org/abs/2506.14771):
  - It scanned a six-floor, 17,567 m² building from 1,099 scan positions with a Pro3 and an iPhone (model not stated).
  - The Pro3 produced 1,877,324 points against 506,961 for the iPhone. Pro3 alignment RMSE was 1.18 cm.
  - The cloud-to-cloud distance between the two models had a mean of 4.08 cm and a standard deviation of 7.15 cm.
  - The authors judged the Pro3 better suited to large projects. The abstract does not say which model is closer to ground truth.

### Inferences
- At the scale of one room, Matterport's own device classes differ by about 1% (active depth) versus about 4–5% (image-only). On a 4 m wall that is about 4 cm versus about 16–20 cm. For a 2.2 m sofa the image-only error is about ±9–11 cm, enough to look "slightly off" but probably acceptable for a demo. LiDAR phones should land between the two classes, but Matterport publishes no number for them.
- The Pro3's 0.2% advantage mostly shows in long-range data and E57 point clouds, not in everyday measurements inside the Showcase viewer, which Matterport says are similar for Pro2 and Pro3 [S]. So for a consumer use case like YoungVista's, the Pro3's accuracy premium matters little.
- The Pro2 may be in wind-down: it is missing from the June 2026 camera guide and FY2024 camera volumes fell (see Q5). This is not confirmed.

### Gaps
- The full table in Matterport Support's "Measurement Accuracy in Matterport Spaces" (updated April 2026) could not be loaded, so the 360/phone figures come from search-index text only.
- I found no official accuracy figure for LiDAR iPhone capture, and no current Matterport accuracy statement for Android.
- Not found: the current standalone US price of the Pro3, the Axis price, and whether the Pro2 is still sold new in 2026.
- I found no independent controlled test at room scale comparing Matterport phone capture with Pro3 against a laser reference.

## 2. Capture workflow, reconstruction, and how the Showcase walkthrough renders (where visual quality comes from)

### Takeaway
A Matterport capture is a series of stationary 360° scans ("sweeps"). Each sweep yields an HDR panorama plus depth data. Scans are registered to each other automatically, and the cloud then builds a textured mesh (for dollhouse and floor-plan views), a point cloud, and floor plans. Matterport's data model and patents point to an image-based viewer: in the "Inside view" you stand only at capture points and look at high-resolution panoramas, while the coarser mesh supports navigation, transitions, the dollhouse and measurement picking. This is a well-supported inference, but I found no official technical write-up of the renderer. It implies that most of Matterport's visual quality comes from photographic capture discipline (HDR, high resolution, a level tripod at fixed points), not from the mesh.

### Cited Findings
- Each Pro3 sweep takes "<20 seconds". It produces a 134.2 MP panorama from 5 HDR exposures at "four camera stops", applies "Automatic, full model" white balance, records up to 1.5M depth points, and is registered automatically — [Matterport store [V]](https://matterport.com/store/product/pro3-plus-package)
- In the Pro2 era, Matterport said a typical home averaged about 60 scans, each made of about 127 photographs. Cortex was trained on Pro2 color images and depth maps from about 1.5 million homes, and the platform was adding 100,000 scans a month (2019) — [Geo Week News [V]](https://www.geoweeknews.com/articles/matterport-cortex-gets-quick-3d-from-360-photos-using-ai-and-computer-vision/)
- What a model contains, per the Matterport Model API, which exposes "the OBJ mesh file, the point cloud file, panoramic imagery, position points, and Tags". The API "can only currently get and set model details, assets, Mattertags, labels, and bundles", so meshes cannot be edited through it — [Matterport developer docs [V]](https://matterport.github.io/developer-docs/api/)
- The Bundle SDK gives "direct access to the 3d engine, renderer, scene graph and more". Its examples include "Sensors - Sweep Control", and its components include GLTF, DAE, FBX and OBJ loaders, Camera and XR — [Showcase SDK Bundle docs [V]](https://matterport.github.io/showcase-sdk/sdkbundle_home.html)
- Viewer modes as of July 21, 2026: "Dollhouse, Floor Plan, Inside view" (the owner chooses which are enabled) — [Matterport blog [V]](https://matterport.com/blog/refreshing-the-way-to-explore-your-digital-twins)
- Matterport patents [S]:
  - US 9,786,097 (filed June 2013, granted October 2017) covers smooth, accelerating then decelerating transitions between views of a 3D model — [uspto.report](https://uspto.report/patent/grant/9786097)
  - US 10,163,261 (filed March 2014, granted December 2018) covers transitioning from a 3D model view to a user-selected 2D image — [uspto.report](https://uspto.report/patent/grant/10163261)
  - A forum thread describes a Matterport patent covering orbit (dollhouse), floor-plan, walking and transition modes — [WGAN forum [S][3P]](https://www.wegetaroundnetwork.com/topic/6342/matterport-awarded-patent-for-dollhouse-tour)
- Dollhouse mesh quality (community reports only):
  - A 2014 Hacker News commenter, possibly an insider (unconfirmed), described the dollhouse as a low-detail model with low-resolution textures, chosen for fast loading and mobile performance — [Hacker News [S][3P]](https://news.ycombinator.com/item?id=8531840)
  - Pro3 owners report the dollhouse looks soft at normal viewing distance. One speculated about an older cap of about 50,000 polygons — [WGAN forum [S][3P]](https://wegetaroundnetwork.com/topic/18085/pro3-anyone-experiencing-dollhouse-view-mesh-quality-issues-with-pro3)
- Processed Pro3 models use a 20 m "standard range", while E57 exports keep data out to 100 m — [Matterport store [V]](https://matterport.com/store/product/pro3-plus-package). In other words, the viewer model is a reduced product compared with the raw scan data.
- Downloadable data: MatterPaks extract "floor plans, point cloud files, and OBJ files from digital twins", and E57 is a separate high-density point-cloud product — [AEC Magazine 2022 [V]](https://aecmag.com/reality-capture-modelling/matterport-pro3-camera-places-greater-emphasis-on-aec/)
- "Merge" (Fall 2024) combines several digital twins or parts of them, so teams can scan areas in parallel and merge later — [Matterport Fall 2024 blog [V]](https://matterport.com/blog/matterports-fall-2024-release-insights-meets-imagination)
- "Point Cloud Import", shown at Autodesk University 2026 (article dated October 11, 2026), turns an already-registered E57 into a navigable Matterport model. Matterport "allows you to lock the registration and preserve the geometry contained in the E57" — [AEC Magazine [V]](https://aecmag.com/reality-capture-modelling/matterport-embraces-point-clouds/)
- Matterport's AI defurnishing research works directly on "indoor panorama images", specifically equirectangular panoramas. The pipeline: segmentation masks, then a custom Stable Diffusion-based inpainter fine-tuned on panoramas, then super-resolution, then blending with the original (CVPR 2024 workshops; arXiv 2405.03682) — [Matterport research page [V]](https://matterport.github.io/automatic-defurnishing-of-indoor-panoramas)
- Matterport's phone capture guidance (Axis): 0.5–1 m from walls, 1.5–2 m between setups — [Axis store page [S]](https://matterport.com/store/product/cam-axis). 360-camera capture with a tripod covers about 7,000–8,000 sq ft per hour. Going without a tripod covers 10,000–20,000 sq ft per hour but "results in a lower quality visualization and the presence of the operator in the image" (2019) — [Geo Week News [V]](https://www.geoweeknews.com/articles/matterport-cortex-gets-quick-3d-from-360-photos-using-ai-and-computer-vision/)

### Inferences
- How the walkthrough most likely renders, given panoramas plus "position points" plus a mesh in the data model, the patents on 3D-to-2D-image transitions, and the community reports of a low-detail dollhouse mesh:
  - The Showcase "Inside view" is image-based rendering of the HDR panorama at each sweep.
  - Clicking moves you to another sweep. The mesh drives the animated transition (panorama textures projected onto geometry), the dollhouse and floor-plan views, and depth for measurement and tag placement.
  - The user cannot roam freely between capture points.
- Visual quality therefore comes mostly from the camera side: high-resolution HDR panoramas taken from a stable, level, parallax-free rotation centre, with consistent white balance across the model. Geometry quality is largely invisible in Inside view but drives measurements and the dollhouse.
- So the team's theory ("the camera is not the special part") is only half right for visuals. The *sensor* is not special for room scale, but the *capture discipline* (fixed rotation centre, multi-exposure HDR, levelled tripod) is a big part of why Matterport tours look good. Phones can approach this with a mount or tripod plus bracketed exposures. Handheld spins by a novice will show stitching seams, parallax and exposure problems. Matterport's own Axis product exists to fix exactly that; it is marketed on precision and consistency.
- For YoungVista's furniture placement: in a panorama-based viewer, inserted GLB furniture needs depth and occlusion from the mesh to look correctly "behind" real objects. Free-viewpoint orbiting around the furniture needs a decent mesh or a different representation, such as splats or a cleaned room-layout model. Those are covered by the open-source reconstruction researcher.
- Matterport applies AI edits (defurnish) per panorama in image space, which suggests YoungVista's "AI-polished final image" could likewise be generated per viewpoint image rather than by editing the 3D model.

### Gaps
- I found no official Matterport document describing the Showcase renderer: cube-map versus equirectangular tiles, mesh polygon budget, texture resolution, or how transitions blend.
- The claims of the patents above were not read in full (the uspto.report pages returned 403).
- How Cortex reconstructs geometry for image-only captures (monocular depth versus multi-view fusion) is described only at a high level in public sources.

## 3. How measurements are derived per device class; accuracy of the measurement tool, automated measurements, floor plans and exports

### Takeaway
Measurements in Matterport are taken on the reconstructed 3D geometry. That geometry comes from sensor depth for Pro3, Pro2, BLK360 and LiDAR phones, and from depth that Cortex infers for 360° cameras and non-LiDAR phones, so accuracy is inherited from the capture device. In Matterport's own testing, viewer measurements are about 1% for active-depth cameras and about 4–5% for 360° or phone captures. Automated room measurements ("Property Intelligence", 2024) are now a free, owner-enabled feature. Schematic floor plans, CAD, E57 and BIM files are paid add-ons with few published accuracy guarantees.

### Cited Findings
- Measurement tool: "Measuring" is one of the "tools built into every Matterport digital twin". As of July 2026: "Any viewer can view automated measurements on any twin if the owner has provided the free feature through their account" — [Matterport blog, July 21, 2026 [V]](https://matterport.com/blog/refreshing-the-way-to-explore-your-digital-twins)
- Property Intelligence (launched February 15, 2024) — [Matterport press release [V]](https://matterport.com/news/matterport-launches-property-intelligence-transforming-real-estate):
  - It is "a collection of AI-powered features" with "automated measurements, layouts, editing, and reporting capabilities".
  - It comes with "RICS-standard schematic floor plans" and a "Matterport CAD file add-on" that converts point-cloud data to DWG/DXF.
  - The release gives no accuracy figures.
- Secondary reports on the automated measurements:
  - A later version reportedly added ceiling heights — [3dmart [S][3P]](https://3dmart.com.tw/en/blogs/news/matterport-fall-release-2024)
  - A forum tester in a large event space found automated measurements appear only within about 10 m — [WGAN forum [S][3P]](https://www.wegetaroundnetwork.com/topic/20318/matterport-digital-twin-with-property-intelligence-measurements-feature/)
- Error sources Matterport names — [Matterport Support accuracy article [S]](https://support.matterport.com/s/article/How-accurate-are-dimensions-in-Matterport-Spaces?language=en_US):
  - Gaps in scan coverage degrade automated room dimensions.
  - Simple rooms often measure more precisely than L-shaped rooms.
  - Point-cloud measurements are best within about 10 m; farther readings are for relative ranging rather than precision work.
- Active-depth devices measure depth directly: Pro3 LiDAR on raw depth ±20 mm at 10 m — [store [V]](https://matterport.com/store/product/pro3-plus-package); Pro2 structured light ±1% — [cameras page [V]](https://matterport.com/cameras)
- For image-only devices, Cortex was trained "to recognize how the RGB data for an object relates to that object's depth measurements" using Pro2 RGB-D data (2019) — [Geo Week News [V]](https://www.geoweeknews.com/articles/matterport-cortex-gets-quick-3d-from-360-photos-using-ai-and-computer-vision/)
  - Matterport's Tomer Poran said the approach sits "at the low end of the accuracy spectrum", with "an 8% max error".
  - The author warned "don't expect survey-grade accuracy" — [same [V]]
- Matterport says Showcase measurements are similar for Pro3 and Pro2, and that the Pro3 advantage appears in E57 output — [Support [S]](https://support.matterport.com/s/article/How-accurate-are-dimensions-in-Matterport-Spaces?language=en_US)
- Exports and deliverables:
  - E57 point clouds (Pro3 data up to 100 m) — [store [V]](https://matterport.com/store/product/pro3-plus-package)
  - MatterPak (floor plans, point cloud, OBJ) — [AEC Magazine 2022 [V]](https://aecmag.com/reality-capture-modelling/matterport-pro3-camera-places-greater-emphasis-on-aec/)
  - Floor plans and MatterPaks can be bought programmatically through the Model API — [developer docs [V]](https://matterport.github.io/developer-docs/api/)
  - Matterport warns that point clouds and meshes from 360-derived or hybrid depth carry no accuracy guarantee — [Support: MatterPak [S]](https://support.matterport.com/s/article/Download-the-MatterPak-Bundle?language=en_US)
- BIM exports (third-party descriptions):
  - Matterport's automated BIM output is LOD 200: placeholder-style elements fitted to the scan, delivered as RVT or IFC — [Reality Capture Experts [S][3P]](https://realitycaptureexperts.com/matterport-accuracy/)
  - One firm treats a 15 mm wall-face tolerance as the LOD 300 threshold. It reports that Pro3 scans usually meet it for well-captured interiors within about 20 m, but still spot-checks structural points — [Enginyring [S][3P]](https://www.enginyring.com/en/blog/matterport-and-handheld-lidar-to-cad-bim-turning-consumer-scans-into-dwg-and-ifc)

### Inferences
- The "close enough that a sofa looks about right" target matches roughly what Matterport already sells commercially for phone and 360° capture (about 4–5% average). Matterport considers that tier good enough for real estate marketing, though not for construction.
- Viewer measurements depend on how good the mesh is at the picked points. Glass, mirrors, dark or shiny surfaces and coverage gaps cause the largest errors. This fits Matterport's "holes degrade automated dimensions" note and matters equally for a phone-only app.
- Matterport offers no accuracy guarantee for floor plans or BIM. Its stronger accuracy claims are tied to raw Pro3 depth and E57, which consumers would never use.

### Gaps
- No official accuracy figure was found for schematic floor plans, the CAD add-on or the BIM files.
- No current per-item prices were found for floor plans, MatterPak, E57 or BIM (the plans and Support pages did not render).
- Property Intelligence's exact current outputs (room labels, square footage, ceiling heights) could not be confirmed from a primary source. The "AI-Enabled Property Intelligence FAQs" Support article did not load.

## 4. Software and AI features as of November 2026: Cortex, labeling, defurnish, generative redesign ("Project Genesis"), virtual staging and furniture placement

### Takeaway
Cortex, which infers geometry from images and was trained on years of Pro2/Pro3 RGB-D data, is the core of Matterport's AI. AI features that have shipped as of November 2026 are free, owner-enabled defurnishing (labelled "AI Enhanced"), automated measurements and Property Intelligence, AI property descriptions, and merge. The second phase of Project Genesis, AI-generated furnishing and redesign, was announced in 2023–2024 and called "coming soon" in October 2024. I found no evidence it had shipped by November 2026. Placing furniture inside Matterport tours is possible only through the SDK ("3D object insertion") or third-party staging vendors; there is no built-in product catalog placement.

### Cited Findings
- The 10-K calls Cortex "our AI-powered software engine that includes a precision DL neural network". It says "The Pro3 and Pro2 Cameras have driven adoption of our solutions" and credits them with building Cortex's training dataset. Scale as of December 31, 2024: about 14.1 million spaces under management, about 50.7 billion captured sq ft, and over 1.1 million subscribers. A separate Genesis section of the same filing cites 38 billion sq ft, which is internally inconsistent — [10-K FY2024 [V]](https://www.sec.gov/Archives/edgar/data/1819394/000181939425000007/mttr-20241231.htm)
- Project Genesis was announced in June 2023 as a generative-AI initiative for buildings — [Geo Week News, June 15, 2023 [S]](https://www.geoweeknews.com/articles/matterport-genesis/)
- February 2024 description of Genesis — [Matterport press release [V]](https://matterport.com/news/matterport-launches-property-intelligence-transforming-real-estate):
  - Phase 1: "customers will be able to de-furnish an entire space, remove items from the property, or clean out the clutter".
  - Next phase: "reimagine an entire property with AI-generated interior design styles and furnishings".
  - First beta "later this year" (2024).
  - The floor-plan upgrade in the same release includes "the ability to add or remove furniture" (schematic, 2D).
- The Fall 2024 release (October 1, 2024) shipped Defurnish ("With a single click, users can now transform a cluttered living room…into a clean, open space"), Automatic Property Descriptions, Merge, Field Tags and others. It also said: "coming soon…Matterport's interior design tools", which will let users "digitally furnish and redesign spaces with ease" — [Matterport blog [V]](https://matterport.com/blog/matterports-fall-2024-release-insights-meets-imagination)
- Defurnishing research — [Matterport research page [V]](https://matterport.github.io/automatic-defurnishing-of-indoor-panoramas):
  - "An Empty Room is All We Want: Automatic Defurnishing of Indoor Panoramas" (CVPR 2024 workshops, arXiv 2405.03682).
  - Method: segmentation, then a custom inpainter built on Stable Diffusion and fine-tuned on panoramas, then super-resolution.
  - Baselines compared: SD2 Inpainting, LaMa and LGPN-Net.
  - **No code, weights or license are released**.
- Winter 2025 release (February 2025) highlighted AI-generated marketing content and real-time collaboration — [Matterport news [S]](https://matterport.com/fr/news/matterport-2025-winter-release-productivity-multiplied-delivers-the-next)
- A September 2025 article places defurnishing within a broader push toward redesign, virtual furnishing and restyling, and notes inpainting can still introduce errors — [Geo Week News, September 16, 2025 [S]](https://www.geoweeknews.com/news/sometimes-a-quick-look-is-all-you-need)
- Current state (July 21, 2026 Showcase refresh) — [Matterport blog [V]](https://matterport.com/blog/refreshing-the-way-to-explore-your-digital-twins):
  - "Defurnish a room with an AI-powered tool that clears out the furniture". It is free, labelled "AI Enhanced", and usable by "anyone with the link" when enabled at account level.
  - The post also covers side-by-side comparison over time, merge, tags and plugins (Minimap, Compass, Color Adjustments (beta), Business Card, Quick Link), plus free integrations with Autodesk Forma and Procore.
  - **No furnishing, redesign, virtual-staging or interior-design tool is mentioned.**
- Labels: room and area labels became visible in Dollhouse view in July 2021. These are labels added by the owner, not automatic object detection — [Matterport blog [V]](https://matterport.com/blog/dollhouse-view-just-got-upgrade)
- Third-party furniture placement:
  - Matterport's developer tools launch (November 30, 2020) explicitly lists "Use 3D object insertion to enable virtual staging and other real-time 3D space modifications" — [Matterport blog [V]](https://matterport.com/blog/announcing-general-availability-matterport-developer-tools)
  - Virtual staging for Matterport is largely done by outside vendors such as Styldod and roOomy (September 2025 roundup) — [HousingWire [S][3P]](https://develop.housingwire.com/articles/virtual-staging-companies-apps/)
- Licenses of open models and datasets that come up here:
  - **Stable Diffusion 2 Inpainting**: CreativeML Open RAIL++-M per the model readme — [Replicate model page [S]](https://internal.replicate.com/cjwbw/stable-diffusion-v2-inpainting); [PromptLayer [S]](https://www.promptlayer.com/models/stable-diffusion-2-inpainting). From background knowledge, not verified here, OpenRAIL++ permits commercial use subject to use-based restrictions. Check the [official model card](https://huggingface.co/stabilityai/stable-diffusion-2-inpainting).
  - **LaMa**: tagged Apache-2.0 on community Hugging Face mirrors — [big-lama mirror [S]](https://huggingface.co/smartywu/big-lama/raw/main/README.md). Apache-2.0 allows commercial use. I did not verify the [upstream repository](https://github.com/advimman/lama) license.
  - **HM3D (Habitat-Matterport 3D) dataset**: governed by Matterport's "End User License Agreement for Academic Use of Model Data", which allows **academic, non-commercial use only** — [Matterport EULA [S]](https://matterport.com/matterport-end-user-license-agreement-academic-use-model-data); [HM3D repo [S]](https://github.com/facebookresearch/habitat-matterport3d-dataset). The repository code is MIT, but trained models are treated as derived data — [same [S]].
  - **Matterport3D (MP3D) dataset**: access is gated by a signed Terms of Use. It is commonly described as research-only. I did not read the ToS; it is linked from the dataset README as `http://kaldir.vc.in.tum.de/matterport/MP_TOS.pdf`.

### Inferences
- Matterport's AI roadmap aims at clearing a space (defurnish) and eventually re-styling it. It does not aim at placing real catalog products at true scale, which is YoungVista's core. Even when Genesis ships, it would produce AI-imagined furniture, not a specific sofa SKU at exact dimensions. Matterport is not a direct functional competitor for "will this exact sofa fit", though it could become one for "imagine this room furnished".
- Matterport does AI edits in panorama image space, so YoungVista's "AI-polished final image" step (render the GLB into the captured view, then harmonize or relight with a generative model) is consistent with how Matterport ships AI. Defurnishing is a useful precursor for furniture placement, because removing the old sofa before placing the new one is a common consumer need. Details are left to the AI image-generation researcher.
- HM3D and MP3D are the best-known large indoor RGB-D scan datasets, and both are non-commercial. A startup cannot legally use them to train a commercial "Cortex-like" model.

### Gaps
- I found no 2026 Matterport release notes confirming the status of Genesis phase 2 (AI furnishing and redesign). It may be in private beta, renamed, or dropped.
- Not confirmed: whether automatic room-type or object labeling ships today as part of Property Intelligence.
- Defurnish quality limits (failure rates, plan restrictions) have no primary data.

## 5. Business status: CoStar acquisition, pricing tiers, developer platform, and whether a third party could build a consumer app on Matterport (and at what cost)

### Takeaway
Matterport has been a wholly owned CoStar Group subsidiary since February 28, 2025 (about $1.6B, $5.50 per share in half cash, half stock). It is delisted from Nasdaq, under interim leadership by May 2026, and caught up in the CoStar–Zillow fight: Zillow removed Matterport tours on October 20, 2025. Software plans run Free → Starter → Professional → Business → Enterprise. Developer tools are real (Embed SDK, Bundle SDK with glTF loaders, GraphQL Model API), but production use requires SDK keys, a license and agreement, and Enterprise for the Account and Import APIs. A third-party B2C app on top of Matterport is technically possible. It is a poor fit economically, for UX, and for platform risk.

### Cited Findings
**Acquisition and ownership**
- The merger agreement was signed April 21, 2024, with each Matterport share exchanged for "$2.75 in cash" plus CoStar stock. Both companies received FTC Second Requests on July 3, 2024. A termination fee of $85M was payable by CoStar in certain cases — [10-K FY2024 [V]](https://www.sec.gov/Archives/edgar/data/1819394/000181939425000007/mttr-20241231.htm)
- The deal completed on February 28, 2025, at about $1.6B enterprise value, $5.50 per share split evenly between cash and CoStar stock, and Matterport left Nasdaq — [BusinessWire release (fetch blocked, 403)](https://www.businesswire.com/news/home/20250228873241/en); details via [RISMedia [S]](https://www.rismedia.com/2025/03/03/costar-completes-acquisition-matterport-which-delists-from-nasdaq/) and [Online Marketplaces [S]](https://www.onlinemarketplaces.com/articles/costar-completes-1-6-billion-matterport-acquisition/)
- CoStar's 2025 proxy says four CoStar brands already display Matterport tours. One search summary also said the proxy dates first disclosure to March 2024, which conflicts with the April 2024 announcement elsewhere and is probably a summarization error — [CoStar DEF 14A [S]](https://www.sec.gov/Archives/edgar/data/1057352/000119312525107493/d821281ddef14a.htm)
- A third-party summary of CoStar's Q2 2025 earnings reports 67 million Matterport tour views (+193%) on CoStar sites — [VectorShift summary [S][3P]](https://vectorshift.ai/research/companies/costar-group/earnings/2025-q2-summary)
- Leadership: RJ Pittman was Chairman and CEO as of January 2025 — [press release repost [S]](https://business.mammothtimes.com/mammothtimes/article/gnwcq-2025-1-27-matterport-chairman-and-ceo-rj-pittman-recognized-as-inman-power-player-for-third-consecutive-year). By May 14, 2026, Matterport's blog was signed by Rob Hines as interim leader of Matterport (paraphrased) — [Matterport blog [V]](https://matterport.com/blog/matterport-customers-remain-free-to-publish-their-3d-tours-anywhere)

**Zillow dispute (platform-risk evidence)**
- On October 20, 2025, Zillow removed Matterport tours from Zillow.com and StreetEasy. Zillow's statement: "CoStar recently elected not to renew its Matterport API agreement with Zillow" and "changed its terms of service". CoStar replied: "Neither Matterport's nor CoStar Group's media licensing terms have changed", and said customers "can share their Spaces anywhere, including on Zillow". The same article notes agents may turn to alternatives such as Zillow 3D Home — [Real Estate News [V]](https://www.realestatenews.com/2025/10/20/zillow-pulls-matterport-tours-from-listings-blames-costar)
- On May 14, 2026, Matterport called the removal "Zillow's unilateral decision", noted that "Both Homes.com and Realtor.com are displaying Matterport 3D tours", and asked Zillow to "restore Matterport 3D tours". This implies the tours had not been restored as of May 2026 — [Matterport blog [V]](https://matterport.com/blog/matterport-customers-remain-free-to-publish-their-3d-tours-anywhere)

**Financials (FY2024 is the last public year; I found no later standalone Matterport filing after the delisting)**
- FY2024 vs FY2023, in $ thousands — [10-K FY2024 [V]](https://www.sec.gov/Archives/edgar/data/1819394/000181939425000007/mttr-20241231.htm):
  - Subscription revenue: 99,590 vs 87,348.
  - Services revenue: 41,264 vs 37,621.
  - Product revenue: 28,845 vs 32,779.
  - Cost of product revenue: 25,926 vs 31,608.
  - Cost of subscription revenue: 32,567 vs 29,007.
  - Product's share of revenue: 17% (2024), 21% (2023), 26% (2022).
  - Product revenue covers Pro3, Pro2 and Axis sales plus out-of-warranty repairs. It fell "primarily due to the lower sales volume of our Pro2 and Pro3 cameras".
  - Overall gross margin was 49% versus 45%, improved mainly by subscription margin.
- Gross margins from those figures (my arithmetic, not stated in the filing): product 3.6% in 2023 and 10.1% in 2024; subscription 66.8% in 2023 and 67.3% in 2024; services 31.4% in 2024.
- Strategy statements in the 10-K: "Our fundamental go-to-market model is built upon a subscription first, capture device agnostic approach". The platform aims to "eliminate camera hardware dependencies". "AI and ML also make costly cameras unnecessary for everyday captures" — [10-K FY2024 [V]](https://www.sec.gov/Archives/edgar/data/1819394/000181939425000007/mttr-20241231.htm)

**Pricing (the official plans page would not render, so figures come from third parties and snippets)**
- Tiers are Free, Starter, Professional, Business and Enterprise. Annual billing saves "up to 16%". Business covers 100–300 active spaces, 50 users and 500 GB attachments; Professional is priced by active space count over a 20–150 range with 10 users — [matterport.com/plans [S]](https://matterport.com/plans)
- Third-party price points: Free = 1 active space; Starter about $9.99–10 per month for 5 spaces; Professional about $69 per month for 25 spaces; Business about $309 per month and up — [SofaBrain, reviewed May 2026 [S][3P]](https://sofabrain.com/learn/matterport-pricing); [TrustRadius [S][3P]](https://www.trustradius.com/products/matterport/pricing)
  - Prices reportedly rose slightly from late June 2025 — [WGAN forum [S][3P]](https://www.wegetaroundnetwork.com/topic/20905/wgan-tv--matterport-subscription-price-increase-for-all-customers)
  - SofaBrain also cites "about $20 per active space monthly" hosting, which conflicts with the tier math above.
  - Toolradar claims Business has "unlimited spaces and API access", which conflicts with Matterport's own 100–300 range — [Toolradar [S][3P]](https://toolradar.com/tools/matterport/pricing)
- Pro3 bundle: $245 per month for 24 months, including Professional at 50 spaces — [Matterport store [V]](https://matterport.com/store/product/pro3-plus-package)

**Developer platform**
- The Showcase SDK has three distributions — [Showcase SDK docs [V]](https://matterport.github.io/showcase-sdk/):
  - The Embed SDK lets a web app "execute actions to control 3D Showcase" and "listen to events".
  - The Bundle SDK gives "direct access to the 3d engine, renderer, scene graph and more".
  - The WebComponent is in beta.
- Bundle SDK details — [Bundle docs [V]](https://matterport.github.io/showcase-sdk/sdkbundle_home.html):
  - Components include GLTF/DAE/FBX/OBJ loaders, Transform Controls, Camera, Input and XR.
  - Tutorials include "Working with Models" and "Using Scene Objects".
  - "Usage of the SDK constitutes your agreement with the Matterport SDK Agreement". An SDK key is required, and the showcase must be embedded in an iframe.
  - Rich media needs the developer's own Embed.ly keys.
- Model API (GraphQL) — [developer docs [V]](https://matterport.github.io/developer-docs/api/):
  - It is "available to users at all account levels", but "accounts have only Sandbox mode enabled by default".
  - The Account API requires "a developer tools license on any of our Enterprise SaaS Tiers".
  - Enterprise-only extensions include GeoCoords, Webhooks, Private Model Embed, Folders and the Import API (beta).
  - It accepts server-side requests only. Exceeding plan limits returns `quota.exceeded`, for example when "attempting to activate more models than allowed due to subscription limitations".
- Developer tools went GA on December 1, 2020, with usage-based "pricing tiers", and developers "only get charged once you move apps and workflows into production" (prices not stated) — [Matterport blog [V]](https://matterport.com/blog/announcing-general-availability-matterport-developer-tools)
- Unofficial, undated fee reports: about $150 per year for a developer license for private, internal, non-commercial use plus about $100 per year for an "Advanced Imagery Pack" (all panoramas). Another post says $250 per year — [WGAN forum [S][3P]](https://forum.we-get-around.com/topic/14261/matterport-allowed-msps-get-their-all-panos-finally/)

### Inferences
- **Could YoungVista build its consumer app on Matterport?** Technically yes for the web viewer. The Bundle SDK can load GLB furniture into a customer's Matterport model in the browser, and Matterport itself pitched "3D object insertion" for staging. Several things make it unattractive for a B2C phone app:
  1. Capture would have to run through Matterport's own Capture app (a separate app and account for the consumer), or through the Import API, which is Enterprise-only and in beta.
  2. Every customer room becomes an "active space" counted against YoungVista's plan. At the third-party tier prices that is about $2.5–3 per room per month (Professional ≈ $69/25; Business ≈ $309/100+), before developer, Enterprise and add-on fees. Costs grow with users who never convert.
  3. Matterport's SDK is a web player in an iframe. The live AR camera view on the phone would still need native ARKit/ARCore work, which Matterport does not provide.
  4. Platform risk is real. CoStar showed with Zillow that it will let API agreements lapse when strategic interests conflict. YoungVista is not a CoStar competitor today, but CoStar's strategy centres on real estate listings (Homes.com), not consumer interior design.
- A consumer can already make a Matterport twin of one room for free with a phone (Free plan, 1 active space). Matterport does not, however, offer catalog furniture placement or AR. That is YoungVista's opening.

### Gaps
- No official current dollar prices were found for plans, the developer license, Enterprise or add-ons. The plans and Support pages are JavaScript-rendered.
- Not found: CoStar's post-2024 disclosure of Matterport revenue, any changes to Matterport pricing or terms specifically attributable to CoStar, the text of the Matterport SDK Agreement (e.g. whether it restricts consumer apps or competitive uses), and when or why RJ Pittman stepped down.
- The October 21, 2025 and January 28, 2026 Matterport press releases referenced in the May 2026 blog were not located.

## 6. Testing the team's theory: what a phone-only app can match (with and without LiDAR), what needs dedicated hardware, and why Matterport still sells the Pro3

### Takeaway
For a single-room consumer demo, the theory is largely supported. Matterport itself sells phone-only capture (iPhone with or without LiDAR, Android) that produces the same Showcase experience, and its 10-K states that "AI and ML also make costly cameras unnecessary for everyday captures". Dedicated hardware still clearly wins on range, registration over large spaces, outdoor sun, HDR image quality, repeatable level capture positions, speed and survey/BIM-grade point clouds. The suspicion that Matterport has a *business* reason to sell hardware is half right. Cameras are not a profit centre (product gross margin was about 4–10%). What hardware does is lock customers into Professional-or-higher subscriptions, serve the AEC and large-property market, and (per Matterport) generate the RGB-D data behind Cortex.

### Cited Findings
**Evidence that phones can deliver the Matterport-like experience**
- Matterport runs phone capture on iPhone (with and without LiDAR) and Android, and the apps are "commercially available" — [10-K [V]](https://www.sec.gov/Archives/edgar/data/1819394/000181939425000007/mttr-20241231.htm); [LiDAR blog 2021 [V]](https://matterport.com/blog/matterport-iphone-lidar-support-here); [2026 guide [V]](https://matterport.com/en-GB/blog/unveiling-the-perfect-lens-cameras-compatible-with-matterports-spatial-data)
- Matterport's 10-K: "AI and ML also make costly cameras unnecessary for everyday captures"; strategy is "subscription first, capture device agnostic" — [10-K [V]](https://www.sec.gov/Archives/edgar/data/1819394/000181939425000007/mttr-20241231.htm)
- Phone and 360° captures average about 4–5% error in Matterport's own testing — [Support [S]](https://support.matterport.com/s/article/How-accurate-are-dimensions-in-Matterport-Spaces?language=en_US). Viewer measurements are similar between Pro2 and Pro3 — [same [S]]
- At building scale, an iPhone produced a usable point cloud that differed from the Pro3 model by 4.08 cm on average (standard deviation 7.15 cm) — [arXiv 2506.14771 [V]](https://arxiv.org/abs/2506.14771)

**Evidence for what needs dedicated hardware**
- Range: Pro3 reaches 20 m in processed models, up to 100 m in E57, and about 20 m vertically. Pro2 reaches up to 5 m — [store [V]](https://matterport.com/store/product/pro3-plus-package); [cameras page [V]](https://matterport.com/cameras). Phone LiDAR range belongs to the Apple Measure researcher's notes; I did not verify it here.
- Accuracy over large spaces and drift — [arXiv [V]](https://arxiv.org/abs/2506.14771):
  - Pro3: 1,877,324 points versus 506,961 for the iPhone, with Pro3 alignment RMSE of 1.18 cm and better alignment accuracy.
  - The authors judged the Pro3 better suited to large projects.
- Automatic registration: Pro3 has "Automatic" registration — [store [V]](https://matterport.com/store/product/pro3-plus-package)
- Outdoor capture: the Pro3 supports "full-sun capture outdoors", and its page notes that the LiDAR design means direct sun should not disrupt scans — [store [V]](https://matterport.com/store/product/pro3-plus-package). Matterport rates Pro2 only "Fair" outdoors, and AEC Magazine calls it "better suited to indoor spaces alone" — [cameras page [V]](https://matterport.com/cameras); [AEC Magazine [V]](https://aecmag.com/reality-capture-modelling/matterport-pro3-camera-places-greater-emphasis-on-aec/). That structured-light IR is washed out by sunlight is my own background knowledge, not a sourced statement.
- HDR image quality: Pro3 output is 134.2 MP from 5 HDR exposures at four stops, with model-wide white balance — [store [V]](https://matterport.com/store/product/pro3-plus-package). Lower-cost cameras trade off "measurement accuracy and point cloud density" — [2026 guide [V]](https://matterport.com/en-GB/blog/unveiling-the-perfect-lens-cameras-compatible-with-matterports-spatial-data)
- Consistent level capture positions:
  - Matterport sells the Axis motor mount to improve the speed, precision and consistency of phone capture (paraphrase of launch release) — [CRETECH [S]](https://www.cretech.com/News/page/177). Its guidance is 0.5–1 m from walls and 1.5–2 m between setups — [Axis page [S]](https://matterport.com/store/product/cam-axis)
  - Handheld 360° capture "results in a lower quality visualization and the presence of the operator in the image" — [Geo Week 2019 [V]](https://www.geoweeknews.com/articles/matterport-cortex-gets-quick-3d-from-360-photos-using-ai-and-computer-vision/)
- Speed: Pro3 takes under 20 s per sweep with more than 220 scans per battery — [store [V]](https://matterport.com/store/product/pro3-plus-package). Axis with a phone takes about 28 s per LiDAR rotation (about 14 s without), plus repositioning — [Axis page [S]](https://matterport.com/store/product/cam-axis)
- Survey and BIM-grade data: Pro3 has ±20 mm at 10 m raw depth for E57, but Matterport still says the BLK360 is the choice "when exacting precision is required" — [10-K [V]](https://www.sec.gov/Archives/edgar/data/1819394/000181939425000007/mttr-20241231.htm)

**Why Matterport still sells the Pro3 (evidence)**
- It serves different customers and spaces. Matterport rates Pro3 "Excellent" for large industrial, outdoor, luxury and as-built documentation, and only "Good" for small and medium residential — [cameras page [V]](https://matterport.com/cameras). Its 2022 launch emphasized AEC uses: as-built surveys, progress tracking, quality control and handover documentation — [AEC Magazine [V]](https://aecmag.com/reality-capture-modelling/matterport-pro3-camera-places-greater-emphasis-on-aec/)
- It anchors subscriptions. The Pro3 is sold as a 24-month Professional bundle ($245 per month) and requires "a Professional or higher plan" — [store [V]](https://matterport.com/store/product/pro3-plus-package)
- Hardware is not where the money is. Product gross margin was about 3.6% in 2023 and 10.1% in 2024, against about 67% for subscription (my arithmetic from the 10-K). Product revenue fell 12% in 2024 on lower camera volume — [10-K [V]](https://www.sec.gov/Archives/edgar/data/1819394/000181939425000007/mttr-20241231.htm)
- It feeds the data moat. Matterport says the Pro2 and Pro3 "have driven adoption of our solutions" and built the dataset behind Cortex — [10-K [V]](https://www.sec.gov/Archives/edgar/data/1819394/000181939425000007/mttr-20241231.htm). Cortex was trained on Pro2 RGB-D captures of about 1.5 million homes as of 2019 — [Geo Week News [V]](https://www.geoweeknews.com/articles/matterport-cortex-gets-quick-3d-from-360-photos-using-ai-and-computer-vision/)

### Inferences
**Capability matrix for YoungVista's demo (my assessment, built on the evidence above)**

| Matterport-like capability | Phone with LiDAR (iPhone Pro / iPad Pro) | Phone without LiDAR (most Android, base iPhones) | Needs dedicated hardware? |
|---|---|---|---|
| Room-scale dimensions good enough for a sofa (≈1–5%) | Yes. Likely near the active-depth class, but no official Matterport number | Mostly. Matterport's own image-only tier averages about 4–5% (about ±9–11 cm on a 2.2 m sofa) and benefits from a known reference scale | No |
| 360° panoramas for an Inside view | Yes, with a careful rotation-in-place UX; a tripod or mount helps a lot | Yes, same caveats | No, but quality gap (HDR, resolution, parallax) |
| Mesh for dollhouse view, occlusion and furniture collision | Yes, short range only | Only via AI-inferred depth or layout; coarser | No for one room; yes for large or multi-floor spaces |
| Web viewer with placed GLB products | Yes (a software problem, independent of the sensor) | Yes | No |
| Live AR camera view with products | Yes (native ARKit; Matterport does not offer this) | Yes (ARCore on supported devices) | No |
| Automatic floor plan, measurements | Yes, simple rooms | Approximate | No |
| Accuracy over a whole house or building without drift | Limited | Weak | Yes (Pro3 / laser scanner) |
| Range beyond about 5 m, tall ceilings, warehouses | No | No | Yes (Pro3 20 m in models, 100 m E57) |
| Outdoor capture in full sun | Limited | Image-only (no depth) | Yes (Pro3 LiDAR) |
| HDR panorama quality comparable to 134 MP, 5-exposure capture | Partial | Partial | Yes, for professional-grade visuals |
| Consistent level capture positions and speed at scale | With a mount or tripod only | With a mount or tripod only | Yes (tripod camera, <20 s per sweep, automatic registration) |
| Survey or BIM-grade E57 point clouds | No | No | Yes (Pro3, BLK360) |

- **The theory holds for YoungVista's milestone.** For one room and a "looks about right" sofa, phone-only capture is what Matterport itself sells for everyday captures. The things only hardware does well (range, large-space drift, outdoors, survey/BIM output, professional-speed capture) are mostly irrelevant to a consumer furnishing a room.
- **What the theory underestimates:**
  1. Capture UX for novices. Matterport needed a motorized mount to get consistent phone captures, and it built its tours on tripod-level panoramas from fixed points. A consumer spinning a phone by hand will produce worse panoramas and alignment, so YoungVista's software must guide the capture heavily.
  2. Cortex's advantage for non-LiDAR phones is a proprietary RGB-D training corpus of millions of spaces, which a startup cannot copy. The large Matterport-derived datasets (HM3D, MP3D) are non-commercial, so YoungVista would rely on commercially licensed depth models (other researcher) or on ARKit/ARCore depth and plane detection.
- **The "business reason" suspicion, refined.** The hardware itself has near-zero margin. Its business value is (a) a premium-tier subscription lock-in (24-month bundle), (b) credibility in AEC and commercial real estate, and (c) training data. Matterport's public strategy (device-agnostic, "cameras unnecessary for everyday captures") points toward software and away from hardware dependence, which supports the team's view that the value is in the software.
- For other researchers: Zillow 3D Home is a phone-based alternative that agents turned to after the Matterport removal ([Real Estate News [V]](https://www.realestatenews.com/2025/10/20/zillow-pulls-matterport-tours-from-listings-blames-costar)). The arXiv 2506.14771 study is a rare independent comparison of iPhone and Pro3.

### Gaps
- I found no independent, controlled, room-scale benchmark of Matterport's LiDAR-iPhone or non-LiDAR phone capture against a laser reference.
- Not confirmed: how much of Cortex runs for LiDAR-phone captures, i.e. whether depth is fused or replaced.
- Phone LiDAR range and accuracy specs were left to the Apple Measure researcher and not verified here.

## 7. Matterport in construction and BIM: scan-to-BIM use and accuracy needs versus consumer needs (brief)

### Takeaway
In construction, Matterport is used mainly for visual as-built documentation, progress tracking, remote collaboration and approximate BIM (LOD 200). Survey-grade and LOD 300+ work goes to laser scanners (Leica BLK360, or third-party E57 data imported into Matterport since 2026). Construction tolerances are on the order of 15 mm or better for wall faces. A consumer placing a sofa needs about 2–5 cm at most, so Matterport's BIM credentials are irrelevant to YoungVista's demo.

### Cited Findings
- The Pro3 launch targeted as-built surveys, contractor progress tracking, quality control and "'accurate' handover documentation for use in design, BIM and FM applications". Matterport conceded it is less accurate than BLK360 (±6 mm), Trimble X7 (±2.4 mm) and Faro Focus S (±1 mm) at 10 m, and called it "good enough for most use cases" (2022) — [AEC Magazine [V]](https://aecmag.com/reality-capture-modelling/matterport-pro3-camera-places-greater-emphasis-on-aec/)
- Matterport says the BLK360 integration is "the solution of choice for AEC professionals when exacting precision is required" — [10-K [V]](https://www.sec.gov/Archives/edgar/data/1819394/000181939425000007/mttr-20241231.htm)
- October 2026: "Point Cloud Import" brings registered survey-grade E57 files into Matterport with registration locked. Matterport "provides direct workflows into Revit and Autodesk Tandem", and a two-way Autodesk Forma plug-in handles "anchored RFIs and issues" — [AEC Magazine [V]](https://aecmag.com/reality-capture-modelling/matterport-embraces-point-clouds/)
- July 2026: free integrations with Autodesk Forma and Procore; side-by-side comparison to "Track construction progress week to week" — [Matterport blog [V]](https://matterport.com/blog/refreshing-the-way-to-explore-your-digital-twins)
- CAD add-on (DWG/DXF from point cloud), February 2024 — [Matterport press release [V]](https://matterport.com/news/matterport-launches-property-intelligence-transforming-real-estate)
- Third-party scan-to-BIM practice:
  - Automated Matterport BIM output is LOD 200 — [Reality Capture Experts [S][3P]](https://realitycaptureexperts.com/matterport-accuracy/)
  - A 15 mm wall-face tolerance is used as the LOD 300 threshold, which Pro3 usually meets for well-captured interiors within about 20 m, with spot checks still required for structural work — [Enginyring [S][3P]](https://www.enginyring.com/en/blog/matterport-and-handheld-lidar-to-cad-bim-turning-consumer-scans-into-dwg-and-ifc)

### Inferences
- The colleague's suggestion that Matterport is "widely used in construction" is accurate for documentation and collaboration. Matterport is not, however, the BIM-authoring or survey-grade tool; it increasingly acts as the viewing and collaboration layer on top of laser-scanner data. BIM-level accuracy and file formats are unnecessary for YoungVista's consumer demo. They would only matter for a future trade or contractor product.

### Gaps
- I did not retrieve the USIBD Level of Accuracy (LOA) specification or a Matterport-official mapping of its products to LOA or LOD levels.
- Matterport's official BIM-file accuracy statement was not found; the Support pages did not render.
