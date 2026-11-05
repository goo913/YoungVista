# Ordinary phones can furnish real rooms

YoungVista's central bet holds for its first milestone: for a single room and a sofa that "looks about right", phone software can deliver what Matterport sells for everyday captures, and Matterport itself tells investors that "AI and ML also make costly cameras unnecessary for everyday captures" ([Matterport 10-K](https://www.sec.gov/Archives/edgar/data/1819394/000181939425000007/mttr-20241231.htm)). The catch is that phones fall into two classes. **LiDAR iPhones (the Pro and Pro Max models from the iPhone 12 Pro to the iPhone 18 Pro, which carry a small laser depth scanner) get Apple's free RoomPlan scanner**, which turns a short walk around a room into a clean model with walls, doors and windows in seconds, typically within about 1–3 cm per wall; **every other phone, including most iPhones and practically every Android phone, has no equivalent**, so YoungVista must build a guided capture whose walls will usually be 5–10 cm off, and worse in bare white rooms. The teammate's 5'1" and 5'4" height readings reflect how the measurement was taken rather than the limit of the technology: the same LiDAR height feature averaged 0.2 cm of error under controlled conditions. No existing app runs YoungVista's whole flow on every phone; IKEA Kreativ comes closest but needs LiDAR for a full 3D room, describes no live AR view and sells only IKEA products. The evidence points to an Expo app (one React/TypeScript codebase for iPhone and Android) with small native scanning and AR modules, one shared room file that drives the 3D view, the live camera view and a website, and about 40 free, true-scale product models in GLB, the open 3D file standard, with automatic copies in Apple's USDZ format for iPhone. The AI "final picture" should begin as an exact, high-quality render, because today's image generators still redraw products and shift windows, while the app quietly captures the photos an AI version will need later. Thirty-six decisions remain open, led by who the first customer is, whose products appear, which market comes first and whether the demo may lean on a LiDAR iPhone.

## Recommended direction (draft, pending your answers)

This is the stack and scope the evidence points to today. **It is a draft**: any row can change once the team answers the decisions at the end of this report.

