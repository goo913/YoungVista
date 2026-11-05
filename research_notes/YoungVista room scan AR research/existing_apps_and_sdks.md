# Existing room-scan / AR furniture-placement apps, and reusable SDKs and APIs (state as of 2026-11-05)

Source-quality tags used below: **[vendor]** = the company's own claim, not independently verified. **[3P]** = third-party, aggregator or review site, not primary. **[snippet]** = seen only in a search-result excerpt; the page itself was not read. **[YYYY]** = date of the information; anything dated 2017–2022 may be stale. Matterport, Apple Measure/phone accuracy, open-source reconstruction, cross-platform architecture, 3D product models and AI image generation are covered by other researchers. They are only touched on here.

---

## 1. Retail / furniture visualization apps (IKEA, Wayfair, Amazon, Houzz, Target, Lowe's, Home Depot, Williams-Sonoma, Crate & Barrel): capture tech, Android support, scale handling, discontinuations

### Takeaway
IKEA Kreativ is the only big-retailer product found that turns the customer's own room into a reusable scene that both the phone and the web can open. LiDAR iPhones/iPads get a "Full Room Scan" 3D digital twin. Every other device, Android included, gets a photo-based wide-angle/panorama capture. Products are auto-scaled (IKEA claims about 97% accuracy), existing furniture can be erased, and design continues on the web. Capture itself is app-only. Every other retailer tool found is either (a) live-camera AR that drops one or several products onto a detected floor, with no room model, or (b) since 2023, generative-AI room imagery (Wayfair Decorify → Muse). Several retailer AR tools died with their platform (Google Tango, 2018) or were replaced. For most 2017–2020 retailer tools, no 2025–2026 status could be verified.

### Cited Findings