| Area | Draft direction | Main reason |
|---|---|---|
| First milestone | One room per scan; LiDAR iPhone as the "hero" path; guided capture on Android and non-LiDAR iPhones; read-only website | Proves the whole flow without promising a device parity that today's Android tools cannot deliver |
| App framework | Expo (release SDK 58, TypeScript) with development builds; scanning and AR as small Swift and Kotlin modules behind one TypeScript interface | One UI codebase, native quality where it matters |
| iPhone scan and AR | Apple RoomPlan (starting from the MIT-licensed expo-roomplan wrapper), handing its AR session to a RealityKit view (Apple's 3D and AR engine) | Structured room in seconds; placements line up straight after the scan |
| Android scan and AR | Google ARCore with the open-source SceneView library; "tap the corners" guided capture, using depth where the phone supports it | Google offers no RoomPlan equivalent |
| Room data | One versioned room file (metres, floor outline, walls, doors, windows) plus a design file of placements at fixed 1:1 scale, drawn the same way by every renderer | Identical geometry on phone, in AR and on the web, with no fragile file conversion |
| 3D view and website | three.js via React Three Fiber, shared by the in-app 3D view and the website; "View in AR" links for single products | iPhone browsers cannot run room-scale AR |
| Products | About 40 free, true-scale models (Amazon Berkeley Objects, Poly Haven, Khronos); GLB master files with USDZ copies generated on a Mac; a credits screen; sizes locked | GLB serves Android and the web; iPhone AR needs USDZ |
| Accuracy promise | "Looks right" on every phone; approximate dimensions; "measure this gap with a tape" for tight spots; optional one-wall calibration | Walls captured without LiDAR are typically 5–10 cm off |
| Final picture | Exact "HQ snapshot" render in v1; capture posed photos, depth and lighting now; AI later as a labelled, opt-in beta | Generative models still redraw products |
| Backend | Supabase (sign-in, database, file storage); scans private by default; revocable share links | A room plus its design is under 1 MB |
| Not in v1 | Multi-room scans, photoreal room textures, web editing, fitted kitchens, AI-generated products, Matterport integration | Each adds cost without helping the sofa demo |

Three answers would move this most. A team that is mostly Swift and Kotlin should build fully native apps; a demo that may be iPhone-only can skip Expo and use SwiftUI, RoomPlan and RealityKit directly, at the price of porting to Android later; and a team with no native coding capacity can use Expo with the ViroReact AR library, accepting that ViroReact currently supports only Expo SDK 57 and has open Android camera bugs ([ViroReact on npm](https://www.npmjs.com/package/@reactvision/react-viro); [ViroReact issue #568](https://github.com/ReactVision/viro/issues/568)).

## Measure's misses on a teammate's height were capture errors, not sensor limits

### How Measure turns a camera into a tape measure

Measure is a thin layer over ARKit, Apple's augmented-reality (AR) toolkit; AR here means drawing virtual objects into the live camera view. ARKit tracks where the phone is using visual-inertial odometry (VIO): it follows distinctive spots in the camera image from frame to frame and fuses them with the phone's motion sensors, which yields a position in real metres ([Apple ARKit docs](https://developer.apple.com/documentation/arkit/understanding-world-tracking)). When you tap, Measure fires an invisible ray from the on-screen dot, finds the 3D point it hits and reports the straight-line distance between two such points. **On phones without LiDAR, that ray can only land on surfaces ARKit has already modelled**, meaning detected flat planes or tracked feature points, so the top of a head or the thin edge of a laptop gets projected onto whatever plane lies behind it. Pro iPhones add a LiDAR scanner, a laser that times how long light takes to bounce back. It projects 576 laser dots ([Luetzenburg et al. 2021](https://pmc.ncbi.nlm.nih.gov/articles/PMC8593014/)), which ARKit fuses with the colour image by machine learning into a 256×192 depth map 60 times a second ([WWDC20](https://developer.apple.com/videos/play/wwdc2020/10611/); [ARKitScenes](https://arxiv.org/html/2111.08897)). That depth map powers Measure's person-height, edge-guide and Ruler features, which Apple documents only for "supported models" that link to its LiDAR list ([Apple Support: Measure](https://support.apple.com/guide/iphone/measure-dimensions-iphd8ac2cfea/ios)). **Apple publishes no accuracy figure**; it says "Measurements are approximate" and recommends objects 0.5–3 m (2–10 ft) away.

Apple's iOS 27 guide lists LiDAR on the Pro and Pro Max iPhones from the 12 Pro through the **18 Pro and 18 Pro Max**, and on nothing else: not the iPhone 16e, 17, 17e, Air or the new iPhone Duo, which the guide's topics suggest is Apple's foldable ([Apple Support: Models with a LiDAR Scanner](https://support.apple.com/guide/iphone/aside/iphc07537a89/27/ios/27)). The platform research could not confirm LiDAR on the iPhone 18 Pro, but the accuracy research checked Apple's own list on 5 November 2026, so this report follows Apple's list. Nobody publishes how many active iPhones have LiDAR. Pro models made up 45% of US iPhone sales in CIRP data reported in November 2024 ([MacRumors, citing CIRP](https://www.macrumors.com/2024/11/21/best-selling-iphone-model-sizes-revealed/)), which suggests **roughly 35–45% of active US iPhones**, an estimate rather than a measured figure. Android is simpler and weaker. Samsung dropped rear depth sensors after the Galaxy S20 generation, according to press reports ([SamMobile](https://www.sammobile.com/news/samsung-could-be-ditching-camera-sensor-galaxy-note-20/)), so the safe assumption is that no Android phone has hardware depth. Instead, Google's ARCore Depth API estimates depth from camera motion on **over 88% of active ARCore devices**, while warning that white walls give "imprecise depth" ([Google ARCore Depth](https://developers.google.com/ar/develop/depth); [ARCore supported devices](https://developers.google.com/ar/devices)).

### Why the height read short and the MacBook failed

The teammate is 5'5" (165.1 cm). Measure read **5'1" (−10.2 cm, −6.2%) and then 5'4" (−2.5 cm, −1.5%)**. The two readings differ by 7.6 cm, which points to inconsistent capture rather than a fixed error in the sensor. The same LiDAR feature averaged **0.2 cm** of error against a hospital height rod across 50 children, but with good light, a plain wall, a fixed 3 m distance and three readings averaged ([ESPE 2024 abstract](https://abstracts.eurospe.org/hrp/0098/hrp0098p1-310)). Hair and hats push a reading up, not down, so the short readings most likely came from feet or floor not fully in frame, a floor estimate that had not settled (Apple warns that a newly detected plane "may be inaccurate" at first ([Apple ARKit docs](https://developer.apple.com/documentation/arkit/understanding-world-tracking))), posture, a reading taken before the head line stabilised, or standing far back, where real laser samples sit 10–20 cm apart and the top of the head is largely interpolated. **If the test phone was not a Pro model, the automatic height feature does not exist** ([Apple Support: person height](https://support.apple.com/guide/iphone/measure-a-persons-height-iph341d4a993/ios)), and a manual tap at the top of the head lands on the wall behind, which alone explains several centimetres. The 5'4" reading sits within the normal consumer range; the 5'1" reading is a capture failure. Which iPhone ran the test decides which explanation applies (Q9).

The MacBook result was predictable. LiDAR point density falls about 48-fold between 25 cm and 2.5 m, so real samples go from about 1.2 cm apart to about 8 cm apart ([Luetzenburg et al. 2021](https://pmc.ncbi.nlm.nih.gov/articles/PMC8593014/)). A laptop measured from across a room is covered by only a handful of real samples; its thin edges come from interpolated depth, and its glossy screen and aluminium earn low confidence ([Apple: depth confidence map](https://developer.apple.com/documentation/arkit/ardepthdata/confidencemap)). Aiming error grows with distance too: a 1° wobble moves an endpoint about 1.7 cm at 1 m but 5.2 cm at 3 m, which on a 30 cm object is a 17% error at each end. **So getting closer does help, down to about half a metre.** Apple's 0.5–3 m guidance and its Ruler view, which appears only as you move closer, both point that way. The limit is that once both ends no longer fit on screen, the user has to walk, and walking adds tracking drift of roughly 1% of the distance covered ([Sensors 2024](https://pmc.ncbi.nlm.nih.gov/articles/PMC10893111/)). Point-to-point beat whole-object measurement in the meeting for a related reason: the user picks two well-defined points on surfaces ARKit already knows, while automatic whole-object sizing depends on detecting edges, which degrades with distance and on shiny, three-dimensional objects.

### What accuracy a normal phone can deliver

The table combines the published evidence into a realistic error envelope for a typical living room and a 2.2 m (about 7 ft) sofa. The "typical" and "bad case" columns are the accuracy researcher's synthesis of the studies cited after the table.

| Situation | Typical error | Bad case | Sofa "looks right"? | Supports "will it fit"? |
|---|---|---|---|---|
| Product placed in live AR on a LiDAR iPhone | About 1–2% of size | A few cm offset; accidental resizing | Yes | Gross fit (±2–4 cm on a 2.2 m sofa) |
| Room scanned with RoomPlan (LiDAR) | About 1–3 cm per wall | 5–40 cm (mirrors, glass, long rooms, drift) | Yes | Yes, except gaps under ~5 cm |
| Room captured on a phone without LiDAR | About 5–10 cm per wall | 20 cm or more; failure on bare white walls | Yes, for a demo | Only with a tape-measured reference |
| AI depth from a single photo | 10–20% of size | Arbitrary scale | Plausible only | No |
| Matterport 360°-camera or phone capture, for comparison | About 4–5% average | Not published | Yes | Marginal |

The LiDAR rows rest on independent tests: 2.7–3.5 cm mesh accuracy for an iPhone 14 Pro against a survey-grade laser scanner ([Sensors 2024](https://pmc.ncbi.nlm.nih.gov/articles/PMC10893111/)), 1–2 cm on hall lengths from careful static iPad scans ([HBRC Journal 2024](https://doi.org/10.1080/16874048.2024.2408839)), but 8–10 cm in a long corridor ([Hamdan et al. 2026](https://link.springer.com/article/10.1007/s41651-026-00288-x)) and one developer's RoomPlan wall that came out 37 cm long on 6.45 m ([it-jim](https://www.it-jim.com/blog/roomplan-framework-by-apple/)). Apple's own RoomPlan research reports 90–95% detection of walls, windows and doors but no centimetre figure ([Apple Machine Learning Research](https://machinelearning.apple.com/research/roomplan)). Without LiDAR, the best documented room test found wall errors of 3–20 cm, averaging 8.5 cm, on 2017-era ARKit ([Medium, 2017](https://medium.com/inborn-experience/getting-a-room-plan-with-arkit-the-case-where-size-matters-1e104ee42421)), and a 2026 preprint found Android depth arrived on only 0.4–11% of frames in a bare room, with 21% of runs drifting more than half a metre ([Research Square preprint](https://www.researchsquare.com/article/rs-10991704)). AI depth from a single photo trails LiDAR-fused depth badly: the best tested model added 0.22 m of RMS error to ARKit's 0.04 m ([arXiv 2310.14437](https://arxiv.org/html/2310.14437)). Matterport's figure comes from its support pages, seen only in search excerpts ([Matterport Support](https://support.matterport.com/s/article/How-accurate-are-dimensions-in-Matterport-Spaces?language=en_US)).

**Looking right is easy; fitting is hard.** Lab work suggests people notice an AR object's size change only at about 3–5% (a figure seen only in a search summary of the paper) ([HAL](https://dumas.ccsd.cnrs.fr/LISN-ARAI/hal-04358138v1)), and in Baymard's usability testing one shopper shrank a table to 79% of its true size without noticing ([Baymard Institute](https://baymard.com/blog/deprioritize-view-in-room-augmented-reality)). A 2–3% error, or 4–7 cm on a 2.2 m sofa, will not be seen. Fit decisions are different because they hinge on clearances: a sofa into an alcove, beside a door swing or through a doorway. When the gap is 5–10 cm, a 5–10 cm room error flips the answer, so only LiDAR scans, or other phones with a tape-measured reference, support "will it fit" for tight gaps. The same Baymard study found that **87% of furniture shoppers largely avoided AR features**, a warning that capture and placement must feel effortless.

The biggest accuracy wins are cheap. Keep scans short and to one room; coach the user live on speed, distance, light and texture, which RoomPlan does automatically; walk the room in a loop; snap near-right angles to 90°, which tidies typical rooms but distorts genuinely odd ones; and let the user type in one tape-measured wall to rescale the scan, so a 4.10 m scan of a 4.00 m wall gets a uniform ×0.9756 correction ([WWDC22](https://developer.apple.com/videos/play/wwdc2022/10127/); [it-jim](https://www.it-jim.com/blog/roomplan-framework-by-apple/)). The core Measure logic is small and freely available. Apple's own sample code carries an MIT-style licence that allows commercial use, as do tbxark/Ruler (MIT) and Google's ARCore samples (Apache-2.0), while the most-starred iOS ruler, duzexu/ARuler, is GPL-licensed, a "copyleft" licence that would force a closed app to publish its source ([Apple RoomPlan sample](https://developer.apple.com/documentation/roomplan/create-a-3d-model-of-an-interior-room-by-guiding-the-user-through-an-ar-experience); [tbxark/Ruler](https://github.com/tbxark/Ruler); [duzexu/ARuler](https://github.com/duzexu/ARuler)).

## Matterport's edge is capture discipline and data, not a magic camera

### How Matterport captures, renders and measures

A Matterport capture is a series of stationary 360° "sweeps" from a tripod. The flagship **Pro3, $5,995 at its 2022 launch**, uses LiDAR rated at ±20 mm at 10 m (about 0.2%), takes under 20 seconds per sweep and builds each 134-megapixel panorama from five HDR (high dynamic range) exposures ([Matterport Pro3](https://matterport.com/store/product/pro3-plus-package); [AEC Magazine](https://aecmag.com/reality-capture-modelling/matterport-pro3-camera-places-greater-emphasis-on-aec/)). The older Pro2 uses structured infrared light at ±1% ([Matterport cameras](https://matterport.com/cameras)). Consumer 360° cameras and phones without LiDAR capture only images, and Matterport's Cortex AI *infers* depth from them; Cortex was trained on Pro2 colour-plus-depth scans of about 1.5 million homes ([Geo Week News](https://www.geoweeknews.com/articles/matterport-cortex-gets-quick-3d-from-360-photos-using-ai-and-computer-vision/)). The viewer appears to be image-based: in "Inside view" you stand only at capture points and look at the high-resolution panoramas, while a coarser 3D mesh (a surface of connected triangles) drives the dollhouse, floor plan, transitions and measurement picking. Matterport has published no technical write-up of its renderer, so this is an inference from its data model and patents, but it implies that **most of the visual polish comes from disciplined photography**, meaning a level tripod, a fixed rotation point and HDR exposures, rather than from the mesh.

Measurements are taken on that reconstructed geometry, so accuracy is inherited from the device. Matterport's support pages put active-depth cameras at about 1% and 360°-camera or phone captures at **about 4–5% average error**; in one Matterport test a 5.761 m living room usually came within about 6 cm ([Matterport Support](https://support.matterport.com/s/article/How-accurate-are-dimensions-in-Matterport-Spaces?language=en_US)). Automated room measurements are now free for owners to switch on ([Matterport blog, July 2026](https://matterport.com/blog/refreshing-the-way-to-explore-your-digital-twins)), but Matterport guarantees no accuracy for meshes and point clouds built from inferred depth ([Matterport Support: MatterPak](https://support.matterport.com/s/article/Download-the-MatterPak-Bundle?language=en_US)).

### What phones can match, and what still needs hardware

The team's theory is **largely right for one room**. Matterport already runs phone capture on iPhones with and without LiDAR and on Android, calls its strategy "subscription first, capture device agnostic", and makes almost nothing on cameras: product gross margin was about 3.6% in 2023 and 10.1% in 2024, against about 67% on subscriptions, calculated from its annual report ([Matterport 10-K](https://www.sec.gov/Archives/edgar/data/1819394/000181939425000007/mttr-20241231.htm)). The hardware's business value lies elsewhere: it locks buyers into 24-month professional plans ($245 a month with the Pro3), serves construction and large properties, and generates training data ([Matterport Pro3](https://matterport.com/store/product/pro3-plus-package)). The table shows where dedicated hardware still clearly wins.

| Matterport-like capability | LiDAR iPhone | Phone without LiDAR | Needs dedicated hardware? |
|---|---|---|---|
| Room dimensions good enough for a sofa | Yes | Mostly (Matterport's own image-only tier averages ~4–5%) | No |
| 360° panoramas for a walk-through view | Yes, with careful capture or a mount | Same | No, but HDR and resolution lag |
| Mesh for a dollhouse view and occlusion | Yes, for one room | Coarse, AI-inferred | Only for large or multi-floor spaces |
| Web viewer with placed GLB products | Yes | Yes | No |
| Live AR placement (Matterport offers none) | Yes | Yes | No |
| Whole-house accuracy without drift | Limited | Weak | Yes |
| Range beyond ~5 m, tall spaces, full sun outdoors | No | No | Yes (Pro3: 20 m in models, 100 m in exports) |
| Survey- or BIM-grade point clouds | No | No | Yes (Pro3, Leica BLK360) |

The theory underestimates two things. The first is capture by novices: Matterport built a motorised phone mount, Axis, to make phone captures consistent, and handheld 360° capture "results in a lower quality visualization and the presence of the operator in the image" ([Matterport Axis](https://matterport.com/store/product/cam-axis); [Geo Week News](https://www.geoweeknews.com/articles/matterport-cortex-gets-quick-3d-from-360-photos-using-ai-and-computer-vision/)). The second is data: Cortex's advantage on ordinary phones rests on a proprietary scan library a startup cannot copy, and the large Matterport-derived research datasets are licensed for academic, non-commercial use only ([Matterport academic EULA](https://matterport.com/matterport-end-user-license-agreement-academic-use-model-data)). So the camera is not the special part, but the capture discipline and the training data are, and both are software and process problems YoungVista has to solve itself.

### Building on Matterport, and what the BIM tip means

Building YoungVista on Matterport is technically possible, since its Bundle SDK (software development kit) can load GLB furniture into a model in the browser ([Matterport Showcase SDK](https://matterport.github.io/showcase-sdk/sdkbundle_home.html)), but it is a poor fit. Customers would need Matterport's own Capture app; each room would count as an "active space", at roughly $2.5–3 per room per month on third-party plan prices ([SofaBrain](https://sofabrain.com/learn/matterport-pricing)); the viewer is an embedded web player with no live AR; and platform risk is real. **CoStar bought Matterport for about $1.6 billion in February 2025** ([RISMedia](https://www.rismedia.com/2025/03/03/costar-completes-acquisition-matterport-which-delists-from-nasdaq/)), and in October 2025 Zillow pulled Matterport tours from its listings, saying CoStar had declined to renew its API agreement, which CoStar disputes ([Real Estate News](https://www.realestatenews.com/2025/10/20/zillow-pulls-matterport-tours-from-listings-blames-costar)). The tip is right that Matterport is widely used in construction, but mainly for visual documentation, progress tracking and approximate BIM (building information modelling) at "LOD 200", meaning placeholder-level elements; survey-grade work goes to laser scanners whose data Matterport now imports ([Reality Capture Experts](https://realitycaptureexperts.com/matterport-accuracy/); [AEC Magazine, October 2026](https://aecmag.com/reality-capture-modelling/matterport-embraces-point-clouds/)). Construction tolerances of about 15 mm on wall faces ([Enginyring](https://www.enginyring.com/en/blog/matterport-and-handheld-lidar-to-cad-bim-turning-consumer-scans-into-dwg-and-ifc)) are irrelevant to a customer who needs a sofa within a few centimetres.

## IKEA Kreativ comes closest, and nobody covers every phone

Live-camera AR that drops a true-scale product onto the floor has been a commodity since 2017–2018: IKEA Place, Amazon, Houzz and Lowe's all shipped it on ordinary iPhones and Android phones without any room scan ([IKEA newsroom, 2017](https://ikea.com/global/en/newsroom/innovation/ikea-launches-ikea-place-a-new-app-that-allows-people-to-virtually-place-furniture-in-their-home-170912/); [Engadget](https://www.engadget.com/amazon-ar-shopping-furniture-home-decor-171005257.html)). Capturing the customer's own room as a reusable model is much rarer, and **only one big retailer has shipped it: IKEA, which acquired the computer-vision startup Geomagical Labs to do so** ([TechCrunch](https://techcrunch.com/?p=1969198)). The table summarises the apps that matter most to YoungVista.

| App | What it does | Phones | Lesson for YoungVista |
|---|---|---|---|
| IKEA Kreativ | LiDAR "Full Room Scan" builds an empty 3D twin; other phones get a photo-based wide-angle scene; erase furniture; design and share on the web | Full 3D only on LiDAR iOS | Closest rival; IKEA-only catalog, no live AR described, room size not editable |
| IKEA Place, Amazon, Houzz, Lowe's AR | Drop true-scale products on a detected floor in the live camera | iOS and Android since 2017–18 | Live AR needs no scan; it is a commodity |
| Wayfair Muse | AI-generated room images; shop "complementary" items | App and web | Retail drifted from geometry to AI inspiration |
| Polycam | LiDAR rooms; video capture without LiDAR on iPhone 13+ since January 2026 | iOS, limited Android, web | Non-LiDAR floor plans and Android still "coming in 2026"; users resent paywalls |
| magicplan | LiDAR auto-scan; corner-tapping mode on older iPhones | No Android scanning | Even the market leader keeps a manual fallback |
| CubiCasa, Hover | Walk-through on any phone, processed in the cloud | iOS and Android | Hours of turnaround; Hover asks for one hand-measured length |
| Scaniverse, KIRI | Photoreal "splats" and meshes | iOS and Android | Pretty but unstructured; commercial rights only on paid plans |
| Houzz Pro, Planner 5D, RoomScan | RoomPlan-based scanning | LiDAR iOS only | RoomPlan is the free baseline everyone builds on |

Sources for the table: [IKEA US help](https://www.ikea.com/us/en/customer-service/knowledge/articles/e86d70g6-3673-4306-b373-20f7cg7fd5ed.html), [MacMyths](https://macmyths.com/ikea-place-review-what-ikea-kreativ-does-in-2026/), [Retail Brew](https://www.retailbrew.com/stories/2025/02/14/wayfair-launches-ai-powered-inspiration-tool-to-drive-online-shopping), [Polycam press release](https://www.rooferscoffeeshop.com/post/polycam-brings-pro-grade-3d-scanning-to-800-million-iphone-users-for-free-no-lidar-required), [magicplan help](https://help.magicplan.app/scan-a-room-with-the-camera-of-your-mobile-device-android), [Hover help](https://help.hover.to/en/articles/9264961-interior-scans-non-lidar), [CubiCasa](https://apps.apple.com/us/app/cubicasa/id1439879192), [Niantic Spatial pricing](https://www.nianticspatial.com/pricing), [Houzz Pro help](https://pro.houzz.com/pro-help/r/how-to-scan-a-room-using-lidar-technology), [Planner 5D](https://support.planner5d.com/en/articles/5897614-scan-your-room-ios).

**No product found does YoungVista's whole flow**: scan on any phone, place catalog products in both an orbitable 3D model and live AR, then view the result on the web. Kreativ's limits are YoungVista's openings. It builds full 3D rooms only on LiDAR devices, sells only IKEA products, cannot edit room dimensions after creation, calls itself "not a measurement tool" and describes no live AR view ([MacMyths](https://macmyths.com/ikea-place-review-what-ikea-kreativ-does-in-2026/); [IKEA Ireland help](https://www.ikea.com/ie/en/customer-service/knowledge/articles/28c782c5-0036-4ff1-b1fd-20846237ee09.html)). IKEA describes its non-LiDAR mode as a "wide-angle, interactive replica" built from photos taken in one spot ([IKEA Australia newsroom](https://www.ikea.com/au/en/newsroom/range-news/ai-powered-design-experience-ikea-kreativ-launches-pubcf6362b0/)), which is most likely a single-viewpoint scene rather than a room you can orbit; IKEA does not document this, so treat it as an inference. IKEA's claimed accuracy of about 97% "when best practices are followed" is a vendor figure with no published method, as is CubiCasa's 95–97% ([IKEA Ireland help](https://www.ikea.com/ie/en/customer-service/knowledge/articles/28c782c5-0036-4ff1-b1fd-20846237ee09.html); [ARMLS on CubiCasa](https://armls.com/how-accurate-are-cubicasa-floorplan-scans)).

No vendor sells an embeddable, consumer-grade "scan a room on any phone" toolkit. RoomPlan is free but LiDAR-only and has had no public updates since iOS 17 in 2023 ([Apple Developer Forums](https://developer.apple.com/forums/thread/787628)); Niantic's meshing toolkit may work without LiDAR, but its documentation and pricing are unclear ([Niantic NSDK meshing](https://nianticspatial.com/docs/nsdk/features/meshing/)); and the business services from CubiCasa, Hover and magicplan return floor plans and measurements for estimators and insurers, not furnishable 3D rooms. Dependency risk is recent and real. Google killed its Tango depth-camera platform in 2018, taking retailer apps with it; Niantic shut 8th Wall's hosted web-AR platform; Luma sidelined 3D capture; and Canvas pivoted to professionals as Twindo ([Tom's Hardware](https://www.tomshardware.com/news/google-kills-tango-focuses-arcore,36134.html); [Road to VR](https://roadtovr.com/niantic-webar-platform-8th-wall-open-source/); [Luma on the App Store](https://apps.apple.com/in/app/luma-ai/id1615849914); [Twindo](https://www.twindo.com/blog/canvas-is-now-twindo/)). That argues for keeping room and design data in YoungVista's own neutral format, with scanners as swappable inputs.

The UX lessons are consistent across the market. Pick the capture mode by device instead of asking users about LiDAR, as IKEA does; coach live on distance, speed, light and texture; keep scans under about five minutes and save partial progress, since RoomScan users lost work in crashes ([RoomScan on the App Store](https://apps.apple.com/us/app/roomscan-pro-lidar-floor-plans/id1504050801)); show a quick "is this right?" review with simple fixes; lock products to true size; offer "start empty" or "hide my furniture"; run heavy processing in the background and notify; and keep measuring and viewing free, because Polycam's reviews complain about paywalled measurements ([Polycam on the App Store](https://apps.apple.com/app/id1532482376)). Keep both the 3D model and live AR, too: one reviewer missed IKEA Place's walk-around AR once Kreativ replaced it with a model-only approach ([Mako](https://www.mako.co.il/nexter-news/Article-6838ffcdddb8181027.htm)). YoungVista can reuse RoomPlan, ARKit and ARCore, open file formats and these patterns. It must build the non-LiDAR and Android capture, the shared room data model, the web viewer and the placement editor itself.

## Open-source code abounds, but most trained room models ban commercial use

### RoomPlan already handles curves, slopes and open doors on LiDAR iPhones

The brief worries about circular rooms, odd angles and open doors. On LiDAR iPhones Apple has already solved much of this: RoomPlan models **curved walls as arcs, slanted or uneven walls as polygons, floors of any shape, doors flagged open or closed, windows, doorless openings and 16 kinds of furniture and fixtures** as labelled boxes ([RoomPlan surface categories](https://developer.apple.com/documentation/roomplan/capturedroom/surface/category-swift.enum); [RoomPlan curves](https://developer.apple.com/documentation/roomplan/capturedroom/surface/curve-swift.struct); [RoomPlan polygon walls](https://developer.apple.com/documentation/roomplan/capturedroom/surface/polygoncorners)). Its limits are equally specific. It has no ceiling surface at all, works best in a single room up to about 9×9 m (30×30 ft) with at least 50 lux of light, and struggles with full-height mirrors, glass, very dark surfaces and high ceilings ([WWDC22](https://developer.apple.com/videos/play/wwdc2022/10127/)). Every one of its 276 documented programming symbols dates from iOS 16 or iOS 17, so nothing public has changed since 2023: the framework is stable, but it is not improving ([RoomPlan documentation](https://developer.apple.com/documentation/roomplan)).

### Android and cloud building blocks, sorted by licence

The open-source picture splits on licences more than on technology. On Android, the only open-source app that builds a room mesh today is RTAB-Map (BSD licence), and even its Play Store listing returned "not found" in November 2026 ([RTAB-Map](https://github.com/introlab/rtabmap)); ARCore itself gives depth images but no mesh ([Unity ARCore plug-in manual](https://docs.unity3d.com/Packages/com.unity.xr.arcore@6.2/manual/index.html)). On a server, a commercially safe pipeline exists for turning photos or video into 3D, and several new AI models recover real-world scale. But **nearly every pretrained room-layout model was trained on data licensed for non-commercial use**, such as Zillow's ZInD and Apple's ARKitScenes ([ZInD](https://github.com/zillow/zind); [ARKitScenes licence](https://github.com/apple-aiml-research/ARKitScenes/blob/HEAD/LICENSE)). The practical, licence-clean fallback is classic geometry: fit planes to the scan, fit straight lines and arcs to the walls, close the outline into a polygon and let the user nudge corners. One shortcut helps everywhere: the phone's own motion tracking already measures in metres, so recording ARKit or ARCore camera positions gives any cloud reconstruction its real-world scale for free.

| Job | Commercially usable | Avoid without a negotiated licence |
|---|---|---|
| Mapping and meshing on the phone | RTAB-Map (BSD); Apple's LiDAR mesh; ARCore depth | InfiniTAM, MonoGS, ElasticFusion (non-commercial); ORB-SLAM3, OpenVINS (GPL copyleft) |
| Cloud reconstruction from photos or video | COLMAP (BSD), gsplat (Apache-2.0), Open3D (MIT), Meshroom (MPL-2.0); OpenMVS (AGPL, with obligations) | Original Inria Gaussian splatting and its mesh extractors (2DGS, GOF, SuGaR), PGSR, NVIDIA instant-ngp |
| AI models that recover real-world scale | MapAnything Apache weights, Depth Anything 3 Metric-Large (Apache-2.0), MoGe-2 (MIT), VGGT-1B-Commercial (approval required) | DUSt3R/MASt3R, UniDepth, Pi3 weights, Depth Anything V2 Base/Large; Apple Depth Pro (conflicting licence texts) |
| Room layout and floor plans | Own geometric fitting; MIT code such as HorizonNet or RoomFormer, retrained on licensed data | SpatialLM, SceneScript, HEAT (non-commercial); any weights trained on non-commercial data |
| Web viewing | three.js, React Three Fiber, Spark, PlayCanvas, Babylon.js, model-viewer | None flagged |
| Measure-style ruler code | Apple sample code (MIT-style), tbxark/Ruler (MIT), ARCore samples (Apache-2.0) | duzexu/ARuler (GPL-2.0); repositories with no licence |

Sources for the table: [COLMAP](https://github.com/colmap/colmap), [gsplat](https://github.com/nerfstudio-project/gsplat), [Inria Gaussian splatting licence](https://github.com/graphdeco-inria/gaussian-splatting/blob/HEAD/LICENSE.md), [OpenMVS](https://github.com/cdcseacave/openMVS), [MapAnything](https://github.com/facebookresearch/map-anything), [Depth Anything 3](https://github.com/ByteDance-Seed/Depth-Anything-3), [MoGe](https://github.com/microsoft/MoGe), [VGGT](https://github.com/facebookresearch/vggt), [MASt3R](https://github.com/naver/mast3r), [SpatialLM](https://github.com/manycore-research/SpatialLM), [SceneScript](https://github.com/facebookresearch/scenescript), [RoomFormer](https://github.com/ywyue/RoomFormer), [three.js](https://github.com/mrdoob/three.js), [Spark](https://github.com/sparkjsdev/spark). Two licence conflicts are worth flagging: Apple's Depth Pro weights are research-only on Hugging Face but appear more permissive on GitHub ([Depth Pro on Hugging Face](https://huggingface.co/apple/DepthPro/blob/main/LICENSE)), and the Pi3 weights carry a permissive tag on Hugging Face but a non-commercial notice in their README ([Pi3](https://github.com/yyfz/Pi3)). Treat both as unusable until a lawyer says otherwise. OpenMVS's AGPL licence is generally workable as an unmodified server step, but a modified version offered over a network must have its source released.

### Doors, windows and mirrors need product rules more than new code

Apple's answer to open doors is to ask users to close them, record each door's open or closed state, and build a home from separate per-room scans that the user approves ([WWDC22](https://developer.apple.com/videos/play/wwdc2022/10127/); [RoomPlan StructureBuilder](https://developer.apple.com/documentation/roomplan/structurebuilder/capturedstructure(from:))). The research found no open-source tool that closes door openings automatically, so YoungVista needs a rule rather than a library. The simplest is that **a doorway closes the room**: an invisible wall across the door line, with everything beyond cropped. It is predictable and good for furniture placement, but it can cut an open-plan living-dining space in two. The draft recommendation adds a prompt for wide openings ("include this area?"), stores each door's hinge side and swing so the app can warn when a sofa blocks it, and puts a top-down review screen with draggable corners after every scan, which also fixes curved or odd walls without hard-coding room shapes. RoomPlan's curves would come through on iPhone; on Android, where no open layout tool outputs arcs, a round room would become many short straight segments that the user can adjust.

Windows, mirrors and glass trouble every depth source. Glass dominated façade error in one 2026 study, where excluding windows cut the error spread by up to 50% ([Hamdan et al. 2026](https://link.springer.com/article/10.1007/s41651-026-00288-x)), and mirrors create gaps or phantom objects in RoomPlan scans ([it-jim](https://www.it-jim.com/blog/roomplan-framework-by-apple/)). Research methods that handle mirrors exist but are stale, such as Mirror3D, last updated in 2022 ([Mirror3D](https://github.com/3dlg-hcvc/mirror3d)). The practical fix is to treat walls as the source of truth, clip any geometry beyond them, model windows as flat features on the wall rather than trusting raw depth, coach users to open curtains and avoid pointing at bright windows, and offer a "mark this as a mirror" tap in the review step. For the final picture, the same wall and window data gives the renderer exact openings to draw.

## Forty free, true-scale models are ready, and GLB needs a USDZ twin

Three free sources are both commercially usable and realistic. **Amazon Berkeley Objects (ABO)** offers about 7,950 photoreal GLB models of real Amazon furniture and home goods, authored in metres, under CC BY 4.0, a Creative Commons licence that allows commercial use as long as you credit "Amazon.com" ([ABO](https://amazon-berkeley-objects.s3.amazonaws.com/index.html)); the product researcher measured a median model-to-listing size ratio of 1.001 across the set ([ABO 3D metadata](https://amazon-berkeley-objects.s3.amazonaws.com/3dmodels/metadata/3dmodels.csv.gz)). **Poly Haven** offers 85 furniture models under CC0, which requires no credit at all ([Poly Haven licence](https://polyhaven.com/license)), and 39 of 40 checked matched their listed sizes; the exception, a steel shelf, exports ten times too large ([Poly Haven API](https://api.polyhaven.com/assets?t=models)). **Khronos's glTF sample assets** include about a dozen showcase pieces donated by Wayfair, some with colour options built into the file ([Khronos sample assets](https://github.com/KhronosGroup/glTF-Sample-Assets/blob/main/Models/model-index.json)). One licensing conflict needed resolving: some older sources describe ABO as non-commercial (CC BY-NC), but the coordinator re-checked the official ABO page on 5 November 2026 and it states CC BY 4.0, so commercial use with attribution is allowed. The team should still save a dated copy of that page, and the licence file shipped in the download archive, in case the terms change.

Most other sources fail for one reason or another. TurboSquid's licence, which covers its free models too, allows apps only if models are locked inside proprietary formats, so a GLB sent to a phone breaks it ([TurboSquid licence](https://blog.turbosquid.com/turbosquid-3d-model-license/)); Alibaba's 3D-FUTURE furniture set is research-only ([3D-FUTURE licence](https://terms.aliyun.com/legal-agreement/terms/suit_bu1_ali_cloud/suit_bu1_ali_cloud202004171628_60052.html)); Sketchfab and Objaverse licences vary model by model, including non-commercial ones ([Sketchfab download guidelines](https://sketchfab.com/developers/download-api/guidelines); [Objaverse](https://huggingface.co/datasets/allenai/objaverse/blob/main/README.md)); low-poly packs such as Kenney's look like a game; and the research found no open 3D-model programme from IKEA or Wayfair. Creative Commons licences cover the 3D files but not trademarks, so demo products should carry neutral names rather than Amazon or Wayfair brands ([CC BY 4.0 legal code](https://creativecommons.org/licenses/by/4.0/legalcode)).

From these sources the product research assembled a **40-model starter set covering all 19 requested categories**: sofas, sectionals, armchairs, beds, nightstands, dressers, wardrobes, a cabinet stand-in, sideboards, bookcases, TV stands, dining, coffee and desk tables, dining and office chairs, a rug, a floor lamp and a plant, with every ABO pick within ±10% of its listed dimensions. Two gaps remain: **no realistic, freely licensed fitted kitchen base cabinet exists** in these sources, and modern houseplants are heavy. ABO's data also dates from 2021, carries no prices and may include discontinued products. Cleanup is light: shrink ABO's 4K textures (one nightstand file was 30.6 MB), simplify the plants, pack Poly Haven files into single GLBs and rotate one coffee table.

**GLB is the right master format, but iPhones need a USDZ copy.** GLB, the binary form of the glTF standard, is read natively by Android's Scene Viewer, the SceneView library, three.js and Google's model-viewer ([Google Scene Viewer](https://developers.google.com/ar/develop/scene-viewer)). Apple's RealityKit still loads only USD-family files and its own .reality format, and AR Quick Look, the iPhone's built-in AR viewer, takes only USDZ ([RealityKit docs](https://developer.apple.com/documentation/realitykit/entity/init(contentsof:withname:)); [AR Quick Look](https://developer.apple.com/documentation/arkit/previewing-a-model-with-ar-quick-look)); the research found no Apple statement that iOS 26 or 27 reads glTF. Shopify settles the same problem by keeping both a GLB and a USDZ for every model ([Shopify](https://help.shopify.com/en/manual/products/product-media/product-media-types)). The conversion is now built into macOS: the product researcher turned an ABO sofa into a USDZ that passed Apple's ARKit validator using only command-line tools that ship with macOS 27 ([Apple USD guide](https://developer.apple.com/documentation/usd/creating-usd-files-for-apple-devices)). FBX and OBJ offer nothing GLB lacks. The pipeline should normalise each model to metres, Y-up, origin at the floor and front facing +Z; validate it, including size against the catalog, which catches the 10× shelf; compress the delivery GLBs with tools such as glTF-Transform ([glTF-Transform](https://gltf-transform.dev/cli)); and convert USDZ from the uncompressed master, since USDZ cannot carry the compressed formats. Budgets anchored on Google's guidance are about 30–50K triangles per item (never over 100K), 2K textures and under 5–10 MB per file ([Google Scene Viewer](https://developers.google.com/ar/develop/scene-viewer)). Each product record should also carry real dimensions, a placement type (floor, wall, ceiling or tabletop), a scale lock, colour variants mapped to glTF's standard variants extension ([KHR_materials_variants](https://github.com/KhronosGroup/glTF/blob/main/extensions/2.0/Khronos/KHR_materials_variants/README.md)), and its licence and attribution text.

AI "image-to-3D" generation can fill the catalog later, but not at the right size: none of the tools reviewed outputs real-world scale, so every result must be rescaled to catalog dimensions. Paid tools such as Meshy grant ownership of outputs on paid plans ([Meshy pricing](https://www.meshy.ai/pricing)); Microsoft's TRELLIS.2 is MIT-licensed but depends on NVIDIA's non-commercial nvdiffrast ([TRELLIS.2](https://github.com/microsoft/TRELLIS.2); [nvdiffrast licence](https://github.com/NVlabs/nvdiffrast/blob/main/LICENSE.txt)); and **Tencent's Hunyuan3D licence excludes the EU, the UK and South Korea outright** ([Hunyuan3D 2.1 licence](https://huggingface.co/tencent/Hunyuan3D-2.1/blob/main/LICENSE)). These tools suit décor and long-tail items; hero products should come from manufacturer files.

## Expo can carry the app, but scanning and AR stay native

### Expo works when the hard screens are native modules

The team's worry is valid but not disqualifying. Expo, a widely used toolkit for building iPhone and Android apps with React Native, reached SDK 58 on 15 October 2026 and lets developers write ordinary Swift or Kotlin classes as "modules" that JavaScript code can call ([Expo SDK 58](https://expo.dev/changelog/sdk-58)). That is exactly what YoungVista needs: the scanning and AR screens become small native modules (RoomPlan and RealityKit on iPhone, ARCore and SceneView on Android) behind one TypeScript interface, while sign-in, the catalog, project lists, sharing and the 3D viewer stay shared. Since SDK 56 these modules can live inside the app's own repository ([Expo SDK 56](https://expo.dev/changelog/sdk-56)). The cost is that the team must use "development builds", compiled with Xcode, Android Studio or Expo's EAS cloud service, from day one, because the Expo Go preview app cannot load custom native code ([Expo SDK 58](https://expo.dev/changelog/sdk-58)). **No React Native library delivers scanning plus AR on both platforms ready-made.** The expo-roomplan wrapper is MIT-licensed and active but iOS-only, with a single maintainer and 39 GitHub stars ([expo-roomplan](https://github.com/fordat/expo-roomplan)); ViroReact, the only maintained cross-platform React Native AR library, currently pins Expo SDK 57 and has open camera and tracking bugs on Samsung phones running Android 16 that plain ARCore apps do not show ([ViroReact](https://github.com/ReactVision/viro); [ViroReact issue #568](https://github.com/ReactVision/viro/issues/568)); and the React Native 3D renderers, React Three Fiber on expo-gl and react-native-filament, draw scenes but do no AR ([React Three Fiber docs](https://r3f.docs.pmnd.rs/getting-started/installation); [react-native-filament](https://github.com/margelo/react-native-filament)).

The alternatives fare worse for a small team. **Fully native** apps give the best capture and AR: on iOS 17 and later, RoomPlan can hand its AR session straight to the AR view, so products line up with the scanned room without realignment ([RoomPlan init(arSession:)](https://developer.apple.com/documentation/roomplan/roomcapturesession/init(arsession:))). But they mean three separate interface codebases (Swift, Kotlin and web). **Unity** gives one C# codebase, yet still cannot build meshes on Android, embeds only full-screen on phones, keeps 80–180 MB of memory resident even when unloaded, and costs $2,310 per Pro seat per year ([Unity as a Library](https://docs.unity.com/en-us/engine/current/manual/platform-specific/cross-platform-features/unityasa-library); [Unity pricing](https://unity.com/products/pricing-updates)). **Flutter's** main cross-platform AR plugin has not had a release since 2022 ([ar_flutter_plugin](https://github.com/CariusLars/ar_flutter_plugin)), and Flutter shares no code with a React-based website.

### Android gets guided capture because Google has no RoomPlan

Google offers no structured room-capture API. ARCore gives motion tracking, plane detection and depth images, in metres since version 1.56, but no mesh or room layout, and its scene-labelling feature works outdoors only ([ARCore Raw Depth](https://developers.google.com/ar/develop/java/depth/raw-depth); [ARCore releases](https://github.com/google-ar/arcore-android-sdk/releases); [ARCore Scene Semantics](https://developers.google.com/ar/develop/scene-semantics)). The realistic demo capture is therefore guided: ARCore finds the floor, the user taps floor corners or wall bases, sets the ceiling height and marks doors and windows, and the app writes the same room file RoomPlan produces. The same flow serves non-LiDAR iPhones through ARKit's plane detection, giving one shared fallback. Its risks are drift in large rooms and the need for coaching that RoomPlan provides for free on iPhone. Depth-based meshing on Android is a post-demo research track of several engineer-months by the platform researcher's estimate, and cloud reconstruction from video is a possible premium visual layer later.

### The website is a 3D viewer; room-scale AR stays in the app

For the "see my room on a bigger screen" requirement, three.js through React Three Fiber is the default choice: MIT-licensed, the largest web 3D ecosystem, native GLB support and the same React model as the app, so the in-app 3D view and the website can share code ([three.js](https://github.com/mrdoob/three.js); [React Three Fiber](https://github.com/pmndrs/react-three-fiber)). Web AR is lopsided. **Safari on iPhone still has no WebXR, the browser standard for AR, through iOS 27.2**, while Chrome on Android ships it with hit testing, anchors and depth ([caniuse: WebXR](https://caniuse.com/webxr); [Google: ARCore vs WebXR](https://developers.google.com/ar/develop/webxr/arcore-comparison)). So the website should not promise room-scale AR on iPhones. Single products can still open in AR through Apple's Quick Look (USDZ) and Google's Scene Viewer (GLB), and model-viewer can even generate the USDZ on the fly ([AR Quick Look](https://developer.apple.com/documentation/arkit/previewing-a-model-with-ar-quick-look); [model-viewer AR](https://modelviewer.dev/examples/augmentedreality/)). For an optional photoreal layer later, the Spark renderer (MIT) adds Gaussian splats, a newer photo-like 3D format, to three.js today ([Spark](https://github.com/sparkjsdev/spark)). The notes disagree on whether glTF's splat extension is final; the Khronos registry page itself reads "Ratified", though no Khronos announcement was found, so the registry page is the better evidence ([Khronos registry](https://github.com/KhronosGroup/glTF/blob/HEAD/extensions/2.0/Khronos/KHR_gaussian_splatting/README.md)).

### One room file keeps phone, AR and web in step

The architecture's key idea is a single, versioned room file in metres (floor outline, walls, doors, windows and openings, detected furniture boxes, and a note of how it was captured), plus a separate design file listing each placed product's ID, position, rotation and colour, with scale fixed at 1:1. RoomPlan's own output can be saved as JSON, so on iPhone the app converts it into this file and keeps Apple's original for later reprocessing ([RoomPlan CapturedRoom](https://developer.apple.com/documentation/roomplan/capturedroom)). Each renderer (three.js, RealityKit, SceneView) then draws the walls from the same numbers, roughly a few hundred lines per engine by the platform researcher's estimate, which guarantees identical geometry everywhere and avoids fragile room-file conversion. A room plus its design is under 1 MB, so Supabase's free tier, which bundles sign-in, a Postgres database, file storage and row-level security (rules that restrict each record to its owner), is enough for the demo, with Cloudflare R2's zero-egress storage added when meshes or splats arrive ([Supabase pricing](https://supabase.com/pricing); [Cloudflare R2 pricing](https://developers.cloudflare.com/r2/pricing/)). Firebase is a weaker fit now that its file storage requires the paid Blaze plan ([Firebase storage FAQ](https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024)).

| Capability | LiDAR iPhones (12 Pro to 18 Pro) | Other iPhones (iPhone 11 and later, including 17 and Air) | Android (ARCore-certified) | Web browser |
|---|---|---|---|---|
| Automatic structured room scan | RoomPlan | No; guided capture | No; guided capture | No |
| Live AR placement | ARKit and RealityKit | ARKit and RealityKit | ARCore and SceneView | Single products only (Quick Look, Scene Viewer); WebXR on Android Chrome |
| Depth for hiding products behind real objects | LiDAR | Estimated only | Depth API on >88% of active devices | Android Chrome only |
| 3D orbit view | Yes | Yes | Yes | three.js |

Sources for the table: [RoomPlan isSupported](https://developer.apple.com/documentation/roomplan/roomcapturesession/issupported), [Apple: ARKit device support](https://developer.apple.com/documentation/arkit/verifying-device-support-and-user-permission), [AppleInsider](https://appleinsider.com/articles/26/06/08/ios-27-keeps-iphone-11-and-newer-compatibility), [ARCore supported devices](https://developers.google.com/ar/devices), [caniuse: WebXR](https://caniuse.com/webxr).

## The AI final picture should start as an exact render

### Generators redraw everything, including the product

The team's literal proposal (screenshot the 3D view, send it to an image model, get back a polished picture) relies on today's instruction-based image editors, and **every one of them redraws the whole frame, products included**. OpenAI's own guide says its model "may have difficulty placing elements precisely in structured or layout-sensitive compositions" and treats masks only as guidance; Google's Gemini editor offers no mask at all and relies on prompts such as "Do not change any other elements of the image" ([OpenAI image guide](https://developers.openai.com/api/docs/guides/image-generation); [Gemini image docs](https://aistudio.google.com/docs/image-generation)). A review of Wayfair's AI tool found it struggled with room angles and proportions ([Dwell](https://www.dwell.com/article/wayfair-ai-muse-review-e0a7fbd4)). If the 3D room is a plain RoomPlan shell, the model must also invent wall finishes, flooring, window views and lighting, producing "a beautiful room" rather than "your room with this sofa". The market reflects this. Retailers that sell exact items, such as IKEA, Amazon and Houzz, render real 3D models and confine AI to the room, for instance to erase old furniture, while generative tools like Wayfair's Decorify linked their images to "closest-matching" products ([Furniture Today](https://www.furnituretoday.com/furniture-retailer/how-is-ikeas-new-platform-erasing-existing-furniture); [Chain Store Age](https://chainstoreage.com/wayfair-creates-shoppable-home-images-generative-ai)). No consumer product found combines a phone scan, measured geometry, exact products and a generated photoreal image.

| Approach | Room geometry | Exact product? | Realism | Cost per image | Fit for v1 |
|---|---|---|---|---|---|
| Screenshot sent to an AI editor (the team's idea) | Soft; windows and walls can shift | No; product redrawn | Highest | About $0.03–0.21 | Inspiration mode only |
| AI guided by depth and edge maps rendered from YoungVista's own scene ("ControlNet"-style) | Good | No | Medium to high | About $0.03 per megapixel hosted | No |
| Exact 3D render, no AI | Exact to the scan | Yes | Limited by plain walls | Near zero | Yes |
| Real scan photo with exact products composited in | Exact (it is a photo) | Yes | High | Near zero | Yes, near captured viewpoints |
| Hybrid: exact render or photo, AI only on room, light and shadows, product pixels pasted back | Exact base | Yes | High | Render plus one AI call | Labelled beta later |

The guided-AI row's cost reflects hosted Qwen models at about $0.03 per megapixel, for which Apache-licensed depth and edge conditioning already exists ([fal.ai](https://fal.ai/models/fal-ai/qwen-image-edit-2511); [Qwen-Image ControlNet Union](https://huggingface.co/InstantX/Qwen-Image-ControlNet-Union)). The hybrid is the only design that structurally prevents product drift, and it reuses the camera, mask and depth outputs that the exact render and the photo composite already need, so building those first is not wasted work.

### Cost, speed and consent shape any AI version

At list prices a roughly 1–2 megapixel image costs **about $0.034 (Gemini's Nano Banana 2.1 at 1K) to $0.21 (OpenAI's gpt-image-2 at high quality)** ([Gemini pricing](https://aistudio.google.com/docs/pricing); [OpenAI pricing](https://developers.openai.com/api/docs/pricing)). At 30,000 images a month that is roughly $1,000 to $6,300 before any regenerations. OpenAI warns complex requests can take up to two minutes, so the feature must run in the background with a notification ([OpenAI image guide](https://developers.openai.com/api/docs/guides/image-generation)). Self-hosting is commercially possible only with permissively licensed models such as Alibaba's Qwen-Image-Edit-2511 (Apache-2.0) ([Qwen-Image-Edit-2511](https://huggingface.co/Qwen/Qwen-Image-Edit-2511)); several better-known open models, such as Black Forest Labs' FLUX "dev" versions, need a paid licence for commercial use ([BFL help](https://help.bfl.ai/articles/4375863104-can-i-use-the-api-for-a-commercial-application)). Consent is not optional. Apple's App Review rules require apps to disclose and obtain "explicit permission" before sharing personal data with third-party AI ([Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)); Gemini's terms require paid tiers for apps offered in the EEA, Switzerland and the UK and bar apps likely to be used by under-18s ([Gemini API terms](https://aistudio.google.com/docs/terms)); OpenAI does not train on API data by default and offers zero data retention on approval ([OpenAI data controls](https://developers.openai.com/api/docs/guides/your-data)); and EU AI Act rules on marking synthetic images arrive in 2026, though sources disagree on the final dates ([Taylor Wessing](https://taylorwessing.com/en/insights-and-events/insights/2026/05/the-eu-digital-omnibus-on-ai-what-the-political-deal-means)).

### Capture the photos now, ship the exact render first

The decision that cannot be undone is capture. ARKit can grab a high-resolution still, tagged with the camera's exact position, at any point in a session ([Apple: captureHighResolutionFrame](https://developer.apple.com/tutorials/data/documentation/arkit/arsession/capturehighresolutionframe(completion:).json)); LiDAR iPhones add depth with confidence; and ARCore's HDR mode records the main light direction and an environment map ([ARCore lighting estimation](https://developers.google.com/ar/develop/lighting-estimation)). On iOS 17 and later, RoomPlan can run on the app's own AR session, so one scan can in principle produce both the room model and this photo set; the research did not test this end to end. If YoungVista stores posed photos, depth and lighting with every scan, plus the exact product, colour, file version and position for every placement, any future model can re-render old rooms; if not, customers must rescan. **The recommended first version is therefore a deterministic "HQ snapshot"**: the user picks an angle and the app renders the exact products with good materials, soft shadows and the captured lighting, laid over the real scan photo when the chosen angle is close to one. It costs almost nothing per image and produces the depth, mask and product layers an AI stage will need. An "AI-enhanced" option should follow only as an opt-in, labelled beta built on the hybrid design, with product pixels pasted back from the exact render and walls, windows and doors protected, and only after a test set of real rooms shows that products and room structure survive intact.

## Conclusion

The research moves the difficulty to a different place than the brief expected. Scanning a room and placing a sofa in it is no longer the hard part: Apple gives it away on LiDAR iPhones, and live AR placement has been a commodity since 2017. The hard parts are the majority of phones without LiDAR, a capture flow that non-experts actually finish, and one room model that stays consistent across the 3D view, live AR and the website. That sharpens the team's theory. The value is in the software, but the software that matters most is guided capture and correction rather than reconstruction algorithms, and Matterport's real moat, millions of scans of training data, is something YoungVista can only grow from its own customers, with their consent.

The second shift is that licences, not technology, draw many of the boundaries. Free GLB furniture, permissive web renderers and a commercially safe reconstruction stack all exist, but the best-known splatting code, most trained room-layout models, several AI depth models and Tencent's 3D generator are off-limits or restricted by country, and generative image models bring consent and misrepresentation duties the moment real products meet real homes. Because the business answers (customer, catalog and market) decide which licences and accuracy levels apply, the first four decisions below should be settled before any code is written.

## Questions for the team

Each decision below can be answered with one letter, and the recommendation is the research's best guess, not a decision. "Blocks the plan" items need answers before the final plan is written, "Before build" items before engineering starts on that part, and "Can wait" items can follow the demo.

### Product and business

#### Q1. What core job does the first customer hire YoungVista for: checking that furniture fits, or seeing how it looks?
- **Priority:** Blocks the plan
- **Who decides:** Business, with the whole team
- **Why it matters:** Fit decisions turn on gaps of a few centimetres, which only LiDAR scans (about 1–3 cm per wall) or a tape-measured reference can support, while walls captured without LiDAR are typically 5–10 cm off ([Sensors 2024](https://pmc.ncbi.nlm.nih.gov/articles/PMC10893111/); [Medium, 2017](https://medium.com/inborn-experience/getting-a-room-plan-with-arkit-the-case-where-size-matters-1e104ee42421)). "Looks right" is far easier: in one usability test a shopper resized a table to 79% of its true size without noticing ([Baymard Institute](https://baymard.com/blog/deprioritize-view-in-room-augmented-reality)).
- **Options:**
  - **A.** "Will it fit": measurement-first, with dimensions and fit verdicts as the headline feature.
  - **B.** "How will it look": visual-first, with approximate scale and effort spent on realism.
  - **C.** Look first, fit second: true-scale visuals everywhere, approximate dimensions, and a "measure this gap with a tape" prompt for tight spots.
- **Recommended:** C — it matches the brief's "looks about right" target without promising a precision that most phones cannot deliver.

#### Q2. Whose products will the app show, and how will YoungVista earn money from them?
- **Priority:** Blocks the plan
- **Who decides:** Business
- **Why it matters:** This decides where product models come from and how exact they must be: the research found no open 3D-model programme from IKEA or Wayfair, and marketplaces such as TurboSquid forbid shipping their models in open formats like GLB ([TurboSquid licence](https://blog.turbosquid.com/turbosquid-3d-model-license/)). The free ABO models are real products but date from 2021 and carry no prices ([ABO](https://amazon-berkeley-objects.s3.amazonaws.com/index.html)), and Polycam's reviews show consumers resent paying for measurements ([Polycam on the App Store](https://apps.apple.com/app/id1532482376)).
- **Options:**
  - **A.** Affiliate: a free app with a curated multi-brand catalog, earning commission on referred sales.
  - **B.** Partner-supplied (B2B2C): retailers or brands pay to put their own products and 3D models into the free consumer app.
  - **C.** Consumer subscription for premium features.
  - **D.** YoungVista's own product line.
- **Recommended:** B — it is the only route the research found to licensed, exact and current product models while keeping the consumer app free, which suits the B2C goal.

#### Q3. Which country or market launches first?
- **Priority:** Blocks the plan
- **Who decides:** Business
- **Why it matters:** The market sets the iPhone and Android mix, how many users have LiDAR (the only device data found is American: Pro models made up 45% of US iPhone sales in data reported in November 2024 ([MacRumors, citing CIRP](https://www.macrumors.com/2024/11/21/best-selling-iphone-model-sizes-revealed/))), whether the app shows feet or metres, and which licences work. Tencent's Hunyuan3D licence excludes the EU, the UK and South Korea ([Hunyuan3D 2.1 licence](https://huggingface.co/tencent/Hunyuan3D-2.1/blob/main/LICENSE)), and Gemini's API terms require paid tiers for apps offered in the EEA, Switzerland or the UK ([Gemini API terms](https://aistudio.google.com/docs/terms)).
- **Options:**
  - **A.** United States first.
  - **B.** South Korea first.
  - **C.** EU or UK first.
  - **D.** Several markets at once.
- **Recommended:** A — the brief already thinks in feet and inches, the only device-share data found is American, and fewer of the licence restrictions found apply there.

#### Q4. What is the first demo for, and who will see it?
- **Priority:** Blocks the plan
- **Who decides:** Whole team, led by the business lead
- **Why it matters:** A demo run on the team's own LiDAR iPhone can lean on RoomPlan, which delivers a structured room "within just a few seconds" ([WWDC22](https://developer.apple.com/videos/play/wwdc2022/10127/)), while a beta on strangers' phones must also handle non-LiDAR iPhones and Android, where nothing equivalent exists. The platform research found an iPhone-only demo is the fastest build but turns Android into a later port.
- **Options:**
  - **A.** Internal proof of concept for the team only.
  - **B.** Investor or partner pitch, run by the team on its own phones.
  - **C.** Closed beta with real customers on their own phones.
  - **D.** Public app-store launch.
- **Recommended:** B — it lets the demo lead with the strongest LiDAR path while still showing Android, and defers the device testing a public beta would need.

#### Q5. What result would count as a successful demo?
- **Priority:** Before build
- **Who decides:** Whole team
- **Why it matters:** Capture is the riskiest step for non-experts: Matterport sells a motorised mount to make phone captures consistent ([Matterport Axis](https://matterport.com/store/product/cam-axis)), and 87% of furniture shoppers in Baymard's testing largely avoided AR features ([Baymard Institute](https://baymard.com/blog/deprioritize-view-in-room-augmented-reality)). The success test decides what gets built and measured first.
- **Options:**
  - **A.** It works on stage: one scripted scan-to-sofa flow runs end to end.
  - **B.** It is accurate: scanned walls land within an agreed tolerance of a tape measure across several test rooms.
  - **C.** It is usable: most first-time testers scan a room and place a sofa unaided within a set time.
  - **D.** It is wanted: sign-ups, pre-orders or a partner's letter of intent.
- **Recommended:** C — capture usability is the risk the research flags most often, and usable test sessions also produce the accuracy data for B.

#### Q6. Should the plan keep a door open for professional, construction or Matterport/BIM uses?
- **Priority:** Can wait
- **Who decides:** Business, with input from the teammate who suggested Matterport
- **Why it matters:** Construction-grade models need about 15 mm on wall faces, and Matterport's automated BIM output is only placeholder-level ([Enginyring](https://www.enginyring.com/en/blog/matterport-and-handheld-lidar-to-cad-bim-turning-consumer-scans-into-dwg-and-ifc); [Reality Capture Experts](https://realitycaptureexperts.com/matterport-accuracy/)), while a consumer placing a sofa needs a few centimetres. Building on Matterport would cost roughly $2.5–3 per customer room per month at third-party plan prices ([SofaBrain](https://sofabrain.com/learn/matterport-pricing)) and add platform risk: in October 2025 Zillow pulled Matterport tours, saying CoStar had declined to renew its API agreement ([Real Estate News](https://www.realestatenews.com/2025/10/20/zillow-pulls-matterport-tours-from-listings-blames-costar)).
- **Options:**
  - **A.** Consumer only; drop professional uses.
  - **B.** Consumer first, but keep raw scan data and a neutral room format so floor-plan or CAD exports can be added later.
  - **C.** Build on Matterport's platform now to serve both.
- **Recommended:** B — it costs little now and keeps the option open without bending the consumer product toward accuracy it does not need.

### Devices and capture

#### Q7. May the demo require a LiDAR iPhone for the full automatic room scan?
- **Priority:** Blocks the plan
- **Who decides:** Whole team
- **Why it matters:** RoomPlan runs only on LiDAR devices, meaning Pro and Pro Max iPhones from the 12 Pro to the 18 Pro plus iPad Pros ([Apple Support: Models with a LiDAR Scanner](https://support.apple.com/guide/iphone/aside/iphc07537a89/27/ios/27); [WWDC22](https://developer.apple.com/videos/play/wwdc2022/10127/)), an estimated 35–45% of active US iPhones and essentially no Android phones. Everything else needs a guided capture that YoungVista must build.
- **Options:**
  - **A.** Yes: the demo runs only on LiDAR iPhones.
  - **B.** The LiDAR iPhone is the "hero" path, and the demo also shows guided capture on at least one Android phone.
  - **C.** No: every phone must get the same experience from day one.
- **Recommended:** B — it shows the best experience while proving the brief's iPhone-and-Android requirement, and parity from day one is not achievable with today's Android tools.

#### Q8. How should non-LiDAR iPhones and Android phones capture a room in the first version?
- **Priority:** Blocks the plan
- **Who decides:** Engineering, with business
- **Why it matters:** Google offers no RoomPlan equivalent, ARCore builds no mesh ([Unity ARCore plug-in manual](https://docs.unity3d.com/Packages/com.unity.xr.arcore@6.2/manual/index.html)), and in a bare room its depth arrived on only 0.4–11% of frames in a 2026 preprint ([Research Square preprint](https://www.researchsquare.com/article/rs-10991704)). Competitors cope with tap-the-corners modes or cloud processing that takes hours, as with Hover's 15-minute capture and roughly 3-hour turnaround ([magicplan help](https://help.magicplan.app/scan-a-room-with-the-camera-of-your-mobile-device-android); [Hover help](https://help.hover.to/en/articles/9264961-interior-scans-non-lidar)).
- **Options:**
  - **A.** Guided capture: tap floor corners and wall bases on detected planes, set the ceiling height, mark doors and windows, then edit dimensions.
  - **B.** Record a video walk-through and reconstruct it in the cloud.
  - **C.** No room scan on these phones: live AR product placement only.
  - **D.** A photo or panorama scene taken from one spot, IKEA-style.
- **Recommended:** A — it works on every ARCore and ARKit phone, produces the same room file as RoomPlan and runs on the device with no GPU bill.

#### Q9. Which phones will the team test on, and which iPhone ran the Measure test?
- **Priority:** Before build
- **Who decides:** Engineering (whoever ran the Measure test can confirm the phone)
- **Why it matters:** The Measure explanation depends on the model: person height is a LiDAR-only feature, so if the test phone was a non-Pro iPhone, both readings came from manual taps that can land on the wall behind the person ([Apple Support: person height](https://support.apple.com/guide/iphone/measure-a-persons-height-iph341d4a993/ios)). Android behaviour also varies by handset; the leading React Native AR library has open camera and tracking bugs on Samsung phones running Android 16 that plain ARCore apps do not show ([ViroReact issue #568](https://github.com/ReactVision/viro/issues/568); [ViroReact issue #499](https://github.com/ReactVision/viro/issues/499)).
- **Options:**
  - **A.** Only the phones the team already owns.
  - **B.** A minimum set: one LiDAR iPhone, one non-LiDAR iPhone and three Androids (a Pixel, a Galaxy flagship and a Galaxy mid-range model).
  - **C.** A broad matrix of 5–8 popular Android phones plus three iPhones from the start.
- **Recommended:** B — it covers all three capture paths cheaply, and the matrix can grow once guided capture works.

### Team, timeline and budget

#### Q10. Which app framework fits the team's skills and size?
- **Priority:** Blocks the plan
- **Who decides:** Engineering
- **Why it matters:** Whatever the framework, scanning and AR screens end up as native Swift and Kotlin code; Expo can host them as custom modules but then needs development builds rather than the Expo Go app ([Expo SDK 58](https://expo.dev/changelog/sdk-58)), while fully native means three interface codebases (Swift, Kotlin and web). Unity costs $2,310 per Pro seat per year and embeds only full-screen on phones ([Unity pricing](https://unity.com/products/pricing-updates); [Unity as a Library](https://docs.unity.com/en-us/engine/current/manual/platform-specific/cross-platform-features/unityasa-library)), and Flutter's main cross-platform AR plugin has not shipped a release since 2022 ([ar_flutter_plugin](https://github.com/CariusLars/ar_flutter_plugin)).
- **Options:**
  - **A.** Expo (React and TypeScript) shell with small in-repo Swift and Kotlin modules for scanning and AR.
  - **B.** Fully native: separate Swift and Kotlin apps, plus a separate web viewer.
  - **C.** Unity with AR Foundation.
  - **D.** Expo with ViroReact for AR in JavaScript only, pinned to Expo SDK 57.
- **Recommended:** A — it gives one interface codebase that shares 3D code with the website and keeps native quality only where it matters, switching to B for a Swift/Kotlin-heavy team or D for a team with no native skills.

#### Q11. Is the demo date fixed, or is the demo scope fixed?
- **Priority:** Blocks the plan
- **Who decides:** Business and engineering
- **Why it matters:** No measured effort data exists for these options; the platform research's rough estimate is a few thousand lines of Swift and Kotlin for capture and AR, plus a web viewer. The riskiest parts, Android guided capture and handing RoomPlan's AR session to the AR view inside an Expo module ([RoomPlan init(arSession:)](https://developer.apple.com/documentation/roomplan/roomcapturesession/init(arsession:))), are plausible but unverified.
- **Options:**
  - **A.** Fixed date: shrink scope to the LiDAR iPhone path plus a read-only website.
  - **B.** Fixed scope: both iPhone paths, Android and the website, and the date moves.
  - **C.** Run a short, fixed-length technical spike on the two riskiest parts first, then set date and scope together.
- **Recommended:** C — it replaces guesswork about the two largest unknowns with measured results before anyone commits to a date.

#### Q12. How much can the team spend on cloud, AI and assets, and should it buy paid tools where they save time?
- **Priority:** Before build
- **Who decides:** Business
- **Why it matters:** The recommended stack is free or cheap: a room plus its design is under 1 MB, Supabase's free tier allows 50 MB files and its Pro plan costs $25 a month ([Supabase pricing](https://supabase.com/pricing)), and every recommended library is permissively licensed. The paid options found mostly sell to professionals at sales-quoted prices (Hover, CubiCasa, Niantic meshing), and AI images run $0.03–0.21 each before regenerations ([Gemini pricing](https://aistudio.google.com/docs/pricing); [OpenAI pricing](https://developers.openai.com/api/docs/pricing)).
- **Options:**
  - **A.** Open-source and free tiers only.
  - **B.** Open-source first, with a small monthly budget for hosting, test phones and AI experiments.
  - **C.** Open to paid toolkits or services (cloud reconstruction, meshing, AI) wherever they save months.
- **Recommended:** B — the research found no paid toolkit that solves consumer Android room capture, so money is better spent on hosting, test devices and AI trials.

### The scanned room

#### Q13. How should the scanned room look in the 3D view?
- **Priority:** Blocks the plan
- **Who decides:** Whole team
- **Why it matters:** A clean "dollhouse" of walls, floor, doors and windows can be drawn from RoomPlan's data on every platform and keeps rooms under 1 MB, while photo-textured meshes and Gaussian splats need cloud processing, produce much larger files and rule out the original splatting code, which is licensed for non-commercial use only ([Inria Gaussian splatting licence](https://github.com/graphdeco-inria/gaussian-splatting/blob/HEAD/LICENSE.md)). For a sofa demo, walls in the right place matter more than photoreal texture.
- **Options:**
  - **A.** Clean parametric dollhouse: plain walls, floor, doors and windows in chosen colours.
  - **B.** Photo-textured mesh of the real room.
  - **C.** Photoreal Gaussian-splat room as a backdrop.
- **Recommended:** A — it looks the same on iPhone, Android and the web, and storing the scan photos now keeps B and C open for later.

#### Q14. What should happen to furniture already in the room?
- **Priority:** Before build
- **Who decides:** Whole team
- **Why it matters:** RoomPlan detects 16 kinds of furniture and fixtures as labelled boxes ([RoomPlan object categories](https://developer.apple.com/documentation/roomplan/capturedroom/object/category-swift.enum)), but guided capture on other phones detects none. Photoreal erasing is hard: IKEA bought an AI imaging company to build Kreativ's erase feature ([TechCrunch](https://techcrunch.com/?p=1969198)), and Matterport's defurnishing uses a custom AI inpainting model whose code is not released ([Matterport research](https://matterport.github.io/automatic-defurnishing-of-indoor-panoramas)).
- **Options:**
  - **A.** Show detected furniture as simple boxes the user can hide, with a "start empty" switch.
  - **B.** Keep existing furniture as a scanned 3D mesh.
  - **C.** Always start with an empty room.
  - **D.** Erase furniture from photos with AI, IKEA-style.
- **Recommended:** A — it is cheap with RoomPlan, lets users see what they are replacing, and falls back gracefully to "empty" on other phones.

#### Q15. When a door is open or a room opens onto another space, where does the room end?
- **Priority:** Before build
- **Who decides:** Whole team
- **Why it matters:** Apple tells users to close doors because open ones let the scan leak into the next room ([WWDC22](https://developer.apple.com/videos/play/wwdc2022/10127/)), and RoomPlan records whether a door is open but not how it swings ([RoomPlan surface categories](https://developer.apple.com/documentation/roomplan/capturedroom/surface/category-swift.enum)). The research found no open-source tool that closes door openings automatically, so the rule is a product decision.
- **Options:**
  - **A.** Every doorway closes the room with an invisible wall, and everything beyond is cropped.
  - **B.** Keep everything the scan captured, including partial glimpses of neighbouring rooms.
  - **C.** Doorways and narrow gaps close the room; for wide openings, ask "include this area?" on a top-down preview.
- **Recommended:** C — it keeps rooms clean for furniture placement while still handling open-plan living and dining spaces.

#### Q16. Must the first version handle more than one room per scan?
- **Priority:** Before build
- **Who decides:** Whole team
- **Why it matters:** RoomPlan merges rooms only on iOS 17 and later, recommends at most about 186 m² (2,000 sq ft), and leaves duplicate walls when rooms are stitched by hand ([WWDC23](https://developer.apple.com/videos/play/wwdc2023/10192/)); Android has no equivalent. Reviews of a professional scanning app report rooms joined in distorted positions ([RoomScan on the App Store](https://apps.apple.com/us/app/roomscan-pro-lidar-floor-plans/id1504050801)).
- **Options:**
  - **A.** One room per scan only.
  - **B.** Several rooms scanned separately and joined, on iPhone first.
  - **C.** Whole-home capture in one pass.
- **Recommended:** A — one room fits the sofa use case and avoids the error-prone merge step entirely.

#### Q17. Can users correct the scan after capture?
- **Priority:** Before build
- **Who decides:** Whole team
- **Why it matters:** Every scanner reviewed misses things, from RoomScan's missed alcoves and doors to CubiCasa's phantom door and missing wall ([RoomScan on the App Store](https://apps.apple.com/us/app/roomscan-pro-lidar-floor-plans/id1504050801); [CubiCasa on the App Store](https://apps.apple.com/us/app/cubicasa/id1439879192)), and IKEA Kreativ still cannot edit room dimensions after creation ([IKEA Ireland help](https://www.ikea.com/ie/en/customer-service/knowledge/articles/28c782c5-0036-4ff1-b1fd-20846237ee09.html)). A correction step is also the backbone of guided capture on Android.
- **Options:**
  - **A.** No editing; rescan if wrong.
  - **B.** A simple top-down editor: drag corners, type a wall length, add or move doors and windows, set the ceiling height.
  - **C.** A full CAD-style editor.
- **Recommended:** B — it fixes most scan errors without hard-coding room shapes and doubles as the Android fallback.

#### Q18. How faithfully must curved walls, sloped ceilings and odd angles appear?
- **Priority:** Can wait
- **Who decides:** Engineering, with business
- **Why it matters:** RoomPlan already models curved walls as arcs, slanted walls as polygons and floors of any shape, but has no ceiling surface at all ([RoomPlan curves](https://developer.apple.com/documentation/roomplan/capturedroom/surface/curve-swift.struct); [RoomPlan polygon walls](https://developer.apple.com/documentation/roomplan/capturedroom/surface/polygoncorners)), so sloped ceilings would need ARKit's separate labelled mesh ([ARKit mesh classification](https://developer.apple.com/documentation/arkit/armeshclassification)). No open-source layout tool outputs arcs, so Android would approximate curves with short straight segments.
- **Options:**
  - **A.** Straight walls and a flat ceiling everywhere.
  - **B.** RoomPlan's arcs and angled walls on iPhone, straight-segment approximations on Android, and a flat ceiling at one height.
  - **C.** Full fidelity, including sloped and vaulted ceilings.
- **Recommended:** B — it uses what RoomPlan gives for free and defers ceilings, which matter little for floor furniture.

### Products and placement

#### Q19. Must products placed in the 3D view appear in the same spots in live AR, including on a later day?
- **Priority:** Blocks the plan
- **Who decides:** Whole team, with engineering
- **Why it matters:** Right after a RoomPlan scan, iOS 17 and later can hand the same AR session to the AR view, so placements line up with no extra step ([RoomPlan init(arSession:)](https://developer.apple.com/documentation/roomplan/roomcapturesession/init(arsession:))); on a later day the phone must re-find the room, and the tools that might do this automatically (ARKit world maps, ARCore Cloud Anchors) were not verified. A reviewer missed live AR when IKEA moved to a model-only approach ([Mako](https://www.mako.co.il/nexter-news/Article-6838ffcdddb8181027.htm)).
- **Options:**
  - **A.** Separate: AR is a "try it live" mode where products are placed fresh, like IKEA Place.
  - **B.** Linked during the scan session, with a quick "tap two corners" alignment on later days.
  - **C.** Fully automatic re-alignment on any day and any device.
- **Recommended:** B — it delivers the brief's two linked views with proven tools and leaves automatic re-alignment as a later upgrade.

#### Q20. Which catalog should the demo use, and how big should the starter set be?
- **Priority:** Before build
- **Who decides:** Business
- **Why it matters:** The research assembled 40 free models covering 19 categories at verified real-world scale from Amazon Berkeley Objects (CC BY 4.0, credit "Amazon.com"), Poly Haven (CC0) and Khronos ([ABO](https://amazon-berkeley-objects.s3.amazonaws.com/index.html); [Poly Haven licence](https://polyhaven.com/license)). ABO alone offers about 7,950 models if more variety is needed, but its 2021 data has no prices and may include discontinued products.
- **Options:**
  - **A.** The 40-model open starter set, with mocked prices and neutral product names.
  - **B.** A larger open set of 100–300 models for browsing variety.
  - **C.** A real partner's products only.
  - **D.** AI-generated models made from product photos.
- **Recommended:** A — it is ready now, covers every requested category, and needs only a credits screen and light cleanup.

#### Q21. Does "cabinets" mean freestanding furniture or fitted kitchen and bathroom cabinets?
- **Priority:** Before build
- **Who decides:** Business
- **Why it matters:** Fitted cabinets are a different product that runs along walls in exact widths, and IKEA itself steers kitchens and bathrooms to dedicated planners rather than Kreativ ([IKEA US help](https://www.ikea.com/us/en/customer-service/knowledge/articles/e86d70g6-3673-4306-b373-20f7cg7fd5ed.html)). No realistic, freely licensed fitted kitchen base cabinet was found in ABO, Poly Haven or Khronos, so fitted cabinets would need a cabinet generator or a manufacturer partner.
- **Options:**
  - **A.** Freestanding storage only (sideboards, dressers, wardrobes, bookcases) in the first version.
  - **B.** Fitted kitchen and bathroom cabinets in the first version.
  - **C.** Both.
- **Recommended:** A — the open models already cover freestanding storage, and fitted cabinetry is a separate planning product.

#### Q22. Which placement features must the first version have?
- **Priority:** Before build
- **Who decides:** Whole team
- **Why it matters:** Room planners such as RoomSketcher snap pieces to walls when dragged close ([RoomSketcher help](https://help.roomsketcher.com/hc/en-us/articles/115001610525)), and wall-mounted items need a different anchor point and AR mode from floor items ([model-viewer AR](https://modelviewer.dev/examples/augmentedreality/)). Every feature must work in three renderers (iPhone, Android and web).
- **Options:**
  - **A.** Basic: drag on the floor, rotate, delete and place several items.
  - **B.** Basic, plus snapping to walls, no overlapping items and colour variants.
  - **C.** B, plus wall-mounted items (art, shelves, TVs) and stacking (a lamp on a table).
- **Recommended:** B — snapping and collisions make fit checks believable, and colour variants are already built into several of the free models.

#### Q23. Should customers ever be able to resize a product?
- **Priority:** Before build
- **Who decides:** Whole team
- **Why it matters:** In Baymard's testing a shopper accidentally shrank a table to 79% of its true size, did not notice and judged fit wrongly ([Baymard Institute](https://baymard.com/blog/deprioritize-view-in-room-augmented-reality)). IKEA Kreativ removes resizing entirely ([IKEA Ireland help](https://www.ikea.com/ie/en/customer-service/knowledge/articles/28c782c5-0036-4ff1-b1fd-20846237ee09.html)), and Google's Scene Viewer offers a switch to block it ([Google Scene Viewer](https://developers.google.com/ar/develop/scene-viewer)).
- **Options:**
  - **A.** Never: products are always true size.
  - **B.** Allowed, but with a visible "not true size" badge and one-tap reset.
  - **C.** Free pinch-to-resize.
- **Recommended:** A — real products have real sizes, and resizing undermines the app's core promise.

### Measurements and accuracy

#### Q24. What accuracy target should the demo be tested against?
- **Priority:** Before build
- **Who decides:** Whole team
- **Why it matters:** Published LiDAR room scans land at about 1–3 cm per wall with occasional 5–40 cm outliers, while the best non-LiDAR room test found 3–20 cm, averaging 8.5 cm ([Sensors 2024](https://pmc.ncbi.nlm.nih.gov/articles/PMC10893111/); [Medium, 2017](https://medium.com/inborn-experience/getting-a-room-plan-with-arkit-the-case-where-size-matters-1e104ee42421)). Matterport sells its image-only captures at about 4–5% average error, roughly ±9–11 cm on a 2.2 m sofa ([Matterport Support](https://support.matterport.com/s/article/How-accurate-are-dimensions-in-Matterport-Spaces?language=en_US)).
- **Options:**
  - **A.** Visual only: no numeric target, just "looks right" to testers.
  - **B.** Within about 3 cm per wall on LiDAR iPhones and about 5% on other phones, checked against a tape measure in a set of test rooms.
  - **C.** Within 1–2 cm on every phone.
- **Recommended:** B — it is achievable for each device class and gives engineering a number to test, while C is beyond what phones without LiDAR can reach.

#### Q25. Should the app show dimensions and "fits / doesn't fit" verdicts, and with what disclaimer?
- **Priority:** Before build
- **Who decides:** Business, with the whole team
- **Why it matters:** Fit decisions hinge on clearances such as a sofa beside a door swing, and a 5–10 cm room error flips the answer when the gap is 5–10 cm. IKEA positions Kreativ as "not a measurement tool" ([MacMyths](https://macmyths.com/ikea-place-review-what-ikea-kreativ-does-in-2026/)), and shoppers in Baymard's study misjudged fit after accidentally resizing models ([Baymard Institute](https://baymard.com/blog/deprioritize-view-in-room-augmented-reality)).
- **Options:**
  - **A.** No numbers: visual placement only.
  - **B.** Approximate dimensions, a "too close to call, measure this gap with a tape" warning when a clearance is under about 5 cm on LiDAR iPhones or 10 cm on other phones, and an "approximate" disclaimer.
  - **C.** Precise dimensions and definitive fit verdicts.
- **Recommended:** B — it helps with fit without promising accuracy the phone cannot guarantee.

#### Q26. Should users calibrate a scan with one tape-measured length?
- **Priority:** Before build
- **Who decides:** Engineering, with business
- **Why it matters:** One known length rescales the whole room (a 4.10 m scanned wall that tapes at 4.00 m gets a uniform ×0.9756 correction), which fixes the main error on phones without LiDAR, though not local shape errors. Hover already asks users to measure one reference span by hand ([Hover help](https://help.hover.to/en/articles/9264961-interior-scans-non-lidar)).
- **Options:**
  - **A.** No calibration.
  - **B.** An optional "enter one wall length" step, suggested on phones without LiDAR.
  - **C.** A mandatory reference measurement on every scan.
- **Recommended:** B — it cheaply fixes overall scale where it matters most without adding a chore for LiDAR users.

### Web and cross-device

#### Q27. What should the website let people do in the first version?
- **Priority:** Before build
- **Who decides:** Whole team
- **Why it matters:** Safari on iPhone has no WebXR, the browser standard for AR, through iOS 27.2, so room-scale AR cannot run from the website on iPhones ([caniuse: WebXR](https://caniuse.com/webxr)), although single products can still open in AR via Quick Look or Scene Viewer ([AR Quick Look](https://developer.apple.com/documentation/arkit/previewing-a-model-with-ar-quick-look)). IKEA, the closest competitor, captures only in its app but lets users design and share on the web ([IKEA US help](https://www.ikea.com/us/en/customer-service/knowledge/articles/e86d70g6-3673-4306-b373-20f7cg7fd5ed.html)).
- **Options:**
  - **A.** Read-only viewer: orbit, zoom and toggle products in a shared room.
  - **B.** Viewer plus light editing (move, add or swap products) for signed-in owners.
  - **C.** Full parity with the app, including room editing.
- **Recommended:** A — it meets the brief's "see it on a bigger screen" need with the least code, and B can follow on the same renderer.

#### Q28. Who can open a shared room link?
- **Priority:** Before build
- **Who decides:** Business, with engineering
- **Why it matters:** A room scan reveals the inside of someone's home, so the platform research treats it as sensitive personal data: private by default, with unguessable and revocable links. Polycam already shares scans by link with access controls ([Polycam on the App Store](https://apps.apple.com/app/id1532482376)), and requiring sign-in protects more but adds friction for the family member or partner the link is meant for.
- **Options:**
  - **A.** Anyone with the link, using unguessable, revocable, expiring links that the owner creates.
  - **B.** Only signed-in people the owner invites.
  - **C.** The owner only, on their own signed-in devices.
- **Recommended:** A — it keeps rooms private until the owner chooses to share, and sharing stays one tap for the people they share with.

### Final picture (AI)

#### Q29. Should the polished "final picture" be in the first version, and in what form?
- **Priority:** Blocks the plan
- **Who decides:** Whole team
- **Why it matters:** Sending a screenshot to an AI image model redraws the whole frame: OpenAI says its model "may have difficulty placing elements precisely" and treats masks only as guidance, and a review of Wayfair's AI tool found it struggled with room angles and proportions ([OpenAI image guide](https://developers.openai.com/api/docs/guides/image-generation); [Dwell](https://www.dwell.com/article/wayfair-ai-muse-review-e0a7fbd4)). An exact high-quality render of the 3D scene, laid over a real scan photo where possible, gives most of the polish with no product drift.
- **Options:**
  - **A.** Not in the first version; note it as a future feature.
  - **B.** A deterministic "HQ snapshot" with no AI in the first version, and AI later.
  - **C.** The HQ snapshot plus an opt-in, clearly labelled "AI-enhanced (beta)" that keeps exact product pixels.
  - **D.** Full AI generation from a screenshot in the first version.
- **Recommended:** B — it delivers the polished result the team wants without the misrepresentation, cost and consent risks of generative AI.

#### Q30. Should the scan capture high-resolution photos, camera positions and lighting now, so an AI picture is possible later?
- **Priority:** Before build
- **Who decides:** Whole team
- **Why it matters:** Capture is the one choice that cannot be undone: ARKit can grab a high-resolution still with its exact camera position at any moment of a session ([Apple: captureHighResolutionFrame](https://developer.apple.com/tutorials/data/documentation/arkit/arsession/capturehighresolutionframe(completion:).json)) and ARCore records HDR lighting ([ARCore lighting estimation](https://developers.google.com/ar/develop/lighting-estimation)), but rooms scanned without them would have to be rescanned. These photos are also the most sensitive data YoungVista would hold.
- **Options:**
  - **A.** Geometry only.
  - **B.** Geometry plus posed photos, depth and lighting, uploaded to private storage with the user's consent.
  - **C.** The same as B, but kept on the phone until the user turns on a feature that needs them.
- **Recommended:** B — storage is cheap, it keeps the AI and photo-composite options open, and consent plus private storage contains the privacy risk.

#### Q31. If AI is used later, must products in the final picture be pixel-exact?
- **Priority:** Can wait
- **Who decides:** Business
- **Why it matters:** Retailers that sell exact items render real 3D models and confine AI to the room, while generative tools such as Wayfair's Decorify linked their images only to "closest-matching" products ([Chain Store Age](https://chainstoreage.com/wayfair-creates-shoppable-home-images-generative-ai)). Marketplaces already treat AI product imagery specially, with Google Merchant Center requiring AI-generation metadata on such images ([Google Merchant Center help](https://support.google.com/merchants/answer/14572008)); if the team picks AI for the first version, this becomes urgent.
- **Options:**
  - **A.** Exact: products are pasted back from the exact render, and AI only touches walls, light and shadows.
  - **B.** Approximate: AI may redraw products, labelled as inspiration.
  - **C.** Both, as clearly separated modes.
- **Recommended:** A — it is the only design that structurally prevents product drift, and it reuses the render layers the HQ snapshot already produces.

#### Q32. What per-image budget and waiting time are acceptable for an AI picture?
- **Priority:** Can wait
- **Who decides:** Business
- **Why it matters:** List prices run from about $0.034 per 1K image on Gemini's Nano Banana 2.1 to $0.211 on OpenAI's gpt-image-2 at high quality ([Gemini pricing](https://aistudio.google.com/docs/pricing); [OpenAI pricing](https://developers.openai.com/api/docs/pricing)), so 30,000 images a month cost roughly $1,000 to $6,300 before regenerations. OpenAI warns complex requests can take up to two minutes ([OpenAI image guide](https://developers.openai.com/api/docs/guides/image-generation)), so the feature must run as a background job with a notification.
- **Options:**
  - **A.** Up to about $0.05 per image, delivered in the background within a minute or two.
  - **B.** Up to about $0.25 per image for the best available model.
  - **C.** Self-host an Apache-licensed model to avoid per-image fees.
- **Recommended:** A — cheap models are good enough once product pixels are locked, and the budget stays near the low end of the cost range.

#### Q33. May customers' home images be sent to third-party AI services?
- **Priority:** Can wait
- **Who decides:** Business, with legal advice
- **Why it matters:** Apple's App Review rules require apps to disclose and get "explicit permission" before sharing personal data with third-party AI ([Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)). Providers differ: OpenAI does not train on API data by default, Gemini's terms bar apps likely to be used by under-18s, and Black Forest Labs may retain inputs unless you opt out ([OpenAI data controls](https://developers.openai.com/api/docs/guides/your-data); [Gemini API terms](https://aistudio.google.com/docs/terms); [BFL privacy policy](https://bfl.ai/privacy-policy)).
- **Options:**
  - **A.** Never: AI runs only on self-hosted or on-device models.
  - **B.** Only with a separate opt-in, using no-training or zero-retention API tiers, with faces and documents blurred on the phone first.
  - **C.** Covered by the general terms of service.
- **Recommended:** B — it satisfies Apple's explicit-consent rule, which C would breach, while keeping access to the strongest hosted models.

### Accounts, data and privacy

#### Q34. Do people need an account, and when?
- **Priority:** Before build
- **Who decides:** Whole team
- **Why it matters:** Viewing a room on another device requires the room to live under an account in the cloud, and Supabase's free tier covers sign-in for 50,000 monthly active users ([Supabase pricing](https://supabase.com/pricing)). Forcing sign-up before the first scan adds friction to a flow that already asks a lot of a first-time user, and 87% of shoppers in Baymard's testing already largely avoided AR features ([Baymard Institute](https://baymard.com/blog/deprioritize-view-in-room-augmented-reality)).
- **Options:**
  - **A.** No accounts in the demo: rooms stay on the phone, with share links only.
  - **B.** Sign-in required before scanning.
  - **C.** Guest first: scan and place freely, and sign in (Apple, Google or email) only to save to the cloud, share or open on another device.
- **Recommended:** C — it keeps the first scan friction-free and still delivers the cross-device viewing the brief requires.

#### Q35. How long should home scans be kept, where, and how are they deleted?
- **Priority:** Before build
- **Who decides:** Business, with legal advice
- **Why it matters:** Scan photos can show faces, documents, valuables and address clues, so the AI research recommends separate consent, blurring on the phone, retention limits and deletion support; privacy law in the launch market was not researched and needs legal review. Storage choices also fix where data lives and for how long, and AI providers add their own terms, such as OpenAI keeping abuse-monitoring logs for up to 30 days ([OpenAI data controls](https://developers.openai.com/api/docs/guides/your-data)).
- **Options:**
  - **A.** Keep scans until the user deletes them.
  - **B.** Private by default, one-tap deletion, a fixed retention period for inactive scans, and storage in the launch market's region.
  - **C.** Never store scans in the cloud.
- **Recommended:** B — it supports cross-device viewing while limiting what a breach or complaint could expose.

#### Q36. May YoungVista use customers' scans to improve its own models?
- **Priority:** Can wait
- **Who decides:** Business
- **Why it matters:** Matterport's edge on ordinary phones comes from AI trained on depth scans of about 1.5 million homes ([Geo Week News](https://www.geoweeknews.com/articles/matterport-cortex-gets-quick-3d-from-360-photos-using-ai-and-computer-vision/)), and the big public indoor-scan datasets, such as Matterport's HM3D and Apple's ARKitScenes, are licensed for non-commercial use only ([Matterport academic EULA](https://matterport.com/matterport-end-user-license-agreement-academic-use-model-data); [ARKitScenes licence](https://github.com/apple-aiml-research/ARKitScenes/blob/HEAD/LICENSE)). A startup's only route to similar data is its own customers, and scans collected before consent is asked cannot be used.
- **Options:**
  - **A.** Never.
  - **B.** Opt-in only, asked clearly and separately.
  - **C.** On by default, with an opt-out.
- **Recommended:** B — it builds a data asset over time without surprising customers about something as private as their home.

## Sources

Sources are grouped by topic. Pages marked "search excerpts only" could not be opened directly by the researchers and were read through search-engine excerpts, so treat their figures as less certain.

**Apple Measure, LiDAR and phone accuracy**

- [Apple Support — Measure dimensions with iPhone (iOS 27)](https://support.apple.com/guide/iphone/measure-dimensions-iphd8ac2cfea/ios)
- [Apple Support — Models with a LiDAR Scanner (iOS 27 guide)](https://support.apple.com/guide/iphone/aside/iphc07537a89/27/ios/27)
- [Apple Support — Measure a person's height](https://support.apple.com/guide/iphone/measure-a-persons-height-iph341d4a993/ios)
- [Apple Developer — Understanding world tracking (ARKit)](https://developer.apple.com/documentation/arkit/understanding-world-tracking)
- [Apple Developer — ARDepthData confidence map](https://developer.apple.com/documentation/arkit/ardepthdata/confidencemap)
- [Apple WWDC20 — Explore ARKit 4 (session 10611)](https://developer.apple.com/videos/play/wwdc2020/10611/)
- [Baruch et al. — ARKitScenes (arXiv 2111.08897)](https://arxiv.org/html/2111.08897)
- [Luetzenburg et al. — iPhone and iPad LiDAR evaluation, Scientific Reports 2021](https://pmc.ncbi.nlm.nih.gov/articles/PMC8593014/)
- [ESPE 2024 — LiDAR iPhone height measurement vs stadiometer (conference abstract)](https://abstracts.eurospe.org/hrp/0098/hrp0098p1-310)
- [Sensors 2024 — iPhone 14 Pro and HoloLens 2 indoor mapping accuracy](https://pmc.ncbi.nlm.nih.gov/articles/PMC10893111/)
- [HBRC Journal 2024 — iPad Pro LiDAR vs terrestrial laser scanner](https://doi.org/10.1080/16874048.2024.2408839)
- [Hamdan, Loghmanieh and Bertalan 2026 — free LiDAR apps vs Trimble X7](https://link.springer.com/article/10.1007/s41651-026-00288-x)
- [Apple Machine Learning Research — RoomPlan](https://machinelearning.apple.com/research/roomplan)
- [it-jim — RoomPlan framework review (2025)](https://www.it-jim.com/blog/roomplan-framework-by-apple/)
- [Medium / Inborn Experience — Getting a room plan with ARKit (2017)](https://medium.com/inborn-experience/getting-a-room-plan-with-arkit-the-case-where-size-matters-1e104ee42421)
- [Research Square preprint rs-10991704 — phone AR depth coverage and drift (2026, not peer-reviewed)](https://www.researchsquare.com/article/rs-10991704)
- [Mobile AR Depth Estimation: Challenges and Prospects (arXiv 2310.14437)](https://arxiv.org/html/2310.14437)
- [HAL hal-04358138 — Size-change discrimination thresholds in AR (search excerpts only)](https://dumas.ccsd.cnrs.fr/LISN-ARAI/hal-04358138v1)
- [Baymard Institute — Deprioritize "View in Room" AR features (2024)](https://baymard.com/blog/deprioritize-view-in-room-augmented-reality)
- [MacRumors — Best-selling iPhone model sizes, citing CIRP (November 2024)](https://www.macrumors.com/2024/11/21/best-selling-iphone-model-sizes-revealed/)
- [SamMobile — Samsung could ditch the ToF camera sensor (2020)](https://www.sammobile.com/news/samsung-could-be-ditching-camera-sensor-galaxy-note-20/)
- [Google ARCore — Depth API](https://developers.google.com/ar/develop/depth)
- [Google ARCore — Supported devices](https://developers.google.com/ar/devices)
- [Apple sample code — RoomPlan guided capture](https://developer.apple.com/documentation/roomplan/create-a-3d-model-of-an-interior-room-by-guiding-the-user-through-an-ar-experience)
- [tbxark/Ruler (MIT)](https://github.com/tbxark/Ruler)
- [duzexu/ARuler (GPL-2.0)](https://github.com/duzexu/ARuler)

**Matterport**

- [Matterport 10-K for fiscal 2024 (SEC)](https://www.sec.gov/Archives/edgar/data/1819394/000181939425000007/mttr-20241231.htm)
- [Matterport store — Pro3 Plus Package](https://matterport.com/store/product/pro3-plus-package)
- [Matterport — Camera comparison](https://matterport.com/cameras)
- [AEC Magazine — Matterport Pro3 launch (2022)](https://aecmag.com/reality-capture-modelling/matterport-pro3-camera-places-greater-emphasis-on-aec/)
- [AEC Magazine — Matterport embraces point clouds (October 2026)](https://aecmag.com/reality-capture-modelling/matterport-embraces-point-clouds/)
- [Geo Week News — Matterport Cortex creates 3D from 360° photos (2019)](https://www.geoweeknews.com/articles/matterport-cortex-gets-quick-3d-from-360-photos-using-ai-and-computer-vision/)
- [Matterport Support — Measurement accuracy in Matterport Spaces (search excerpts only)](https://support.matterport.com/s/article/How-accurate-are-dimensions-in-Matterport-Spaces?language=en_US)
- [Matterport Support — MatterPak bundle (search excerpts only)](https://support.matterport.com/s/article/Download-the-MatterPak-Bundle?language=en_US)
- [Matterport blog — Refreshing the way to explore your digital twins (July 2026)](https://matterport.com/blog/refreshing-the-way-to-explore-your-digital-twins)
- [Matterport store — Axis motorised mount (search excerpts only)](https://matterport.com/store/product/cam-axis)
- [Matterport — End-user licence agreement for academic use of model data](https://matterport.com/matterport-end-user-license-agreement-academic-use-model-data)
- [Matterport Showcase SDK — Bundle](https://matterport.github.io/showcase-sdk/sdkbundle_home.html)
- [Matterport research — Automatic defurnishing of indoor panoramas](https://matterport.github.io/automatic-defurnishing-of-indoor-panoramas)
- [SofaBrain — Matterport pricing (third-party)](https://sofabrain.com/learn/matterport-pricing)
- [RISMedia — CoStar completes Matterport acquisition (March 2025)](https://www.rismedia.com/2025/03/03/costar-completes-acquisition-matterport-which-delists-from-nasdaq/)
- [Real Estate News — Zillow pulls Matterport tours (October 2025)](https://www.realestatenews.com/2025/10/20/zillow-pulls-matterport-tours-from-listings-blames-costar)
- [Reality Capture Experts — Matterport accuracy (third-party)](https://realitycaptureexperts.com/matterport-accuracy/)
- [Enginyring — Matterport and handheld LiDAR to CAD and BIM (third-party)](https://www.enginyring.com/en/blog/matterport-and-handheld-lidar-to-cad-bim-turning-consumer-scans-into-dwg-and-ifc)

**Existing apps, toolkits and market**

- [IKEA US help — IKEA Kreativ capture and design](https://www.ikea.com/us/en/customer-service/knowledge/articles/e86d70g6-3673-4306-b373-20f7cg7fd5ed.html)
- [IKEA Ireland help — Kreativ scale and resizing](https://www.ikea.com/ie/en/customer-service/knowledge/articles/28c782c5-0036-4ff1-b1fd-20846237ee09.html)
- [IKEA Australia newsroom — Kreativ launch (2024)](https://www.ikea.com/au/en/newsroom/range-news/ai-powered-design-experience-ikea-kreativ-launches-pubcf6362b0/)
- [IKEA newsroom — IKEA Place launch (2017)](https://ikea.com/global/en/newsroom/innovation/ikea-launches-ikea-place-a-new-app-that-allows-people-to-virtually-place-furniture-in-their-home-170912/)
- [MacMyths — What IKEA Kreativ does in 2026](https://macmyths.com/ikea-place-review-what-ikea-kreativ-does-in-2026/)
- [TechCrunch — IKEA acquires Geomagical Labs](https://techcrunch.com/?p=1969198)
- [Mako — IKEA Kreativ hands-on review (Hebrew; search excerpts only)](https://www.mako.co.il/nexter-news/Article-6838ffcdddb8181027.htm)
- [Engadget — Amazon Room Decorator (2020)](https://www.engadget.com/amazon-ar-shopping-furniture-home-decor-171005257.html)
- [Retail Brew — Wayfair launches Muse (February 2025)](https://www.retailbrew.com/stories/2025/02/14/wayfair-launches-ai-powered-inspiration-tool-to-drive-online-shopping)
- [Polycam press release — 3D scanning without LiDAR (January 2026)](https://www.rooferscoffeeshop.com/post/polycam-brings-pro-grade-3d-scanning-to-800-million-iphone-users-for-free-no-lidar-required)
- [Polycam on the App Store](https://apps.apple.com/app/id1532482376)
- [magicplan help — scanning on Android](https://help.magicplan.app/scan-a-room-with-the-camera-of-your-mobile-device-android)
- [Hover help — interior scans without LiDAR](https://help.hover.to/en/articles/9264961-interior-scans-non-lidar)
- [CubiCasa on the App Store](https://apps.apple.com/us/app/cubicasa/id1439879192)
- [ARMLS — How accurate are CubiCasa floor-plan scans (vendor figure via third party)](https://armls.com/how-accurate-are-cubicasa-floorplan-scans)
- [RoomScan Pro LiDAR on the App Store](https://apps.apple.com/us/app/roomscan-pro-lidar-floor-plans/id1504050801)
- [Niantic Spatial — Scaniverse and platform pricing](https://www.nianticspatial.com/pricing)
- [Niantic Spatial — NSDK meshing documentation](https://nianticspatial.com/docs/nsdk/features/meshing/)
- [Houzz Pro help — LiDAR room scan](https://pro.houzz.com/pro-help/r/how-to-scan-a-room-using-lidar-technology)
- [Planner 5D — Scan your room (iOS)](https://support.planner5d.com/en/articles/5897614-scan-your-room-ios)
- [Twindo — Canvas is now Twindo (2026)](https://www.twindo.com/blog/canvas-is-now-twindo/)
- [Luma AI on the App Store](https://apps.apple.com/in/app/luma-ai/id1615849914)
- [Tom's Hardware — Google kills Tango (2018)](https://www.tomshardware.com/news/google-kills-tango-focuses-arcore,36134.html)
- [Road to VR — 8th Wall open-source plans (2026)](https://roadtovr.com/niantic-webar-platform-8th-wall-open-source/)
- [Apple Developer Forums — "Has RoomPlan been abandoned?" (June 2025)](https://developer.apple.com/forums/thread/787628)
- [RoomSketcher help — wall snapping](https://help.roomsketcher.com/hc/en-us/articles/115001610525)

**RoomPlan, open-source reconstruction and room layout**

- [Apple — RoomPlan documentation](https://developer.apple.com/documentation/roomplan)
- [Apple — RoomPlan surface categories](https://developer.apple.com/documentation/roomplan/capturedroom/surface/category-swift.enum)
- [Apple — RoomPlan object categories](https://developer.apple.com/documentation/roomplan/capturedroom/object/category-swift.enum)
- [Apple — RoomPlan Surface.Curve](https://developer.apple.com/documentation/roomplan/capturedroom/surface/curve-swift.struct)
- [Apple — RoomPlan polygonCorners](https://developer.apple.com/documentation/roomplan/capturedroom/surface/polygoncorners)
- [Apple — RoomPlan StructureBuilder](https://developer.apple.com/documentation/roomplan/structurebuilder/capturedstructure(from:))
- [Apple — RoomPlan CapturedRoom](https://developer.apple.com/documentation/roomplan/capturedroom)
- [Apple — RoomCaptureSession isSupported](https://developer.apple.com/documentation/roomplan/roomcapturesession/issupported)
- [Apple — RoomCaptureSession init(arSession:)](https://developer.apple.com/documentation/roomplan/roomcapturesession/init(arsession:))
- [Apple WWDC22 — Create parametric 3D room scans with RoomPlan (session 10127)](https://developer.apple.com/videos/play/wwdc2022/10127/)
- [Apple WWDC23 — Explore enhancements to RoomPlan (session 10192)](https://developer.apple.com/videos/play/wwdc2023/10192/)
- [Apple — ARMeshClassification](https://developer.apple.com/documentation/arkit/armeshclassification)
- [RTAB-Map](https://github.com/introlab/rtabmap)
- [Unity — Google ARCore XR Plug-in 6.2 manual](https://docs.unity3d.com/Packages/com.unity.xr.arcore@6.2/manual/index.html)
- [COLMAP](https://github.com/colmap/colmap)
- [gsplat](https://github.com/nerfstudio-project/gsplat)
- [Inria 3D Gaussian Splatting licence](https://github.com/graphdeco-inria/gaussian-splatting/blob/HEAD/LICENSE.md)
- [OpenMVS](https://github.com/cdcseacave/openMVS)
- [MapAnything (Meta)](https://github.com/facebookresearch/map-anything)
- [Depth Anything 3 (ByteDance)](https://github.com/ByteDance-Seed/Depth-Anything-3)
- [MoGe (Microsoft)](https://github.com/microsoft/MoGe)
- [VGGT (Meta)](https://github.com/facebookresearch/vggt)
- [MASt3R (Naver)](https://github.com/naver/mast3r)
- [π³ / Pi3 (licence notice in README)](https://github.com/yyfz/Pi3)
- [Apple Depth Pro weights licence on Hugging Face](https://huggingface.co/apple/DepthPro/blob/main/LICENSE)
- [SpatialLM](https://github.com/manycore-research/SpatialLM)
- [SceneScript (Meta)](https://github.com/facebookresearch/scenescript)
- [RoomFormer](https://github.com/ywyue/RoomFormer)
- [Zillow Indoor Dataset (ZInD)](https://github.com/zillow/zind)
- [ARKitScenes licence](https://github.com/apple-aiml-research/ARKitScenes/blob/HEAD/LICENSE)
- [Mirror3D](https://github.com/3dlg-hcvc/mirror3d)

**Product models and file formats**

- [Amazon Berkeley Objects (ABO) dataset page](https://amazon-berkeley-objects.s3.amazonaws.com/index.html)
- [ABO 3D model metadata (3dmodels.csv.gz)](https://amazon-berkeley-objects.s3.amazonaws.com/3dmodels/metadata/3dmodels.csv.gz)
- [Poly Haven licence](https://polyhaven.com/license)
- [Poly Haven API — model assets](https://api.polyhaven.com/assets?t=models)
- [Khronos glTF Sample Assets — model index](https://github.com/KhronosGroup/glTF-Sample-Assets/blob/main/Models/model-index.json)
- [TurboSquid licence explainer](https://blog.turbosquid.com/turbosquid-3d-model-license/)
- [3D-FUTURE licence (Alibaba)](https://terms.aliyun.com/legal-agreement/terms/suit_bu1_ali_cloud/suit_bu1_ali_cloud202004171628_60052.html)
- [Sketchfab Download API guidelines](https://sketchfab.com/developers/download-api/guidelines)
- [Objaverse README](https://huggingface.co/datasets/allenai/objaverse/blob/main/README.md)
- [Creative Commons — CC BY 4.0 legal code](https://creativecommons.org/licenses/by/4.0/legalcode)
- [Google — Scene Viewer](https://developers.google.com/ar/develop/scene-viewer)
- [Apple — RealityKit entity loading formats](https://developer.apple.com/documentation/realitykit/entity/init(contentsof:withname:))
- [Apple — Previewing a model with AR Quick Look](https://developer.apple.com/documentation/arkit/previewing-a-model-with-ar-quick-look)
- [Apple — Creating USD files for Apple devices](https://developer.apple.com/documentation/usd/creating-usd-files-for-apple-devices)
- [Shopify — Product media types](https://help.shopify.com/en/manual/products/product-media/product-media-types)
- [glTF Transform CLI](https://gltf-transform.dev/cli)
- [Khronos — KHR_materials_variants](https://github.com/KhronosGroup/glTF/blob/main/extensions/2.0/Khronos/KHR_materials_variants/README.md)
- [Meshy pricing](https://www.meshy.ai/pricing)
- [Microsoft TRELLIS.2](https://github.com/microsoft/TRELLIS.2)
- [NVIDIA nvdiffrast licence](https://github.com/NVlabs/nvdiffrast/blob/main/LICENSE.txt)
- [Tencent Hunyuan3D 2.1 licence](https://huggingface.co/tencent/Hunyuan3D-2.1/blob/main/LICENSE)

**App framework, web and backend**

- [Expo SDK 58 changelog](https://expo.dev/changelog/sdk-58)
- [Expo SDK 56 changelog](https://expo.dev/changelog/sdk-56)
- [expo-roomplan](https://github.com/fordat/expo-roomplan)
- [ViroReact (ReactVision)](https://github.com/ReactVision/viro)
- [ViroReact on npm](https://www.npmjs.com/package/@reactvision/react-viro)
- [ViroReact issue #568](https://github.com/ReactVision/viro/issues/568)
- [ViroReact issue #499](https://github.com/ReactVision/viro/issues/499)
- [React Three Fiber](https://github.com/pmndrs/react-three-fiber)
- [React Three Fiber installation docs](https://r3f.docs.pmnd.rs/getting-started/installation)
- [react-native-filament](https://github.com/margelo/react-native-filament)
- [Unity as a Library](https://docs.unity.com/en-us/engine/current/manual/platform-specific/cross-platform-features/unityasa-library)
- [Unity pricing updates](https://unity.com/products/pricing-updates)
- [ar_flutter_plugin](https://github.com/CariusLars/ar_flutter_plugin)
- [Google ARCore — Raw Depth](https://developers.google.com/ar/develop/java/depth/raw-depth)
- [Google ARCore SDK releases](https://github.com/google-ar/arcore-android-sdk/releases)
- [Google ARCore — Scene Semantics](https://developers.google.com/ar/develop/scene-semantics)
- [three.js](https://github.com/mrdoob/three.js)
- [Spark (World Labs)](https://github.com/sparkjsdev/spark)
- [Khronos — KHR_gaussian_splatting registry page](https://github.com/KhronosGroup/glTF/blob/HEAD/extensions/2.0/Khronos/KHR_gaussian_splatting/README.md)
- [caniuse — WebXR](https://caniuse.com/webxr)
- [Google — ARCore vs WebXR comparison](https://developers.google.com/ar/develop/webxr/arcore-comparison)
- [model-viewer — AR examples](https://modelviewer.dev/examples/augmentedreality/)
- [Apple — Verifying ARKit device support](https://developer.apple.com/documentation/arkit/verifying-device-support-and-user-permission)
- [AppleInsider — iOS 27 keeps iPhone 11 and newer compatibility](https://appleinsider.com/articles/26/06/08/ios-27-keeps-iphone-11-and-newer-compatibility)
- [Supabase pricing](https://supabase.com/pricing)
- [Cloudflare R2 pricing](https://developers.cloudflare.com/r2/pricing/)
- [Firebase — Cloud Storage plan changes FAQ](https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024)

**AI final picture**

- [OpenAI — Image generation guide](https://developers.openai.com/api/docs/guides/image-generation)
- [OpenAI — API pricing](https://developers.openai.com/api/docs/pricing)
- [OpenAI — Your data (API data controls)](https://developers.openai.com/api/docs/guides/your-data)
- [Google — Gemini image generation docs](https://aistudio.google.com/docs/image-generation)
- [Google — Gemini API pricing](https://aistudio.google.com/docs/pricing)
- [Google — Gemini API terms](https://aistudio.google.com/docs/terms)
- [Black Forest Labs — Commercial use of the API and models](https://help.bfl.ai/articles/4375863104-can-i-use-the-api-for-a-commercial-application)
- [Black Forest Labs — Privacy policy (search excerpts only)](https://bfl.ai/privacy-policy)
- [Qwen-Image-Edit-2511 on Hugging Face](https://huggingface.co/Qwen/Qwen-Image-Edit-2511)
- [InstantX Qwen-Image-ControlNet-Union on Hugging Face](https://huggingface.co/InstantX/Qwen-Image-ControlNet-Union)
- [fal.ai — Qwen-Image-Edit-2511 hosting](https://fal.ai/models/fal-ai/qwen-image-edit-2511)
- [Dwell — Wayfair Muse review (search excerpts only)](https://www.dwell.com/article/wayfair-ai-muse-review-e0a7fbd4)
- [Chain Store Age — Wayfair Decorify (search excerpts only)](https://chainstoreage.com/wayfair-creates-shoppable-home-images-generative-ai)
- [Furniture Today — How IKEA's platform erases existing furniture (search excerpts only)](https://www.furnituretoday.com/furniture-retailer/how-is-ikeas-new-platform-erasing-existing-furniture)
- [Apple — App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [Google Merchant Center — Labelling AI-generated images (search excerpts only)](https://support.google.com/merchants/answer/14572008)
- [Taylor Wessing — EU Digital Omnibus on AI (May 2026; search excerpts only)](https://taylorwessing.com/en/insights-and-events/insights/2026/05/the-eu-digital-omnibus-on-ai-what-the-political-deal-means)
- [Apple — ARSession captureHighResolutionFrame](https://developer.apple.com/tutorials/data/documentation/arkit/arsession/capturehighresolutionframe(completion:).json)
- [Google ARCore — Lighting estimation](https://developers.google.com/ar/develop/lighting-estimation)