#### IKEA Kreativ (inside the IKEA app + ikea.com) — ACTIVE
- Launched June 2022 in the US (designboom, 2022-06-23) — [designboom](https://www.designboom.com/technology/ikea-ai-app-replaces-room-designs-and-furniture-06-23-2022/). At launch the scanner worked only on select iOS devices, incl. iPhone 12 Pro/13 Pro [2022] — [MoguraVR](https://www.moguravr.com/?p=184616). Android was "still on the way" at launch [2022] — [VRScout](https://vrscout.com/news/you-can-now-delete-your-furniture-using-ikeas-ar-app).
- The technology comes from IKEA's (Ingka Group's) acquisition of Mountain View AI imaging startup Geomagical Labs, per [TechCrunch](https://techcrunch.com/?p=1969198). IKEA credits Geomagical for Kreativ — [IKEA AU newsroom](https://www.ikea.com/au/en/newsroom/range-news/ai-powered-design-experience-ikea-kreativ-launches-pubcf6362b0/). Geomagical's first product turned smartphone room scans into panoramic 3D images with the furniture removed — [PYMNTS](https://www.pymnts.com/cpi-posts/ikea-acquires-ai-imaging-startup/).
- **Current capture modes (IKEA US help):**
  - LiDAR devices choose between "Photographic Wide-Angle Scan" (take a photo, then remove items) and "Full Room Scan" (builds a "digital twin" that starts empty).
  - Non-LiDAR devices get the Photographic Wide-Angle Scan automatically.
  - The app itself picks the capture method ("5 Point Panoramic", "Ultrawide" or "1-Scan LiDAR") and guides the user.
  - Kitchens and bathrooms can be scanned, but IKEA recommends its dedicated planners for them.
  - Source: [IKEA US help](https://www.ikea.com/us/en/customer-service/knowledge/articles/e86d70g6-3673-4306-b373-20f7cg7fd5ed.html).
- "Whole room scanning is only available in the IKEA app on LiDAR-enabled devices" (examples: iPhone Pro, iPad Pro). Flow: profile → "IKEA Kreativ Spaces" → camera icon → room category → "Full room scan" → on-screen prompts → processing, with an email when the room is ready — [IKEA IE help](https://www.ikea.com/ie/en/customer-service/knowledge/articles/b2399d09-872g-4c18-852d-d24371e735b2.html).
- **Web vs app:**
  - Rooms can be scanned only in the mobile app. Design, decorating, saving and sharing work in both.
  - "Erase" works on both. In the app: sidebar → Erase → "Hide All/Show All" or tap items outlined in yellow. On the web: an "Erase Items" toggle.
  - "Remix" (handing a design to another person to edit) is web-only.
  - Source: [IKEA US help](https://www.ikea.com/us/en/customer-service/knowledge/articles/e86d70g6-3673-4306-b373-20f7cg7fd5ed.html).
- **Scale handling:**
  - Users cannot resize products: "No resizing needed!… IKEA Kreativ accurately scales every product to match your space."
  - Scans and photo uploads give "approximately 97% accuracy when best practices are followed" [vendor].
  - In build-your-room, dimensions are entered by hand, and "Editing room dimensions after the room is created is coming soon!"
  - Source: [IKEA IE help: resizing](https://www.ikea.com/ie/en/customer-service/knowledge/articles/28c782c5-0036-4ff1-b1fd-20846237ee09.html).
- **Australian launch, 21 Feb 2024:**
  - The user takes multiple photos with the "Scene Scanner", and the software combines them into a "wide-angle, interactive replica" using vision-based AI that IKEA says is patented.
  - Users can clear all or part of the existing furniture, then add IKEA products.
  - Over 50 ready-made 3D showrooms. Designs can be saved, shared and added to the cart. Free in the app or on the web.
  - Source: [IKEA AU newsroom](https://www.ikea.com/au/en/newsroom/range-news/ai-powered-design-experience-ikea-kreativ-launches-pubcf6362b0/).
- **Device requirements** — [MacMyths, 2026-09-28](https://macmyths.com/ikea-place-review-what-ikea-kreativ-does-in-2026/) [3P]. It cites IKEA pages; IKEA's own device page returned 403 to me.
  - iOS 16+ for the app per the App Store, with iOS 14 given as the Kreativ baseline.
  - LiDAR full-room scan on iPhone 12/13/14 Pro and Pro Max, iPad Pro 11" (3rd gen+) and 12.9" (5th gen+). This list may lag newer Pro iPhones.
  - Android: 9.0+, an ARCore-supported device and Google Play Services for AR. "Android app access does not mean it has the LiDAR-based full-room scan."
  - Room Builder (manual dimensions) is web-only.
  - Kreativ is "not a measurement tool". Textiles and ceiling-mounted items aren't supported. The same review found no live AR view described for Kreativ.
- **Hands-on reports:**
  - TechCrunch, early beta: the scan took about 2 minutes, plus about 5 more minutes preparing the image for upload [2022] — [TechCrunch](https://techcrunch.com/?p=2340297) [snippet].
  - A Hebrew-language review found the opening capture fiddly (several panorama shots, then a figure-eight wave). Capture was iPhone-only at the time, and the reviewer missed IKEA Place's walk-around live AR — [Mako](https://www.mako.co.il/nexter-news/Article-6838ffcdddb8181027.htm) [snippet; undated].
- At launch, the web/non-LiDAR route was uploading several photos of a room [2022] — [Engadget](https://www.engadget.com/ikea-ar-app-lets-you-preview-its-furniture-in-your-own-house-130004284.html).

#### IKEA Place (standalone AR app) — LEGACY; current standalone status unverified
- Launched 12 Sep 2017 on ARKit/iOS 11. Products are "automatically scaled, based on room dimensions, with 98% accuracy" [vendor, 2017] — [IKEA newsroom](https://ikea.com/global/en/newsroom/innovation/ikea-launches-ikea-place-a-new-app-that-allows-people-to-virtually-place-furniture-in-their-home-170912/).
- Android arrived in March 2018 [2018] — [FashionNetwork](https://ie.fashionnetwork.com/news/Ikea-launches-Place-app-on-Android-adds-visual-search-tool,959478.html).
- A Sept 2019 update allowed several items on screen at once [2019] — [Gear Patrol](https://www.gearpatrol.com/2019/09/23/ikea-place-augmented-reality-app-update/).
- Rebuilt as "IKEA Studio" with SPACE10. It was iPhone-only, with no in-app shopping [2021] — [Yanko Design](https://www.yankodesign.com/2021/04/16/ikea-apple-redesigned-their-ar-app-improving-user-experience-and-playing-with-your-interior-styling/amp/).
- In 2026, "Place" is described as "the older name". IKEA US now steers users to Kreativ in the main app and on the web, and the reviewer advises against old standalone downloads [3P, 2026] — [MacMyths](https://macmyths.com/ikea-place-review-what-ikea-kreativ-does-in-2026/).

#### Wayfair — AR (legacy?) plus generative-AI ideation (active)
- WayfairView was a Google Tango app for the Lenovo Phab 2 Pro, shown alongside Lowe's Vision [2016–17] — [TechHive](https://www.techhive.com/article/582380/how-wayfair-and-lowes-will-tap-lenovos-tango-phone-to-spruce-up-your-space.html). Google shut Tango down in spring 2018 to focus on ARCore. Tango's special depth cameras and vision chips were seen as too demanding for ordinary phones — [Tom's Hardware](https://www.tomshardware.com/news/google-kills-tango-focuses-arcore,36134.html). Lowe's dates the end of Tango to March 2018 — [Lowe's Innovation Labs](https://lowesinnovationlabs.com/projects/lowe-s-vision-navigation).
- View in Room 3D reached Android via ARCore after an ARKit iOS launch [2018] — [TechCrunch](https://techcrunch.com/?p=1609428).
- Decorify (2023 pilot): upload a photo of your room and get AI-restyled versions with shoppable Wayfair products — [Wayfair](https://www.aboutwayfair.com/category/company-news/wayfair-launches-decorify-a-virtual-room-styler-powered-by-generative-ai), [Retail Dive](https://www.retaildive.com/news/wayfair-decorify-home-design-product-visualization-tool/689001/).
- **Muse (Feb 2025) replaced Decorify:**
  - A text prompt produces AI room images in a Pinterest-like feed with "more like this".
  - Products in each scene can be bought or saved. Saved looks can later be applied to a photo of the user's own room. Unlike Decorify, browsing needs no photo.
  - Piloted with Google Cloud.
  - Sources: [Retail Brew, 2025-02-14](https://www.retailbrew.com/stories/2025/02/14/wayfair-launches-ai-powered-inspiration-tool-to-drive-online-shopping), [Furniture Today](https://www.furnituretoday.com/e-commerce/wayfair-retools-its-consumer-ideation-experience-replacing-decorify-with-muse), [Google Cloud](https://cloud.google.com/customers/wayfair-ai).
- A third-party summary of Wayfair's FY2025 10-K (Feb 2026) says Wayfair keeps investing in its mobile AR tool. Nothing Android-specific [3P] — [Autobound](https://www.autobound.ai/companies/wayfair/10-k/wayfair-launches-view-in-room-3d-augmented-reality-tool-d3970bf8).

#### Amazon — AR View → Room Decorator; current status UNVERIFIED
- AR View launched on iOS with ARKit in 2017, one item at a time. Android followed in 2018 [2018] — [9to5Google](https://9to5google.com/2018/02/26/amazon-ar-view-tool-shopping-android/).
- **Room Decorator (Aug 2020):**
  - Places multiple products in one AR view at true scale, reached through a "View in Your Room" button on eligible listings.
  - Rooms can be saved and revisited later, including remotely or on desktop from stored photos.
  - Rolled out to roughly half of US iOS users first, with Android later.
  - Sources: [Engadget](https://www.engadget.com/amazon-ar-shopping-furniture-home-decor-171005257.html), [Furniture Today](https://www.furnituretoday.com/technology/amazon-launches-new-ar-room-decorator-function).
  - Sources conflict on platforms: Digital Trends called it iOS-only — [Digital Trends](https://www.digitaltrends.com/phones/amazons-new-ar-tool-makes-furniture-shopping-easier/).

#### Houzz — consumer AR (active) and pro LiDAR scanning (Houzz Pro, active)
- View in My Room 3D reached iPhone/iPad in May 2017 with 300,000+ products [2017] — [HFN](https://www.hfndigital.com/industry-news/houzzs-view-my-room-feature-now-available-3-d). Android support came via ARCore, with more than 1 million placeable products [undated] — [Houzz blog](https://blog.houzz.com/houzz-upgrades-augmented-reality-app-capabilities).
- **Houzz Pro "3D Room Scan" (B2B):**
  - Uses Apple RoomPlan with LiDAR. Requires iPhone 12 Pro+ or iPad Pro 4th gen+, on iOS 16+.
  - Capture: sweep the device up and down, standing well back from the walls, at a consistent speed.
  - Output: a 2D or 3D floor plan with a furniture on/off toggle, kitchen cabinets auto-classified as base/wall/tall, and photos pinned to their location. There is an AR view icon, and "Create Estimate with AI" builds an estimate from the scan.
  - Detailed editing is desktop-only. Cabinets in a row may look stretched.
  - Source: [Houzz Pro help](https://pro.houzz.com/pro-help/r/how-to-scan-a-room-using-lidar-technology).
- Date caveat: an iClarified article on Houzz AR floor tiling shows a "December 9, 2025" date stamp. Its article ID (70484) is far below iClarified's June 2022 RoomPlan article (ID 86296), so it is probably years older — [iClarified tiling](https://www.iclarified.com/70484/houzz-app-gets-new-ar-feature-that-lets-you-virtually-tile-your-floor), [iClarified RoomPlan](https://www.iclarified.com/86296/apple-introduces-roomplan-swift-api-to-help-create-3d-floor-plans).

#### Target — status UNVERIFIED
- "See It In Your Space" launched Oct 2017 on Target's mobile website, with no app needed. The user photographs the room and repositions a to-scale 3D product. The launch skipped ARKit, so the room was a still photo, not live AR. 200 Project 62 items qualified at launch [2017] — [TechCrunch](https://techcrunch.com/2017/10/24/target-adds-ar-shopping-to-its-mobile-website), [Retail Dive](https://www.retaildive.com/news/target-unveils-ar-mobile-feature-for-furniture-shopping/508122).

#### Lowe's — mixed
- "Lowe's Vision" ran on Tango and ended with it in March 2018 — [TechHive](https://www.techhive.com/article/582380/how-wayfair-and-lowes-will-tap-lenovos-tango-phone-to-spruce-up-your-space.html), [Lowe's Innovation Labs](https://lowesinnovationlabs.com/projects/lowe-s-vision-navigation).
- "View in Your Space" AR in the Lowe's app worked on ARCore Android phones. In July 2018 it added Craftsman and roughly 500 more items [2018] — [Lowe's newsroom](https://corporate.lowes.com/newsroom/stories/inside-lowes/try-you-buy-new-products-added-augmented-reality-feature-lowes-app), [Chain Store Age](https://chainstoreage.com/technology/lowes-launches-mobile-ar-tool-introduce-spring-collection-android-users).
- "Style Studio" is an Apple Vision Pro-only kitchen design app (Feb 2024). An in-store pilot ran in June 2024, with expansion planned for 2025 — [Chain Store Age](https://chainstoreage.com/lowes-launching-virtual-kitchen-design-apple-vision-pro-devices), [CX Dive](https://www.customerexperiencedive.com/news/lowes-style-studio-kitchen-visualization-in-store-tech-pilot-expands/746801/).

#### Home Depot — AR exists; details UNVERIFIED
- The app offers 3D AR previews of products in your rooms; the example shows appliances next to existing cabinets. The page mentions iPhone users [undated] — [Home Depot](https://www.homedepot.com/c/ai/complete-your-home-remodel/9ba683603be9fa5395fab901c1126fa4).
- Home Depot's newsroom says the AR tool can gauge the dimensions of some products, such as refrigerators. It also mentions a separate Roomvo-powered Flooring Visualizer — [Home Depot newsroom](https://corporate.homedepot.com/newsroom/5-technologies-changing-how-we-shop).

#### Williams-Sonoma (Pottery Barn, West Elm) and Crate & Barrel — status UNVERIFIED (2017–2018 data)
- Pottery Barn 3D Room View (iOS AR app, 2017): place full-scale furniture, rearrange it and email the layout [2017] — [Williams-Sonoma IR](https://ir.williams-sonomainc.com/investor-information/news-releases/news-release-details/2017/Williams-Sonoma-Inc-Introduces-New-Augmented-Reality-iOS-App-for-Pottery-Barn/default.aspx). A 2017 headline says users could "Wipe Your Room Clean" (an early form of furniture erasing) [headline only] — [Reality News](https://mobile-ar.reality.news/news/apple-ar-wipe-your-room-clean-fill-with-new-furniture-pottery-barns-new-ar-app-0181442).
- Williams-Sonoma bought Outward (3D imaging, 2017). The Design Crew Room Planner, an online tool built on Outward's platform, launched Oct 2018 for Pottery Barn, West Elm and Williams Sonoma Home [2018] — [Home Textiles Today](https://www.hometextilestoday.com/industry-news/williams-sonoma-debuts-design-crew-room-planner), [Business Wire](https://www.businesswire.com/news/home/20181003005343/en/).
- Crate & Barrel launched the Crate Design Studio 3D Room service in May 2018, online and in stores [2018] — [Furniture Today](https://www.furnituretoday.com/business-news/3d-room-planning-trend-gains-momentum-crate-and-barrel-servcie).

#### Discontinued / pivoted (with reasons where known)
- **Tango-based apps** (WayfairView, Lowe's Vision) ended when Google killed Tango (special depth hardware) in favour of ARCore in 2018 — [Tom's Hardware](https://www.tomshardware.com/news/google-kills-tango-focuses-arcore,36134.html), [Gizmodo](https://gizmodo.com/google-tango-is-dead-long-live-arcore-1821340902).
- **Wayfair Decorify** was replaced by Muse in Feb 2025 — [Furniture Today](https://www.furnituretoday.com/e-commerce/wayfair-retools-its-consumer-ideation-experience-replacing-decorify-with-muse).
- **IKEA Place** → IKEA Studio (2021) → Kreativ in the main IKEA app (see above).
- **Modsy** (online 3D e-design from customer room photos) shut its consumer design business in late June 2022 and laid off most staff. Some reports link the closure to collapsed acquisition talks — [Fortune](https://fortune.com/2022/06/29/modsy-an-interior-design-startup-founded-by-a-google-ventures-partner-is-shutting-down-its-design-business-and-splitting-ties-with-designers/), [Furniture Today](https://www.furnituretoday.com/financial/modsy-shutters-its-business). Its IP and staff reportedly went to homebuilder Lennar in Aug 2023 [3P, single source] — [sp-edge](https://sp-edge.com/companies/360871).

### Inferences
- Live AR "place one or several products on the floor" has been a commodity retail feature since 2017–2020 (ARKit/ARCore). Capturing the customer's room as a reusable model at consumer scale has been shipped by one big retailer (IKEA), and IKEA got there by acquiring a computer-vision company. That points to real technical difficulty and cost.
- IKEA's design choices are a ready-made consumer template for YoungVista:
  - The app picks the capture mode by device capability, so the user isn't asked about LiDAR.
  - Users can't resize products, and true scale is the default.
  - The LiDAR digital twin starts empty, and existing furniture can be erased.
  - Processing happens asynchronously, with an email when the room is ready.
  - The web is used for design and sharing, not capture.
- IKEA's non-LiDAR mode is described as a "wide-angle, interactive replica" built from photos taken from one spot. It is most likely a single-viewpoint 2.5D scene rather than a room you can orbit freely (my inference from the wording, not documented). If so, it would not satisfy YoungVista's orbit/zoom 3D view requirement on non-LiDAR phones.
- Since 2023, retail tooling has drifted from geometric accuracy (AR/3D) toward generative imagery (Decorify, Muse). For YoungVista the geometric "will it fit" promise may be a differentiator, but it is harder to deliver.
- Retail AR built on one vendor's platform can die with that platform (Tango). That argues for keeping YoungVista's room and product data in open formats.

### Gaps
- No 2025–2026 primary evidence found on the current state of Amazon Room Decorator, Target See It In Your Space, Home Depot AR, Williams-Sonoma/Pottery Barn AR or Crate & Barrel 3D Room, or on whether Wayfair's View in Room 3D still runs on Android.
- IKEA's official device-support page returned 403, so the Kreativ device list comes from a secondary review (MacMyths, Sept 2026).
- No official date found for removal of the standalone IKEA Place app.
- Not verified whether the IKEA app still has a live-camera AR placement feature separate from Kreativ.
- No usage or conversion data found for any retailer visualization tool.

---

## 2. Room-scanning and floor-plan apps (RoomPlan-based apps, Polycam, Canvas/Twindo, magicplan, Scaniverse, Luma, KIRI, 3D Scanner App, SiteScape, Matterport, Zillow 3D Home, CubiCasa, RoomScan Pro, Hover, Pix4Dcatch, Shapr3D, Planner 5D, Homestyler, Roomle)

### Takeaway
Floor-plan and room-scan apps are overwhelmingly professional tools. The best structured room models (walls, doors, windows, furniture boxes) come from LiDAR iPhones and iPads, usually through Apple RoomPlan: Houzz Pro, Planner 5D, RoomScan, magicplan Auto-Scan and Polycam Room/Space are examples. For non-LiDAR phones and Android, the options are cloud-processed walk-throughs (CubiCasa, Hover; hours of turnaround), manual/corner methods (magicplan, RoomScan Touch) or unstructured photogrammetry/splats (Scaniverse, KIRI, Polycam Photo). Non-LiDAR structured capture only reached a big consumer app in Jan 2026 (Polycam, iPhone 13+), and its non-LiDAR floor plans and Android version were still "coming in 2026". Several players pivoted or wound down: Canvas → Twindo (pro-only), Luma (3D capture sidelined), magicplan (no Android scanning).

### Cited Findings

#### Apple RoomPlan (framework used by many apps)
- RoomPlan needs a LiDAR iPhone or iPad Pro ("all LiDAR-enabled iPhone and iPad Pro models").
- **What it captures:**
  - Walls, doors, windows and openings as 2D surfaces (which can be curved).
  - Furniture and fixtures as 3D boxes (sofa, table, chair, bed, cabinets, fireplace and more).
  - Each element carries dimensions, a three-level confidence value, a transform and an ID.
- Exports USD/USDZ. The result type, `CapturedRoom`, is Codable, so it can be saved as data.
- The built-in `RoomCaptureView` gives live animated outlines, a live 3D preview and text coaching. Custom UIs get instructions on distance, speed, lighting and texture.
- The processed model is ready "within just a few seconds".
- Source: [Apple WWDC22 session 10127](https://developer.apple.com/videos/play/wwdc2022/10127/).
- **iOS 17 enhancements:**
  - Multi-room capture (continuous ARSession, or ARWorldMap relocalization), merged with `StructureBuilder`.
  - Custom ARSession support.
  - Sloped/curved walls, floors as polygons, and "sections" (room types).
  - New categories: dishwasher, oven, sink, and sofa/chair variants.
  - `ModelProvider` swaps detected boxes for real 3D models at USDZ export, and a metadata file maps USDZ nodes to element IDs.
  - VoiceOver scan guidance.
  - MultiRoom "works best for single-floor residential houses", up to about 2,000 sq ft.
  - Source: [Apple WWDC23 session 10192](https://developer.apple.com/videos/play/wwdc2023/10192/).
- **Maintenance signal:**
  - June 2025 developer forum thread: "WWDC no mention of RoomPlan. Abandoned?" The poster says the last update was iOS 17 (2023). Apple DTS replied only by pointing to a WWDC25 lab — [Apple Developer Forums](https://developer.apple.com/forums/thread/787628).
  - A later thread reports green/purple colour artifacts in RoomPlan captures run from Xcode on iOS 26 [snippet] — [Apple Developer Forums](https://developer.apple.com/forums/thread/801252).
  - No WWDC26 RoomPlan changes were found.

#### Polycam — ACTIVE (iOS, Android, web)
- **January 2026 non-LiDAR launch (21 Jan 2026):**
  - 3D capture now works without LiDAR on iPhone 13+ and on iPad mini 6, iPad 10 and iPad Air 5 and later.
  - Depth is estimated from ordinary walk-through video with computer vision and ML, with on-device AI guidance during capture (no internet needed). Processing is either on-device ("quick… usable in any location") or in the cloud ("highest level of detail").
  - Free: capture, measurement, comments and share links. Paid: professional exports and virtual walkthroughs.
  - Roadmap: "Floorplan generation and Android support without LiDAR are coming in 2026."
  - Accuracy is described as enough for "indoor design visualization and space layouts" [vendor].
  - Polycam cites CIRP data that most iPhone sales are non-Pro models, and says it is the only app offering 3D scanning on iOS, Android and the web [vendor].
  - Stats: 34M+ captures and 2B+ sq ft [vendor].
  - Source: [Polycam press release (via RoofersCoffeeShop)](https://www.rooferscoffeeshop.com/post/polycam-brings-pro-grade-3d-scanning-to-800-million-iphone-users-for-free-no-lidar-required).
- Non-LiDAR floor plans are NOT confirmed shipped. Polycam's help center ties floor-plan generation to LiDAR, and Polycam blog posts from Mar–May 2026 describe floor plans from LiDAR scanning on Pro iPhones/iPads [snippet] — [Polycam help: floor plans](https://learn.poly.cam/hc/en-us/articles/30299187161620-How-to-Create-Floorplan-Captures), [Polycam blog](https://poly.cam/blog/how-we-turn-raw-spatial-data-into-a-floor-plan-you-can-build-from-inside-polycams-floor-plan-pipeline), [Polycam blog](https://poly.cam/blog/the-best-floor-plan-app-for-iphone-a-professionals-guide).
- Space Mode on LiDAR devices yields a 3D mesh plus 3D and measured 2D floor plans in one pass [snippet] — [Polycam help: Space Mode](https://learn.poly.cam/hc/en-us/articles/36655587097620-How-to-Use-Space-Mode).
- **Android:** earlier, only Photo Mode (photogrammetry) was available on Android because those phones lack LiDAR [older] — [3DWithUs](https://3dwithus.com/polycam-introduces-room-mode-and-teams). A March 2026 review calls Android support "still limited and rougher" than iOS. That review is published by SkyeBrowse, a competitor [3P] — [SkyeBrowse](https://skyebrowse-website-d07212f74681.herokuapp.com/news/posts/polycam-review).
- **App Store listing:**
  - Rating 4.6 from about 44K ratings. Requires iOS 18.
  - Exports: OBJ, DAE, FBX, STL, DXF, PLY and ESX. 2D/3D floor plans can be taken into AutoCAD, SketchUp and Revit.
  - "Polycam Web" for viewing, editing and exporting is included. Sharing is by link; 360° tours are an output.
  - In-app prices: Pro $26.99/month or $199.99/year; Basic $149.99/year, and $29.99 with no stated period.
  - Visible reviews complain about price increases; tier-gating (dimensions and floor-plan details need higher tiers; saving measurements is Business-only); the view turning blue and data being lost in long sessions; and a Sept 2025 billing dispute over a roughly $400 Business tier.
  - Source: [App Store](https://apps.apple.com/app/id1532482376).
- Third-party pricing differs: Pro $12/month and Business $36/user/month (Mar 2026) — [GetApp](https://www.getapp.com/all-software/a/polycam/). The free tier allows unlimited LiDAR/Room captures with watermarked outputs [3P] — [TrustRadius](https://www.trustradius.com/products/polycam/details).

#### Canvas (Occipital) → renamed "Twindo" on 5 Feb 2026 — ACTIVE, PRO-ONLY
- The rename repositions Canvas as a "spatial intelligence" platform for architects, interior designers, contractors, multifamily, retail chains, hospitality and fire safety. It offers Scan to CAD, Plan to CAD (beta), Point Cloud to BIM (beta) and a web viewer, with CAD targets Revit, SketchUp, AutoCAD, Archicad, Chief Architect and Vectorworks. No consumer segment is listed — [Twindo blog](https://www.twindo.com/blog/canvas-is-now-twindo/).
- **App Store listing "Twindo: LiDAR Scan to CAD/BIM":**
  - Requires iOS/iPadOS 16.4+. LiDAR is required to scan; non-LiDAR devices can only view, add files and order.
  - Scans halt if the device overheats.
  - Pricing: 2D drawings from $0.18/sq ft; measurement reports and 3D models from $0.26/sq ft; an "Essentials" membership is $29.
  - Rating 4.8 from about 1.1K ratings.
  - Source: [App Store](https://apps.apple.com/us/app/id1169235377).

#### magicplan — ACTIVE (pro); NO scanning on Android
- **iOS modes:**
  - Auto-Scan (LiDAR only): multiple rooms plus furniture and structural elements in one session.
  - Manual-Scan Wall Mode (LiDAR only).
  - Manual-Scan Corner Mode: camera-based detection of room corners, available on non-LiDAR iPhones such as iPhone 11 and earlier.
  - magicplan recommends Manual-Scan for open-plan spaces, glass walls, construction sites and heavy clutter.
  - Source: [magicplan help](https://help.magicplan.app/why-do-i-not-have-the-sensor-capture-option-anymore).
- **Android:** "At this time, Android devices are not supported for magicplan's scan features", blamed on the "absence of LiDAR technology". Android users get "square room", "defining corners" and "import and draw" instead — [magicplan help (Android)](https://help.magicplan.app/scan-a-room-with-the-camera-of-your-mobile-device-android).

#### Scaniverse (Niantic Spatial) — ACTIVE (iOS + Android)
- The classic app is free. Mesh exports: OBJ, FBX, GLB, USDZ and LAS. Gaussian splat exports: PLY and SPZ — [App Store](https://apps.apple.com/us/app/scaniverse-lidar-3d-scanner/id1541433223) [snippet]. It runs on Android and iOS — [Radiance Fields](https://radiancefields.com/getting-started-with-gaussian-splatting-tools-for-beginners).
- "New Scaniverse" adds cloud splat and mesh processing ("higher quality than on-device"), multi-user "Shared Sites" and VPS. It launched on iOS in April 2026, and Android now has the same cloud capabilities (article dated May 2026). It uses a separate account from classic Scaniverse — [Radiance Fields](https://radiancefields.com/scaniverse-cloud-comes-to-android).
- **Plans:**
  - Free $0: 20,000 credits/month (about 10 minutes of mobile capture), 5 seats, metric scale, and exports of splats, meshes and VPS maps (FBX, SPZ, PLY). No commercial rights.
  - Plus $20/month. Pro $50/month. Commercial rights, including resale, require Pro or Enterprise.
  - Classic Scaniverse keeps "unlimited on-device splat generation".
  - Source: [Niantic Spatial pricing](https://www.nianticspatial.com/pricing).
- The SPZ splat format is MIT-licensed, so it can be used commercially — [Scaniverse](https://scaniverse.com/news/spz-gaussian-splat-open-source-file-format).

#### Luma AI — 3D capture effectively WOUND DOWN (company focus moved to video generation)
- "Luma 3D Capture" is still listed (iPhone 11+ for capture, iOS 16+), version 1.3.14 from Jan 2026. Release notes: "Sunset Genie since January 1, 2026" (Genie was its text-to-3D generator) — [App Store](https://apps.apple.com/in/app/luma-ai/id1615849914).
- Flythroughs was set to sunset on 1 Jan 2026 — [Radiance Fields](https://radiancefields.com/luma-ai-to-sunset-flythroughs-on-january-1-2026). Capture processing waits reportedly grew from about 15 minutes to a week as the Dream Machine video product took off, and capture appeared switched off on mobile and desktop [3P; date unclear] — [Radiance Fields](https://radiancefields.com/radiance-field-uploads-suspended-on-luma-ai).

#### KIRI Engine — ACTIVE (iOS + Android)
- KIRI has photo scanning, featureless-object scanning and 3D Gaussian Splatting. It has a free Basic tier, and Pro costs $17.99/month — [KIRI pricing](https://www.kiriengine.app/pricing).
- v3.14 overhauled the LiDAR Scene Scan with a depth foundation model prompted by LiDAR. It needs LiDAR hardware and Pro — [Radiance Fields](https://radiancefields.com/kiri-engine-releases-v3-14).

#### 3D Scanner App (Laan Labs) — ACTIVE (iOS only)
- Uses the LiDAR or TrueDepth sensors. Free with in-app purchases.
- Exports: USDZ, OBJ, glTF/GLB, DAE, STL, PLY, LAS, PCD, XYZ and DXF floor plans, plus FBX per Laan Labs.
- Sources: [App Store](https://apps.apple.com/us/app/-/id1419913995) [snippet], [Laan Labs case study](https://laanlabs.netlify.app/casestudies/professional-workflow-case-study), [CG Channel 2020](https://www.cgchannel.com/2020/10/check-out-laan-labss-free-ipad-3d-scanner-app/).

#### SiteScape (FARO) — ACTIVE, PRO (AEC)
- iOS app (iOS 17.6+), free with in-app purchases [snippet] — [App Store](https://apps.apple.com/app/id1524700432).
- FARO acquired SiteScape to fold it into the FARO Sphere cloud — [engineering.com](https://www.engineering.com/?p=46460). The vendor claims about ±1 inch accuracy [vendor via 3P].

#### Matterport Capture (covered in depth by another researcher)
- CoStar closed its roughly $1.6B acquisition of Matterport on 28 Feb 2025 [3P] — [VectorShift](https://vectorshift.ai/research/deals/costar-matterport-2025).
- The Capture app is on Android (updated Jan 2026) and iOS [3P] — [AppWisp](https://appwisp.com/app/android/com.matterport.android.capture).

#### Zillow 3D Home — ACTIVE (real-estate agents)
- Free app producing a virtual tour and an interactive floor plan. Per Zillow's page, a phone alone can make the tour, but the floor plan needs a 360° camera [snippet; page returned 403 to me] — [Zillow](https://www.zillow.com/z/3d-home), [App Store](https://apps.apple.com/us/app/zillow-3d-home/id1265223425).

#### CubiCasa — ACTIVE (real estate); any phone, cloud processing
- **App Store listing:**
  - About 5-minute scans with "no sketching, measuring on-site, or tapping on corners".
  - Requires iOS 18.6+. Release notes say "Mesh is back for iOS 26 users with LiDAR", so LiDAR is optional and enriches the scan.
  - LITE 2D plans are free and unlimited up to 5,000 sq ft. Paid tiers: PLUS (themes, fixed furniture, area breakdown, SVG/PDF) and PLUS 3D (3D plans and CAD).
  - A 2022 developer reply quoted $15 per fixed-furniture plan.
  - Rating 4.0 from 207 ratings. A 2022 review complained of a missing kitchen island, a phantom door and a missing wall.
  - Source: [App Store](https://apps.apple.com/us/app/cubicasa/id1439879192).
- GetApp lists Android support [3P] — [GetApp](https://www.getapp.com/industries-software/a/cubicasa/).
- **MLS and partner guidance [3P]:**
  - Walk-through of about 5–10 minutes, in a single pass over all floors starting from the lowest level — [REcolorado](https://recolorado.com/?p=24461).
  - Standard turnaround up to 24 hours; a 6-hour rush is sold separately — [Miami Realtors](https://www.miamirealtors.com/services/products-and-services/cubicasa/).
  - Average accuracy of 95–97% (the company's own figure) — [ARMLS](https://armls.com/how-accurate-are-cubicasa-floorplan-scans), and 97–99% with LiDAR iPhones — [ABoR](https://abor.com/cubicasa).

#### RoomScan Pro LiDAR (Locometric) — ACTIVE (iOS only)
- **App Store listing:**
  - Modes: Apple RoomPlan; "Brick Mode", a proprietary LiDAR method that also auto-detects doors, windows and furniture since v10; "Touch Mode", built for dim light and working on any hardware; and manual drawing.
  - Multi-room RoomPlan scanning arrived with iOS 17 (v9.0). The developer recommends its own LiDAR mode over RoomPlan for multi-room work.
  - Exports: PDF, PNG, DXF, IFC, FML, Xactimate ESX, Sweet Home 3D, OBJ, PLY, XYZ and more.
  - Subscription: $9.99 (monthly) or $119.99/year. Cites US patents 8,868,375 and 11,269,060.
  - Rating 4.3 from about 2.1K ratings.
  - Visible reviews (2021–2023) report crashes that lose work, missed alcoves, doors and openings, and rooms joined in distorted positions.
  - Source: [App Store](https://apps.apple.com/us/app/roomscan-pro-lidar-floor-plans/id1504050801).

#### Hover — ACTIVE (contractors/insurance)
- **"Universal" interior scan:**
  - Works on "any Apple or Android device", with or without LiDAR. Scanning takes "about 15 minutes".
  - Capture: record every part of the room as a "photo trail", with the phone raised, floor and ceiling in frame, circling back to the start. Walk around furniture rather than moving it. Rooms must link to each other, and hallways get separate scans.
  - Results come back in about 3 hours or less for projects under 1,000 sq ft. The app may ask the user to measure one reference span by hand for scale.
  - Outputs: measurements, 2D/3D floor-plan sketches and a 360° walkthrough.
  - LiDAR mode exists for Pro iPhones/iPads.
  - Source: [Hover help](https://help.hover.to/en/articles/9264961-interior-scans-non-lidar).
- In April 2025 Hover expanded into interiors, with virtual walkthroughs from one phone scan — [Business Wire](https://www.businesswire.com/news/home/20250402052052/en).

#### Pix4Dcatch — ACTIVE (survey/construction; not consumer)
- Requires iOS 17+ or Android 9+. LiDAR is supported on iPhone 12 Pro through 17 Pro and on iPad Pros. "Android handsets have no LiDAR", and Android builds ignore depth in processing. Built for RTK GNSS survey workflows [snippet] — [Pix4D FAQ](https://support.pix4d.com/hc/en-us/articles/360043331092-FAQ-PIX4Dcatch), [iOS vs Android comparison](https://support.pix4d.com/hc/pix4dcatch-on-ios-and-android-full-feature-comparison).

#### Shapr3D — no native room scan confirmed
- Users on Shapr3D's forum work around the gap by making floor plans in magicplan and importing them as DXF/OBJ, or by importing iPhone scans as STL [older forum threads] — [Shapr3D forum](https://discourse.shapr3d.com/t/lidar-scanning/7082?page=4), [Shapr3D forum](https://discourse.shapr3d.com/t/the-best-lidar-scanning-app-for-shaper3d-use/34821).

#### Planner 5D — ACTIVE; "Scan Room" uses RoomPlan (LiDAR iOS only)
- "Scan Room" turns a physical room into a 3D floor plan using Apple RoomPlan. It needs a LiDAR device on iOS 16, and the plan can then be furnished from Planner 5D's catalog — [Planner 5D support](https://support.planner5d.com/en/articles/5897614-scan-your-room-ios), [Planner 5D blog](https://planner5d.com/blog/scan-room-the-latest-feature-from-planner-5d/).

#### Homestyler — scanning UNVERIFIED
- A 2025 comparison table credits Homestyler with rendering and plan-to-3D, but lists no scanning feature — [Archivinci](https://www.archivinci.com/blogs/15-best-home-renovation-apps-to-transform-your-space-in-2025). Homestyler publishes general content about scanner apps — [Homestyler](https://www.homestyler.com/article/ultimate-guide-to-floor-plan-scanner-apps).

#### Roomle — ACTIVE (B2B furniture configurator)
- Austrian company founded in 2014. Its core product is the "Rubens Configurator" — [Roomle](https://roomle.com/about).
- It is a browser-based 3D/AR product-configuration and planning platform for furniture brands. It claims 75+ brands and 20M configurations/year [3P] — [Capterra](https://www.capterra.com.au/compare/164020/181527/roomle/vs/3d-product-configurator). A reviewer credits its developer kit for quick embedding [3P] — [Capterra reviews](https://www.capterra.ie/reviews/164020/roomle).

#### New small 2025–2026 consumer apps (scan → place)
- "Plop it – Room Design": iPhone, uses LiDAR to map rooms, and takes a product link or photo as the furniture source. Released and last updated 3 Feb 2026 [snippet] — [App Store](https://apps.apple.com/us/app/id6757840355).
- "AR Home Vision – Room Builder": iPad-oriented ARKit room builder from Nov 2025; $6.99/month or $17.99/year [snippet] — [App Store](https://apps.apple.com/us/app/-/id6754307578).
- "EnVision": a promo page for LiDAR scan + real-scale placement, with USDZ export and Quick Look AR sharing. Availability unconfirmed — [EnVision](https://envision-three.vercel.app/).

### Inferences
- Professional tools converge on LiDAR capture, through RoomPlan or proprietary methods, often followed by paid cloud or human CAD processing. Consumer-grade structured capture on non-LiDAR phones is still a frontier in late 2026. Polycam shipped it on iPhone 13+ only in Jan 2026, and its non-LiDAR floor plans and non-LiDAR Android were still roadmap items.
- Where Android does get scanning, it comes from cloud-processed walk-throughs (CubiCasa, Hover), splat/photogrammetry apps (Scaniverse, KIRI, Polycam Photo) or manual methods. magicplan, a market leader, offers no Android scanning at all.
- Business models (per scan, per sq ft, or subscription with export paywalls) target professionals. Polycam's reviews show consumers resent paywalled measurements and exports. A B2C app should keep measuring and viewing free.
- RoomPlan is the free baseline most competitors build on. Apple hasn't updated it publicly since 2023, which is both a risk (stagnation, iOS 26 bugs) and a sign of a stable API.

### Gaps
- No official pricing found for magicplan. Polycam's official pricing page wasn't read, and the App Store, GetApp and TrustRadius figures conflict.
- No independent accuracy benchmarks for any of these apps; all accuracy figures are vendor claims. Phone accuracy is covered by another researcher.
- Zillow's page returned 403, so the "floor plan needs a 360° camera" detail is snippet-only.
- Homestyler's scanning feature and Shapr3D's current LiDAR capability were not confirmed from primary sources.
- Exact SiteScape acquisition date was not confirmed.

---

## 3. Third-party SDKs and APIs (what they provide, platforms, pricing/terms)

### Takeaway
No vendor found sells an embeddable, consumer-grade "scan a room on any phone (iPhone and Android) → structured 3D room" SDK. The usable building blocks are:
- Apple RoomPlan: free, but iOS LiDAR devices only.
- ARKit and ARCore: free live AR, plus ARCore's Depth API for depth on non-LiDAR Android phones.
- Niantic Spatial SDK (NSDK): cross-platform meshing and VPS; pricing for meshing unclear.
- B2B cloud floor-plan APIs: CubiCasa, Hover, Hosta. These involve per-scan fees, hours of turnaround and real-estate/insurance outputs.
- Data-only REST APIs: magicplan.
- Open formats: USDZ, GLB, SPZ (MIT).

Polycam, Twindo/Canvas, Locometric and Luma expose no public capture SDK. 8th Wall's hosted WebAR was shut down, with parts of it open-sourced.

### Cited Findings

| Vendor / component | What it offers | Platforms | Pricing / terms | Status | Sources |
|---|---|---|---|---|---|
| **Apple RoomPlan** | Scan UI with coaching, parametric room (walls/doors/windows/openings/objects with confidence), USD/USDZ export, Codable `CapturedRoom`, multi-room `StructureBuilder`, `ModelProvider` to swap object boxes for your own models | iOS/iPadOS with LiDAR only (iOS 16+; multi-room iOS 17) | Part of Apple's SDK; no separate fee found | Active; no public updates since iOS 17 (2023) | [WWDC22](https://developer.apple.com/videos/play/wwdc2022/10127/), [WWDC23](https://developer.apple.com/videos/play/wwdc2023/10192/), [Forum 2025](https://developer.apple.com/forums/thread/787628) |
| **ARCore Depth API (Google)** | Per-frame depth maps from "depth-from-motion", ML-assisted; ToF sensor fused if present; occlusion, depth hit-tests on irregular surfaces, physics collisions | Android (Kotlin/Java, NDK), Unity AR Foundation; only sufficiently powerful devices (see device list) | Free SDK | Active | [ARCore Depth](https://developers.google.com/ar/develop/depth), [ARCore devices](https://developers.google.com/ar/devices) |
| **Niantic Spatial SDK (NSDK; formerly Lightship ARDK)** | Live meshing (chunked triangle mesh with semantic filtering, e.g. ground/sky), VPS, shared AR | Unity docs; an [snippet] of NSDK docs says meshing works "on lidar and non-lidar hardware across Android and iOS", but the page I fetched did not state this | Free allowance covers VPS and Shared AR; calculator/sales for more. Older terms: Lightship free under 50K MAU. A v3.15 write-up says 10K free VPS calls/month, then about 1¢/call [3P] | Active | [NSDK meshing](https://nianticspatial.com/docs/nsdk/features/meshing/), [Lightship meshing](https://lightship.dev/docs/ardk/features/meshing), [NS pricing](https://nianticspatial.com/resources/pricing), [forum](https://community.nianticspatial.com/t/pricing-changes-of-lightship/5134), [Hiverlab](https://hiverlab.com/niantic-spatial-sdk-adds-outdoor-vps-live-meshing/) |
| **Scaniverse (Niantic Spatial)** | Capture app plus cloud splat/mesh, metric scale, exports (FBX/SPZ/PLY; mesh OBJ/GLB/USDZ in app); custom API integration only on Enterprise | iOS, Android, web dashboard | Free / $20 / $50 / Enterprise; commercial rights only on Pro/Enterprise | Active (cloud "New Scaniverse" 2026) | [Pricing](https://www.nianticspatial.com/pricing), [Radiance Fields](https://radiancefields.com/scaniverse-cloud-comes-to-android) |
| **SPZ format** | Compressed Gaussian-splat file format | Open | **MIT license → commercial use allowed** | Active | [Scaniverse](https://scaniverse.com/news/spz-gaussian-splat-open-source-file-format) |
| **8th Wall (Niantic Spatial)** | WebAR engine and hosting | Web | Hosted login/editing closed 28 Feb 2026; live projects hosted until 28 Feb 2027. Core modules (e.g. Image Targets, Face Effects) released under **MIT** at 8thwall.org; VPS/Maps excluded from the open engine (verify the exact licence of the engine binary) | Hosted product shutting down | [Niantic Spatial blog](https://info.nianticspatial.com/blog/8th-wall-update-engine-distribution-and-open-source-plans), [Road to VR, 2026-03-10](https://roadtovr.com/niantic-webar-platform-8th-wall-open-source/), [8th Wall FAQ](https://www.8thwall.com/docs/migration/faq/) |
| **magicplan REST API** | Read/manage projects, plans, workspace access; OAuth 2.0/SSO; API key plus customer ID. **No capture SDK** | Server-side | Plan requirements not stated | Active | [API docs](https://apidocs.magicplan.app/), [Advanced integrations](https://apidocs.magicplan.app/guide/advanced-integrations/) |
| **CubiCasa** | Partner platform API (2015: third-party software can reach the 3D-conversion step, per-conversion billing); white-label/partner "GoToScan powered by CubiCasa" iOS app; per-scan pricing | Capture on phones (iOS; Android per GetApp), cloud processing | Per scan (LITE free ≤5,000 sq ft; paid PLUS/3D); developer page returned 403 | Active | [Business Wire 2015](https://businesswire.com/news/home/20150921006220/en/CubiCasa-Unveils-Groundbreaking-Content-Platform-1.0-at-TechCrunch-Disrupt-2015), [GoToScan](https://apps.apple.com/us/app/id1592639815), [App Store](https://apps.apple.com/us/app/cubicasa/id1439879192) |
| **Hover API** | REST, OAuth 2.0: create/manage capture jobs, pull 3D models and measurement files, webhooks [3P]; developer portal at developers.hover.to | Capture in Hover app (any phone) | Not published | Active | [APIs.io](https://apis.io/providers/hover/), [Hover help](https://help.hover.to/en/articles/9264961-interior-scans-non-lidar) |
| **Matterport SDK** | Web/integration SDK for digital twins (covered by another researcher) | Web | Reportedly in the $309/month Business tier [3P] | Active (CoStar-owned) | [VectorShift](https://vectorshift.ai/research/deals/costar-matterport-2025) |
| **Polycam** | No public API/SDK found; integration via file exports; Enterprise reportedly includes "custom integration support" [3P] | iOS, Android, web | Subscriptions | Active | [Toolmage](https://www.toolmage.com/en/tool/polycam/), [Polycam 2025 press](https://www.businesswire.com/news/home/20250226523971/en) |
| **Luma AI** | Earlier "Video-to-3D API" (Mar 2023, about $1/scene) | Cloud | — | Status unknown; 3D capture wound down | [Radiance Fields](https://radiancefields.com/tags/video-to-3d-api) |
| **KIRI Engine API** | Photo, featureless and 3DGS reconstruction | Cloud | Pay-as-you-go, $1/credit, 1 credit per job, 500-credit ($500) minimum top-up, 20 free credits; API flagged "in testing" [3P] | Active/beta | [Fitgap](https://us.fitgap.com/products/004910/kiri-engine) |
| **Twindo (ex-Canvas, Occipital)** | No public SDK/API found; an API directory says Occipital has no developer interface [3P]; site footer links an unexplained "LLM JSON API" | — | — | — | [API Evangelist](https://providers.apievangelist.com/providers/occipital/), [Twindo](https://www.twindo.com/blog/canvas-is-now-twindo/) |
| **Locometric (RoomScan)** | No SDK or licensing program found; patented scanning methods | — | — | — | [App Store](https://apps.apple.com/us/app/roomscan-pro-lidar-floor-plans/id1504050801) |
| **Roomle** | B2B furniture configurator and planner platform with a developer kit for embedding; ERP/PIM/CRM hooks [3P] | Web, mobile AR | Not public | Active | [Capterra](https://www.capterra.ie/reviews/164020/roomle), [Roomle](https://roomle.com/about) |
| **Hosta AI** | Floor plans and measurements from ordinary smartphone photos, via dashboard or API; aimed at insurers, contractors, real estate [3P]; raised $11.5M in 2021 | Cloud | Usage-based, not public [3P] | Unverified current status | [Trending AI Tools](https://www.trendingaitools.com/ai-tools/hosta-ai/), [GlobeSt 2021](https://globest.com/2021/11/24/hosta-ai-doubles-down-on-remote-assessment-and-measurement-with-new-funding-round) |

- RoomPlan's `ModelProvider` maps categories and attribute sets (e.g. sofa types) to model files, so detected furniture boxes can be replaced with real models at USDZ export — [WWDC23](https://developer.apple.com/videos/play/wwdc2023/10192/).

### Inferences
- **Most reusable for a demo:** RoomPlan on LiDAR iPhones gives a free, on-device, seconds-fast, parametric room with doors and windows, plus Apple's own coaching UI. Its output (walls as planes, objects as boxes) maps easily to a lightweight GLB or three.js room for the web. Converting USDZ ↔ GLB is the cross-platform researcher's topic.
- **For non-LiDAR iPhones and Android there is no drop-in consumer SDK.** The options are:
  - (a) Build on ARCore/ARKit plane detection plus ARCore Depth, or NSDK meshing (verify non-LiDAR support and pricing).
  - (b) License a cloud walk-through service (CubiCasa/Hover style). This means per-scan cost and hours of latency, which suits real estate more than consumer UX.
  - (c) Use a guided manual "room builder" (corners and dimensions) as the fallback.
- The B2B APIs (magicplan, Hover, CubiCasa) return floor plans and measurement data for estimating and insurance, not renderable, furnishable 3D rooms. They are a poor fit for YoungVista's B2C flow, except as a possible paid "accurate floor plan" add-on.
- Dependency risk is real and recent: 8th Wall's hosting shutdown, Luma's 3D wind-down, the Canvas → Twindo pro pivot, Tango's death, and RoomPlan's two-plus-year silence.

### Gaps
- No primary-source pricing found for NSDK meshing. Whether NSDK meshing works on non-LiDAR phones is unresolved (the snippet says yes; the fetched page is silent).
- CubiCasa's developer page returned 403, so current API scope and white-label terms are unknown.
- No confirmation of a Locometric, Polycam or Occipital SDK beyond "none found".
- Apple's developer program fee and any RoomPlan usage terms were not checked.
- ARCore Depth Lab is described as open source, but its licence was not verified here.

---

## 4. How apps capture rooms on Android and non-LiDAR phones, and what quality/accuracy they get

### Takeaway
Seven non-LiDAR approaches are in use:
1. Single-viewpoint photo/panorama scenes (IKEA).
2. Walk-through video or photo trails processed in the cloud, often with human QA, taking hours (CubiCasa, Hover).
3. On-device ML depth from video (Polycam on iPhone 13+ since Jan 2026; ARCore depth-from-motion).
4. Guided corner-marking or touch methods (magicplan Corner Mode, RoomScan Touch Mode).
5. Manual room builders (IKEA web Room Builder, magicplan "square room").
6. Photogrammetry or Gaussian splats (Scaniverse, KIRI, Polycam Photo), which look realistic but are unstructured.
7. 360° cameras (Zillow floor plans, Matterport).

Published accuracy claims are vendor-only: IKEA about 97%, CubiCasa 95–97% (97–99% with LiDAR), IKEA Place 98%. Apple gives no numeric figure for RoomPlan.

### Cited Findings
- Android phones lack LiDAR — [Pix4D FAQ](https://support.pix4d.com/hc/en-us/articles/360043331092-FAQ-PIX4Dcatch) [snippet], [3DWithUs](https://3dwithus.com/polycam-introduces-room-mode-and-teams). Most iPhones sold are non-Pro (CIRP data cited by Polycam) [vendor] — [Polycam press](https://www.rooferscoffeeshop.com/post/polycam-brings-pro-grade-3d-scanning-to-800-million-iphone-users-for-free-no-lidar-required).

**1. Photo/panorama scene (IKEA Kreativ)**
- Non-LiDAR devices (Android included) get a "Photographic Wide-Angle Scan". The app picks "5 Point Panoramic" or "Ultrawide" capture — [IKEA US help](https://www.ikea.com/us/en/customer-service/knowledge/articles/e86d70g6-3673-4306-b373-20f7cg7fd5ed.html).
- Panoramic capture: rotate to five targets with elbows tucked, then do figure-8 sweeps — [IKEA tips](https://www.ikea.com/pt/en/customer-service/knowledge/articles/e2187190-3508-4202-g02f-5b3566d4g084.html).
- Claimed accuracy is about 97% "when best practices are followed" [vendor] — [IKEA IE](https://www.ikea.com/ie/en/customer-service/knowledge/articles/28c782c5-0036-4ff1-b1fd-20846237ee09.html).

**2. Walk-through with cloud processing (CubiCasa, Hover)**
- CubiCasa: about a 5-minute walk-through on a normal phone, without tapping corners — [App Store](https://apps.apple.com/us/app/cubicasa/id1439879192). Turnaround is up to 24 hours — [Miami Realtors](https://www.miamirealtors.com/services/products-and-services/cubicasa/). Average accuracy is 95–97% [vendor via 3P] — [ARMLS](https://armls.com/how-accurate-are-cubicasa-floorplan-scans), or 97–99% on LiDAR iPhones — [ABoR](https://abor.com/cubicasa). A blog says AI builds a point cloud and staff run a QA check before delivery [3P] — [Substack](https://matthewmetros.substack.com/p/how-to-create-professional-3d-floor).
- Hover Universal: any Apple or Android device, about 15 minutes of capture, results in about 3 hours or less. It may ask the user to measure one reference span by hand for scale. No tolerances are published — [Hover help](https://help.hover.to/en/articles/9264961-interior-scans-non-lidar).

**3. On-device ML depth from monocular video**
- Polycam (Jan 2026): depth is estimated from ordinary video with computer vision and ML, on iPhone 13+. Processing is on-device or in the cloud, and quality is called enough for "indoor design visualization and space layouts" [vendor] — [Polycam press](https://www.rooferscoffeeshop.com/post/polycam-brings-pro-grade-3d-scanning-to-800-million-iphone-users-for-free-no-lidar-required).
- ARCore Depth API:
  - Depth-from-motion compares frames from different viewpoints, with ML filling in even when the user barely moves.
  - Reliable estimates span about 0–65 m, and are most accurate at 0.5–5 m.
  - Featureless surfaces such as blank walls give imprecise depth; ToF sensors help. Accuracy improves the more the device moves.
  - Source: [ARCore Depth](https://developers.google.com/ar/develop/depth).
- The NSDK meshing docs reportedly cover both LiDAR and non-LiDAR devices [snippet; unconfirmed] — [NSDK meshing](https://nianticspatial.com/docs/nsdk/features/meshing/).

**4. Guided corner or touch methods**
- magicplan Corner Mode detects room corners through the camera on non-LiDAR iPhones — [magicplan help](https://help.magicplan.app/why-do-i-not-have-the-sensor-capture-option-anymore). On Android, magicplan offers no scanning, only "defining corners", "square room" and drawing — [magicplan help (Android)](https://help.magicplan.app/scan-a-room-with-the-camera-of-your-mobile-device-android).
- RoomScan "Touch Mode" works on any hardware, "built for dim light" — [App Store](https://apps.apple.com/us/app/roomscan-pro-lidar-floor-plans/id1504050801).

**5. Manual room builder**
- IKEA Room Builder (web-only, manual dimensions) — [MacMyths](https://macmyths.com/ikea-place-review-what-ikea-kreativ-does-in-2026/). In build-your-room, products show at "100% accurate scale" against the entered dimensions [vendor] — [IKEA IE](https://www.ikea.com/ie/en/customer-service/knowledge/articles/28c782c5-0036-4ff1-b1fd-20846237ee09.html).

**6. Photogrammetry and Gaussian splats**
- Scaniverse (iOS and Android; metric scale even on the free plan; cloud processing is "higher quality than on-device") — [Niantic Spatial pricing](https://www.nianticspatial.com/pricing), [Radiance Fields](https://radiancefields.com/scaniverse-cloud-comes-to-android).
- KIRI Engine (iOS and Android) — [KIRI pricing](https://www.kiriengine.app/pricing).
- Polycam Photo Mode on Android [older] — [3DWithUs](https://3dwithus.com/polycam-introduces-room-mode-and-teams).

**7. 360° camera**
- Zillow 3D Home floor plans need a 360° camera [snippet] — [Zillow](https://www.zillow.com/z/3d-home).

**LiDAR baseline for comparison**
- Apple gives no numeric accuracy for RoomPlan; outputs are "simplified" parametric scans with per-element confidence — [WWDC22](https://developer.apple.com/videos/play/wwdc2022/10127/).
- IKEA Place claimed 98% scale accuracy for products placed in live AR, without any scan [vendor, 2017] — [IKEA newsroom](https://ikea.com/global/en/newsroom/innovation/ikea-launches-ikea-place-a-new-app-that-allows-people-to-virtually-place-furniture-in-their-home-170912/).
- SiteScape claims about ±1 inch [vendor via 3P] — [engineering.com](https://www.engineering.com/?p=46460).

### Inferences
- For a consumer demo, a sensible fallback ladder is:
  1. LiDAR iPhone → RoomPlan: full parametric 3D room in seconds.
  2. Non-LiDAR iPhone or Android → AR-guided "tap the corners / walk the walls" capture using ARKit/ARCore plane detection, plus a manual dimension editor. This yields a simple extruded room good enough for orbit/zoom and placement.
  3. Optionally, a cloud walk-through service later for higher fidelity.
  
  IKEA, magicplan and RoomScan all keep a manual or corner fallback, which suggests no one trusts automatic non-LiDAR capture alone.
- Live AR placement does not need a room scan. IKEA Place, Amazon and Lowe's did it with plane detection on ordinary ARCore/ARKit phones. YoungVista's AR view can therefore work on every supported phone even where room scanning is weak.
- Monocular depth (ARCore, Polycam's ML) is weakest on blank, textureless walls, which are exactly what rooms are made of. Expect missed or wobbly walls on non-LiDAR devices unless the user marks corners or edges.
- Vendor accuracy numbers (97–99%) are never backed by published methodology. YoungVista should verify scale itself, for example by asking the user to confirm one wall length, as Hover does, rather than relying on claims.

### Gaps
- No independent benchmark found comparing non-LiDAR methods (panorama, video-ML, corner tapping) on the same rooms. The phone-accuracy researcher may cover this.
- No public accuracy data for Polycam's non-LiDAR mode or for Android captures in any app.
- Unknown whether IKEA's non-LiDAR wide-angle scene supports a true orbitable 3D view; no documentation found.

---

## 5. UX lessons: scan guidance, scan time, failure modes, review complaints, result presentation, multiple rooms and open doors, furniture-placement interaction

### Takeaway
Successful consumer flows make the hard part feel small:
- Auto-select the capture method per device.
- Coach in real time (distance, speed, light, texture).
- Keep single scans under about 5 minutes.
- Ask for bright light and a simple motion (sweep, figure-8, circle back to start).
- Process asynchronously, with a notification.
- Present results as an editable 2D/3D model that can start empty or have existing furniture erased.
- Lock products to true scale (no resizing), allow several items, and let users save and share rooms.

Recurring failures:
- Mirrors and glass, dark surfaces, high ceilings and dim light.
- Overheating, crashes and lost work on long scans.
- Missed doors, openings, alcoves or islands, and phantom doors.
- Distorted joins between rooms.
- Paywalled measurements or exports.

### Cited Findings

**Scan guidance (primary sources)**
- **Apple RoomPlan:**
  - Best for a single residential room up to 30 × 30 ft. At least 50 lux of light.
  - Open curtains (scan in daytime). Close doors so the scanner doesn't pick up areas outside the room.
  - Avoid scans over 5 minutes and repeated scans (fatigue, battery, heat).
  - Full-height mirrors, glass, very dark surfaces and high ceilings beyond LiDAR range are known problems.
  - Live instructions cover distance, speed, lighting and "areas with more texture".
  - Source: [WWDC22](https://developer.apple.com/videos/play/wwdc2022/10127/).
  - VoiceOver spoken guidance, e.g. "Point camera at bottom edge of wall" — [WWDC23](https://developer.apple.com/videos/play/wwdc2023/10192/).
- **IKEA Kreativ:**
  - Raise blinds and switch on lights. Shoot in landscape, aim at the centre of the zone and keep the floor in frame.
  - Stand at the back of the space with a wall or corner behind you. Do slow figure-8 sweeps covering ceiling, walls and floor.
  - For panoramas, wait for confirmation at each of five targets and avoid twisting your body. Reject blurry or partial previews.
  - Source: [IKEA tips](https://www.ikea.com/pt/en/customer-service/knowledge/articles/e2187190-3508-4202-g02f-5b3566d4g084.html).
  - If the app slows or freezes, close background apps and rescan — [IKEA US help](https://www.ikea.com/us/en/customer-service/knowledge/articles/e86d70g6-3673-4306-b373-20f7cg7fd5ed.html).
- **Houzz Pro:** use a bright room, stand well back from the walls, move at a consistent speed and sweep up and down over every corner, edge, ceiling and floor — [Houzz Pro help](https://pro.houzz.com/pro-help/r/how-to-scan-a-room-using-lidar-technology).
- **Hover:**
  - Keep the phone raised and floor and ceiling in frame. Circle back to where you started, and walk around furniture instead of moving it.
  - In small rooms, sweep from the doorway.
  - Scan hallways separately and keep each level's rooms linked.
  - Source: [Hover help](https://help.hover.to/en/articles/9264961-interior-scans-non-lidar).
- **Coohom guide (Apr 2026, vendor content):** slow down, keep light even, check one wall against a hand measurement and avoid reflective floors. Poor lighting is the most common cause of misaligned AR furniture — [Coohom](https://www.coohom.com/article/why-furniture-layout-apps-don't-scan-your-room-correctly-and-how-to-fix-it).

**Typical scan and processing times**
- IKEA early beta: about 2 minutes of scanning plus about 5 minutes of upload prep [2022] — [TechCrunch](https://techcrunch.com/?p=2340297) [snippet].
- CubiCasa: about 5–10 minutes for a whole-home walk-through, delivered within 24 hours — [REcolorado](https://recolorado.com/?p=24461), [Miami Realtors](https://www.miamirealtors.com/services/products-and-services/cubicasa/).
- Hover: about 15 minutes of capture, results in 3 hours or less for under 1,000 sq ft — [Hover help](https://help.hover.to/en/articles/9264961-interior-scans-non-lidar).
- RoomPlan: processed model in "a few seconds" — [WWDC22](https://developer.apple.com/videos/play/wwdc2022/10127/).
- IKEA Full Room Scan: users get an email when it's ready — [IKEA IE](https://www.ikea.com/ie/en/customer-service/knowledge/articles/b2399d09-872g-4c18-852d-d24371e735b2.html).

**Failure modes and recurring complaints (reviews and help pages)**
- Overheating stops scans (Twindo) — [App Store](https://apps.apple.com/us/app/id1169235377).
- Crashes that lose work; missed alcoves, doors and openings; rooms joined in distorted positions; crashes in rooms with many wall changes (RoomScan, 2021–2023) — [App Store](https://apps.apple.com/us/app/roomscan-pro-lidar-floor-plans/id1504050801).
- Missing kitchen island, phantom door, missing wall (CubiCasa, 2022) — [App Store](https://apps.apple.com/us/app/cubicasa/id1439879192).
- Data lost in long sessions; price hikes; measurements and floor plans paywalled (Polycam) — [App Store](https://apps.apple.com/app/id1532482376).
- Cabinets in a row look stretched (Houzz Pro) — [Houzz Pro help](https://pro.houzz.com/pro-help/r/how-to-scan-a-room-using-lidar-technology).
- Capture wouldn't start: "move ur iPhone to start" (Luma, 2023) — [App Store](https://apps.apple.com/in/app/luma-ai/id1615849914).
- Colour artifacts on iOS 26 debug builds (RoomPlan) [snippet] — [Apple forum](https://developer.apple.com/forums/thread/801252).
- IKEA Kreativ capture felt fiddly (several panoramas plus a figure-eight wave) — [Mako](https://www.mako.co.il/nexter-news/Article-6838ffcdddb8181027.htm) [snippet].
- A UX critique argues AR onboarding needs an easily recognized mental model, because users carry over tilt-and-move habits from other AR apps — [Pratt IxD](https://ixd.prattsi.org/?p=41438) [snippet].

**Result presentation**
- IKEA Full Room Scan produces a "digital twin" that "starts empty"; the wide-angle scan lets users erase existing items. Design continues on the web, Remix links allow shared editing on the web, and the app shares images — [IKEA US help](https://www.ikea.com/us/en/customer-service/knowledge/articles/e86d70g6-3673-4306-b373-20f7cg7fd5ed.html).
- Houzz Pro: rename, rotate in 90° steps, switch 2D/3D, show or hide furniture, take ruler measurements, open an AR view, generate an AI estimate — [Houzz Pro help](https://pro.houzz.com/pro-help/r/how-to-scan-a-room-using-lidar-technology).
- RoomPlan shows a live 3D model while scanning, then a post-processed result screen — [WWDC22](https://developer.apple.com/videos/play/wwdc2022/10127/).
- Polycam: link sharing with access controls, free web viewer, 360° tours — [App Store](https://apps.apple.com/app/id1532482376).
- Hover: 2D/3D floor-plan sketches plus a 360° walkthrough — [Hover help](https://help.hover.to/en/articles/9264961-interior-scans-non-lidar).

**Multiple rooms and open doors**
- RoomPlan MultiRoom:
  - Either keep one ARSession running between scans (`stop(pauseARSession:false)`) or relocalize with a saved ARWorldMap.
  - `StructureBuilder` merges the scans and removes duplicate walls.
  - Recommended maximum is about 2,000 sq ft on a single floor.
  - Source: [WWDC23](https://developer.apple.com/videos/play/wwdc2023/10192/).
  - Apple advises closing doors to cut stray capture — [WWDC22](https://developer.apple.com/videos/play/wwdc2022/10127/).
- RoomScan recommends its own LiDAR mode over RoomPlan for multi-room jobs, and says about 80% of multi-room rooms are scanned in LiDAR mode [vendor] — [App Store](https://apps.apple.com/us/app/roomscan-pro-lidar-floor-plans/id1504050801).
- Hover: rooms must link for the model to generate; scan hallways separately — [Hover help](https://help.hover.to/en/articles/9264961-interior-scans-non-lidar).
- CubiCasa: one pass over all floors, starting at the lowest level — [REcolorado](https://recolorado.com/?p=24461).
- magicplan Auto-Scan captures several rooms in one session — [magicplan help](https://help.magicplan.app/why-do-i-not-have-the-sensor-capture-option-anymore).

**Furniture-placement interaction**
- **Scale:**
  - Products are auto-scaled to true size with no resizing (IKEA Kreativ) — [IKEA IE](https://www.ikea.com/ie/en/customer-service/knowledge/articles/28c782c5-0036-4ff1-b1fd-20846237ee09.html).
  - IKEA Place auto-scaled products to room dimensions, claiming 98% accuracy [2017] — [IKEA newsroom](https://ikea.com/global/en/newsroom/innovation/ikea-launches-ikea-place-a-new-app-that-allows-people-to-virtually-place-furniture-in-their-home-170912/).
- **Multiple items and saved rooms:**
  - Multiple items in one view: IKEA Place (2019) — [Gear Patrol](https://www.gearpatrol.com/2019/09/23/ikea-place-augmented-reality-app-update/); Amazon Room Decorator (2020) — [Engadget](https://www.engadget.com/amazon-ar-shopping-furniture-home-decor-171005257.html).
  - Saved rooms that can be revisited later and viewed on desktop (Amazon) — [Furniture Today](https://www.furnituretoday.com/technology/amazon-launches-new-ar-room-decorator-function).
- **Snapping, walls and dimensions:**
  - Wall snapping when a piece is dragged near a wall, useful for cabinets; can be toggled (RoomSketcher) — [RoomSketcher help](https://help.roomsketcher.com/hc/en-us/articles/115001610525).
  - Floor and wall placement modes with editable dimensions ("Will It Fit? AR") [snippet] — [App Store](https://apps.apple.com/us/app/id6768062410).
  - Home Depot's AR can gauge the dimensions of some products, such as refrigerators — [Home Depot newsroom](https://corporate.homedepot.com/newsroom/5-technologies-changing-how-we-shop).
- **Photo-based alternative:** Target placed products in a still photo of the room rather than live AR [2017] — [TechCrunch](https://techcrunch.com/2017/10/24/target-adds-ar-shopping-to-its-mobile-website).
- **Scanned furniture:** RoomPlan's `ModelProvider` can replace scanned furniture boxes with catalog models (for example, swap the user's own sofa box for a product model) — [WWDC23](https://developer.apple.com/videos/play/wwdc2023/10192/).
- **Live AR vs 3D model:** a reviewer missed IKEA Place's walk-around live AR in Kreativ's model-based approach — [Mako](https://www.mako.co.il/nexter-news/Article-6838ffcdddb8181027.htm) [snippet]. MacMyths found no live AR view described for Kreativ — [MacMyths](https://macmyths.com/ikea-place-review-what-ikea-kreativ-does-in-2026/).

### Inferences
- **Lessons for YoungVista's scan UX:**
  - (1) Never ask "do you have LiDAR?" — detect it and pick the mode, as IKEA does.
  - (2) Give one simple motion instruction plus live feedback, using RoomPlan's coaching or an equivalent on Android.
  - (3) Cap scans at about 2–5 minutes per room, and save partial progress (RoomScan users lost work in crashes).
  - (4) Show a live preview and a fast "is this right?" review step, with simple fixes: drag a wall, add a door, enter one true wall length.
  - (5) Pre-warn about mirrors, glass, dark rooms and high ceilings, and suggest daylight with curtains open.
  - (6) Handle one room first; multi-room merging is error-prone even for pros.
- **Lessons for YoungVista's placement UX:**
  - Products should be locked to true scale (no pinch-to-resize), as IKEA does.
  - Drag on the floor, rotate with a handle or two fingers, snap to walls, prevent overlaps, and show dimensions or clearances to answer "will it fit".
  - Offer "start empty" or "hide my existing furniture". IKEA-style photoreal erasing is hard; RoomPlan's object boxes allow a simpler hide/replace.
  - Keep both the 3D model view and live AR, because the two serve different moments (planning vs on-site checking). A reviewer missed live AR in IKEA's model-only approach.
- **Persistence:** persist rooms to an account with web viewing and sharing links (IKEA web design and Remix, Amazon saved rooms, Polycam links). This is now table stakes.

### Gaps
- No large-sample app-store complaint analysis was possible; WebFetch shows only about 4 reviews per listing, and Google Play reviews were not reachable. Recurring complaints above come from small samples.
- No primary source found describing collision handling or wall-snapping in IKEA Kreativ, Wayfair or Amazon.
- No data on scan success or failure rates, or completion funnels, from any app.
- Apple's Human Interface Guidelines AR page could not be fetched (JavaScript-rendered), so Apple's official placement-gesture guidance is not cited here.

---

## 6. What YoungVista can reuse vs must build; does any competitor already do "scan on a phone → place catalog products in 3D and AR → view on the web"? How is YoungVista differentiated?

### Takeaway
Pieces of the flow exist, but no product was found that does the whole YoungVista flow for any phone (non-LiDAR iPhone and Android) with both an orbitable 3D model and live AR, viewable on the web.
- **IKEA Kreativ comes closest:** scan, IKEA-only catalog, erase, web design. But full 3D needs LiDAR, other phones get photo-based scenes, the web cannot capture, and no live AR view is described.
- **Houzz** splits consumer AR (View in My Room 3D) from pro LiDAR scanning (Houzz Pro).
- **Planner 5D** and small 2026 indie apps (Plop it, EnVision, AR Home Vision) are LiDAR-dependent and iOS-only.

YoungVista can reuse RoomPlan, ARKit/ARCore (plus ARCore Depth), open formats (USDZ, GLB, SPZ under MIT), and proven UX patterns. It must build non-LiDAR/Android capture, the room data model, the web viewer and the placement editor itself.

### Cited Findings
- **IKEA Kreativ** does: capture in the app (Full Room Scan on LiDAR, Photographic Wide-Angle on all devices), design on app and web, erase existing furniture, auto-scale products, 50+ showrooms, add to cart — [IKEA US help](https://www.ikea.com/us/en/customer-service/knowledge/articles/e86d70g6-3673-4306-b373-20f7cg7fd5ed.html), [IKEA AU newsroom](https://www.ikea.com/au/en/newsroom/range-news/ai-powered-design-experience-ikea-kreativ-launches-pubcf6362b0/).
  - Its limits: IKEA products only (inherent in the retailer's tool); browsers cannot capture; Android has no full-room scan; "not a measurement tool"; textiles and ceiling items unsupported; no live AR view described — [MacMyths](https://macmyths.com/ikea-place-review-what-ikea-kreativ-does-in-2026/).
  - Room dimensions can't be edited after creation ("coming soon") — [IKEA IE](https://www.ikea.com/ie/en/customer-service/knowledge/articles/28c782c5-0036-4ff1-b1fd-20846237ee09.html).
- **Houzz:** the consumer View in My Room 3D (ARKit/ARCore, over a million products) — [Houzz blog](https://blog.houzz.com/houzz-upgrades-augmented-reality-app-capabilities). The pro-only Houzz Pro 3D Room Scan (RoomPlan, LiDAR, iOS 16+), with 2D/3D plans, an AR view and AI estimates — [Houzz Pro help](https://pro.houzz.com/pro-help/r/how-to-scan-a-room-using-lidar-technology).
- **Planner 5D:** RoomPlan-based "Scan Room" (LiDAR, iOS), furnished from its catalog — [Planner 5D support](https://support.planner5d.com/en/articles/5897614-scan-your-room-ios).
- **Polycam:** capture plus a free web viewer and share links, on iOS, Android and the web [vendor]. No product-catalog placement was found in its listing — [App Store](https://apps.apple.com/app/id1532482376), [Polycam press](https://www.rooferscoffeeshop.com/post/polycam-brings-pro-grade-3d-scanning-to-800-million-iphone-users-for-free-no-lidar-required).
- **Indie 2026 apps:**
  - Plop it: LiDAR iPhone, furniture from a product link or photo, shared through the iOS share sheet — [App Store](https://apps.apple.com/us/app/id6757840355).
  - EnVision: LiDAR, USDZ export, Quick Look sharing — [EnVision](https://envision-three.vercel.app/).
  - AR Home Vision: iPad ARKit room builder, subscription — [App Store](https://apps.apple.com/us/app/-/id6754307578).
- **B2B configurator platforms** (Roomle) target furniture brands embedding 3D/AR configurators on their own sites, not consumer room scanning [3P] — [Capterra](https://www.capterra.com.au/compare/164020/181527/roomle/vs/3d-product-configurator).
- **Reusable components:**
  - RoomPlan — free, LiDAR iOS; USDZ, Codable, multi-room, ModelProvider — [WWDC23](https://developer.apple.com/videos/play/wwdc2023/10192/).
  - ARCore Depth API — non-LiDAR depth on Android — [ARCore Depth](https://developers.google.com/ar/develop/depth).
  - NSDK meshing — [NSDK](https://nianticspatial.com/docs/nsdk/features/meshing/).
  - SPZ — MIT licence — [Scaniverse](https://scaniverse.com/news/spz-gaussian-splat-open-source-file-format).
  - Open-sourced 8th Wall modules — MIT per Road to VR — [Road to VR](https://roadtovr.com/niantic-webar-platform-8th-wall-open-source/).
  - B2B floor-plan APIs: CubiCasa, Hover, magicplan — see Section 3.

### Inferences
- **Reuse (low-risk, fast for a demo):**
  - (1) RoomPlan + `RoomCaptureView` on LiDAR iPhones for the "wow" scan, converting `CapturedRoom` (walls, doors, windows, object boxes) into YoungVista's own neutral room JSON and a GLB for web and Android.
  - (2) ARKit/ARCore plane detection for live-camera placement on any supported phone. This is proven since 2017 by IKEA Place, Amazon, Houzz and Lowe's.
  - (3) Open formats: GLB for products and rooms on the web and Android; USDZ for iOS Quick Look/RealityKit. Conversion is covered by the cross-platform and 3D-model researchers.
  - (4) IKEA, Apple and Houzz UX patterns: auto mode selection, coaching, "start empty" or hide existing furniture, true-scale lock, 2D/3D toggle, async processing with a notification, and shareable web links.
- **Build (no off-the-shelf consumer SDK found):**
  - (a) Non-LiDAR iPhone and Android room capture. The pragmatic MVP is AR-assisted corner and wall marking plus manual dimensions, optionally upgraded later with ARCore Depth or NSDK meshing, or Polycam-style ML depth.
  - (b) A cross-platform room data model and sync/back-end.
  - (c) A web viewer with orbit, zoom and drag placement.
  - (d) A placement editor with wall snapping, collision and "will it fit" dimensions.
  - (e) A catalog pipeline (GLB → USDZ) — covered elsewhere.
- **Differentiation versus IKEA** (the main benchmark, free to consumers):
  - Works on any phone, including non-LiDAR iPhones and Android, with an orbitable 3D room rather than a single-viewpoint photo scene (if IKEA's non-LiDAR mode is indeed 2.5D; unverified).
  - One room model shared across the 3D view, live AR and the web.
  - A multi-brand or curated catalog rather than one retailer.
  - Simpler capture (IKEA's was described as fiddly).
  - Editable room dimensions and measurement confidence, which IKEA lacks: it is "not a measurement tool" and can't edit dimensions after creation.
  
  Risks: IKEA can add these at any time, and non-LiDAR capture quality is the hardest technical risk.
- **Vendor-dependency hedge:** Tango, Luma, 8th Wall and possibly RoomPlan's stagnation all argue for keeping room and placement data in YoungVista's own neutral schema, with scanners as interchangeable "capture providers".

### Gaps
- No confirmation of whether any 2026 startup or regional app (e.g. in Asia or Europe) delivers the full any-phone → 3D + AR → web flow. Searches surfaced only LiDAR-only iOS indie apps, and their quality and traction are unknown.
- Whether the IKEA app currently offers live AR placement of products inside a Kreativ scan was not verified.
- No licensing or pricing quotes obtained from CubiCasa, Hover or Niantic Spatial for a consumer-scale use case; this would need direct sales contact.
