# AI "final render": a photoreal image of the customer's room with the placed products, from a chosen viewpoint (state as of 2026-11-05)

Labels used throughout: **(V)** = the source page was fetched and read on 2026-11-05 (by me or a parallel sub-researcher). **(S)** = search-result snippet or secondary source only; the page was not opened. **(K)** = researcher background knowledge with the canonical URL given but **not re-fetched today**; verify before relying on it. Generative-image models change every few months, so anything dated before mid-2026 is flagged as possibly outdated.

## 1. Approaches and trade-offs

### Takeaway
No single approach gives a polished photo, exact room geometry and the exact SKU at the same time. Generative approaches (1, 2) give the polish but redraw everything, including the product. Physically based rendering (3) and captured-photo compositing (5) are exact but only look as real as the captured room. The hybrid (4) — render products exactly, let AI touch only room surfaces, lighting and shadows inside masks, then paste the exact product pixels back — is the only design that structurally prevents product drift. It is built from the same camera, mask and depth passes as (3) and (5), so building those first is not wasted work.

### Cited Findings
**(1) Structure-conditioned image-to-image (ControlNet / T2I-Adapter family)**
- ControlNet (Zhang, Rao, Agrawala; ICCV 2023) adds spatial conditioning (edges, depth, segmentation, pose) to a frozen pretrained text-to-image diffusion model. Reference code is Apache-2.0 (K) — [arXiv 2302.05543](https://arxiv.org/abs/2302.05543), [GitHub lllyasviel/ControlNet](https://github.com/lllyasviel/ControlNet)
- T2I-Adapter is a lighter adapter for the same kind of structural conditioning (K) — [arXiv 2302.08453](https://arxiv.org/abs/2302.08453)
- A current, commercially usable option is InstantX **Qwen-Image-ControlNet-Union**: "License: apache-2.0", built on Qwen/Qwen-Image, supports "4 common control types (canny, soft edge, depth, pose)", with conditioning scale 0.8–1.0 suggested. Its stated limitation: it "was unable to preserve some details without explicit 'TEXT' in prompt, such as small font text" (V) — [Hugging Face card](https://huggingface.co/InstantX/Qwen-Image-ControlNet-Union)
- BFL's FLUX.1 Depth [dev] and Canny [dev] (Nov 2024, possibly outdated) are under the FLUX.1 [dev] Non-Commercial License. Self-hosting them commercially needs a paid BFL licence (K) — [HF FLUX.1-Depth-dev](https://huggingface.co/black-forest-labs/FLUX.1-Depth-dev)
- SDXL and the SDXL depth ControlNet use the CreativeML Open RAIL++-M licence, which allows commercial use with use-based restrictions (K; 2023 models, quality now well behind 2026 editors) — [SDXL base](https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0), [controlnet-depth-sdxl-1.0](https://huggingface.co/diffusers/controlnet-depth-sdxl-1.0). SD 3.5 is under the Stability AI Community License, free for commercial use under US$1M annual revenue (K) — [stability.ai/license](https://stability.ai/license)
- This was the approach behind the first wave of room-redesign apps. RoomGPT (open source, MIT) generates "variations of rooms" using ControlNet hosted on Replicate (V) — [GitHub Nutlope/roomGPT](https://github.com/Nutlope/roomGPT)
- An open-source virtual-staging pipeline conditions Stable Diffusion on Canny edges and depth from the empty-room photo, plus an inpainting ControlNet, so wall and window outlines and perspective carry through. It claims geometry is preserved but publishes no measurements (S) — [mithunparab/virtual-staging](https://awesome.ecosyste.ms/projects/github.com%2Fmithunparab%2Fvirtual-staging)
- Segmentation guidance is the usual guardrail. A staging vendor labels each pixel as floor, ceiling, walls, windows or existing furniture so new items land only in plausible regions (S, vendor) — [ArchiVinci](https://www.archivinci.com/virtual-staging-ai). Virtual Staging AI's research-engineer challenge sets the goal as preserving "structural elements like windows and doors" with "segmentation-guided diffusion" (S) — [Virtual Staging AI challenge](https://virtualstaging-ai.notion.site/Research-Engineer-Technical-Challenge-virtual-staging-295e57ca58b4434ebee1610bc38aa774)

**(2) Instruction-based multi-reference image editors (line-up as of 2026-11-05)**
- **Google.** Gemini API docs list these models:
  - Nano Banana 2.1 (`gemini-nano-banana-2.1`), the "main everyday model".
  - Nano Banana 2 (`gemini-3.1-flash-image`), now the "previous generation".
  - Nano Banana 2 Lite (`gemini-3.1-flash-lite-image`), "the fastest and cheapest".
  - Nano Banana Pro (`gemini-3-pro-image`), the premium option, relying on reasoning.
  - Legacy Nano Banana (`gemini-2.5-flash-image`).
  - Imagen is listed as shut down.

  (V) — [Gemini image-generation docs](https://aistudio.google.com/docs/image-generation). Nano Banana 2 began rolling out on 26 Feb 2026 (S) — [Neowin](https://www.neowin.net/amp/google-launches-nano-banana-2-pro-quality-at-flash-speeds/), [Republic World](https://www.republicworld.com/tech/google-releases-nano-banana-2-image-generation-model-with-faster-speed-smarter-outputs)
- **Gemini capabilities** (V) — [docs](https://aistudio.google.com/docs/image-generation):
  - "Mix up to 14 reference images". Nano Banana 2.1 and 2 take up to 10 object images plus 4 character images. Pro takes up to 6 objects, 5 characters and 3 style references.
  - Output at 1K, 2K or 4K.
  - Editing is prompt-only ("Provide an image and use text prompts to add, remove, or modify elements"). No mask or inpainting parameter is documented.
  - "Thinking" is on by default and "cannot be disabled in the API"; it may produce up to two draft images "to test composition and logic".
  - "All generated images include a SynthID watermark".
- `gemini-2.5-flash-image` (the original Nano Banana, Aug 2025) is deprecated and "will be shut down on March 15, 2027" (V) — [Gemini pricing](https://aistudio.google.com/docs/pricing)
- **OpenAI.** gpt-image-2 launched on 21 Apr 2026 as "ChatGPT Images 2.0", described as an image model that reasons (S) — [eWeek](https://www.eweek.com/news/openai-chatgpt-images-2-0/), [Neurohive](https://neurohive.io/en/news/chatgpt-images-2-0-openai-launches-image-generation-model-with-reasoning-2k-resolution-and-multilingual-text/). Secondary sources report it took #1 on Image Arena at launch (S) — [TechWyse](https://www.techwyse.com/?p=75930)
- OpenAI's pricing page now also lists gpt-image-2.5-sunburst/-flare and gpt-image-2.6-sunburst/-flare (V) — [OpenAI pricing](https://developers.openai.com/api/docs/pricing). The guide positions "sunburst" for when "editing precision matters most" and "flare" for fast iteration. 2.5 adds `xhigh` and `max` quality levels, and access may require "API Organization Verification" (V) — [OpenAI image guide](https://developers.openai.com/api/docs/guides/image-generation)
- **OpenAI editing behaviour** (V) — [OpenAI image guide](https://developers.openai.com/api/docs/guides/image-generation):
  - Several reference images can be combined; the example uses four.
  - Masking is "entirely prompt-based" and the model "may not follow its exact shape with complete precision".
  - For gpt-image-2, `input_fidelity` must be omitted because the model "always applies high fidelity to inputs".
  - Custom sizes go up to a 3840 px edge, but "Resolutions above 2560x1440 are experimental".
- **Black Forest Labs.**
  - FLUX 3 was unveiled on 23 Jul 2026 as one multimodal model (image, video, audio, robot action) (S) — [StartupFortune](https://startupfortune.com/black-forest-labs-collapses-image-video-and-robot-control-into-a-single-model-with-flux-3/), [DataNorth](https://datanorth.ai/news/black-forest-labs-releases-flux-3)
  - The FLUX 3 Image API (endpoint tag 20261001) does text-to-image and image-to-image with up to 10 reference images and output up to 4K. No mask or inpainting parameter is listed (V) — [OpenRouter](https://openrouter.ai/black-forest-labs/flux-3-image)
  - FLUX 3 Image Klein has open weights: "5.6B parameters, runs on a single consumer GPU", with "image editing, text-to-image generation and multi-reference composition in a single set of weights". It takes up to ten references, and "bounding boxes handle layouts and targeted edits" (V) — [bfl.ai](https://bfl.ai/models/flux-3-image-klein)
  - BFL's pricing calculator still lists FLUX.2 [max]/[pro]/[flex]/[klein] 4B/9B. FLUX.1 Kontext is no longer listed (V) — [bfl.ai/pricing](https://bfl.ai/pricing)
- **Alibaba Qwen.** Qwen-Image-Edit-2511 (~20B parameters, Apache-2.0) is an "enhanced version over Qwen-Image-Edit-2509" (V) — [HF card](https://huggingface.co/Qwen/Qwen-Image-Edit-2511):
  - Improved consistency, with reduced "image drift" listed as a key enhancement.
  - Better "industrial design", including "material replacement for industrial components", and stronger geometric reasoning.
  - Popular LoRAs are built in: "Realistic lighting control is now achievable out-of-the-box" and "generating new viewpoints can now be done directly with the base model".

  A newer Qwen-Image-2.1 line is reported to be under a Qwen Research License, which bars commercial use without a separate agreement (S, third-party only) — [Apidog](https://apidog.com/blog/what-is-qwen-image-2-1/)
- **ByteDance.** Seedream 5.0 Pro (with an edit endpoint) and Seedream 5.0 Lite are sold through API resellers (S) — [Atlas Cloud](https://www.atlascloud.ai/models/explore/seedream-5-pro-lowest-price), [EmpirioLabs](https://empiriolabs.ai/models/seedream-5-0-pro). I did not find ByteDance/BytePlus's own model documentation.

**(3) Physically based rendering (no generative AI)**
- Blender is GPL, but "what you create with Blender is your sole property", so renders carry no licence encumbrance (K) — [blender.org/about/license](https://www.blender.org/about/license/). The Cycles path tracer is also available standalone under Apache-2.0 (K) — [cycles-renderer.org](https://www.cycles-renderer.org/). three.js (MIT) and three-gpu-pathtracer (MIT) can path-trace in the browser, which would serve the web client (K) — [three.js](https://github.com/mrdoob/three.js), [three-gpu-pathtracer](https://github.com/gkjohnson/three-gpu-pathtracer)
- Retailers that sell exact SKUs place real 3D models at true scale rather than regenerating them. Examples are Amazon Room Decorator (Aug 2020, ARKit) and Houzz View in My Room 3D (~2017, "300k+" 3D products "with realistic materials and textures") (S, older) — [Engadget](https://www.engadget.com/amazon-ar-shopping-furniture-home-decor-171005257.html), [Houzz blog](https://blog.houzz.com/houzz-brings-augmented-reality-to-home-design-and/)

**(4) Hybrid: products exact, AI only for the surroundings**
- Industry precedent: Amazon Ads' AI image generator (beta announced 25 Oct 2023, possibly outdated) keeps the advertiser's real product shot and generates the lifestyle scene around it ("puts fake backgrounds behind real products"). Amazon claims up to 40% higher click-through for lifestyle-context ads, a vendor claim (S) — [About Amazon](https://www.aboutamazon.com/md/news/innovation-at-amazon/amazon-ads-ai-powered-image-generator), [PetaPixel](https://petapixel.com/2023/10/25/amazons-new-ai-image-tool-puts-fake-backgrounds-behind-real-products), [Search Engine Land](https://searchengineland.com/amazon-ads-launches-ai-image-generation-433747). A Jan 2026 guide places it inside "Amazon AI Creative Studio" (S) — [beBOLD Digital](https://www.bebolddigital.com/blog/what-is-amazon-ai-creative-studio)
- Research on inserting a *given* object with correct light and shadow:
  - DiPIR (NVIDIA, ECCV 2024) uses a personalised diffusion model to guide physically based inverse rendering, aiming for consistent shadows and reflections while keeping object identity (S) — [arXiv 2408.09702](https://arxiv.org/abs/2408.09702)
  - SpotLight lets the user dictate the shadow of an inserted virtual chair and relights the object using pre-trained diffusion renderers, without retraining (S) — [arXiv 2411.18665](https://arxiv.org/html/2411.18665)
  - ObjectMate (Google/HUJI) reports better identity preservation. Its background step uses a counterfactual remover that also erases shadows and reflections (S) — [arXiv 2412.08645](https://arxiv.org/html/2412.08645v1)
  - ObjectStitch adjusts viewpoint, geometry, colour and shadow, relying on reference-image guidance to keep identity (S) — [arXiv 2212.00932](https://arxiv.org/pdf/2212.00932)
- Candidate open-weight harmonisers and relighters:
  - Qwen-Image-Edit-2511, with lighting control built in (Apache-2.0) (V) — [HF](https://huggingface.co/Qwen/Qwen-Image-Edit-2511)
  - IC-Light relighting. The repo is Apache-2.0, but the weight licences need checking (K) — [GitHub lllyasviel/IC-Light](https://github.com/lllyasviel/IC-Light)

**(5) Photoreal room capture with composited products**
- IKEA Kreativ (launched June 2022, possibly outdated) stitches several photos into a navigable, measured replica of the room. It erases existing furniture with AI and places true-to-scale IKEA products, and the output is a static, photo-based scene (S) — [VentureBeat](https://venturebeat.com/business/ikea-launches-first-ai-powered-design-experience-no-swedish-meatballs-included), [Furniture Today](https://www.furnituretoday.com/furniture-retailer/how-is-ikeas-new-platform-erasing-existing-furniture), [Gizmodo AU](https://gizmodo.com.au/?p=1796063)
- ARKit can take a "high quality, high resolution" still "at any time during a session" with pose information attached (`ARSession.captureHighResolutionFrame`, iOS 16+). That gives photographic backplates for compositing (V) — [Apple docs (JSON)](https://developer.apple.com/tutorials/data/documentation/arkit/arsession/capturehighresolutionframe(completion:).json)
- Gaussian splatting licences (K) — [graphdeco-inria](https://github.com/graphdeco-inria/gaussian-splatting), [gsplat](https://github.com/nerfstudio-project/gsplat), [Spark](https://github.com/sparkjsdev/spark). Reconstruction itself is covered by another researcher.
  - The original Inria implementation is licensed for non-commercial research and evaluation only.
  - gsplat is Apache-2.0.
  - Spark, World Labs' three.js splat renderer, is MIT.

### Inferences
- **Comparison matrix.** This is my synthesis. Costs and latencies come from Section 4 and are approximate.

| Approach | Room geometry | Product exactness (SKU) | Photorealism | Marginal cost / image | Typical latency | Licence / vendor risk | v1 fit |
|---|---|---|---|---|---|---|---|
| 1 ControlNet-type (depth/edge/seg) | Good, if depth/edges/masks are rendered from *our* 3D model at the chosen camera; textures are invented | Poor: products are re-synthesised unless a per-SKU fine-tune is added | Medium–high | ~$0.03/MP hosted (Qwen class) or own GPU | seconds to tens of seconds | Low with Apache models (Qwen); avoid FLUX.1 [dev] tools without a licence | No |
| 2 Instruction editor + references (Nano Banana, gpt-image, FLUX 3, Seedream, Qwen-Edit) | Soft control only; can shift windows and perspective (Section 2) | Approximate: drift in shape, colour and material | Highest | ~$0.03–0.21 | ~1 s to 2 min | API terms, data use, model churn | Inspiration mode only |
| 3 PBR render of the 3D scene | Exact to the scan's accuracy | Exact | Limited by room capture: parametric walls look "CG" | ~0 on device; cents on a server GPU | <1 s raster; seconds to minutes path-traced | Low (MIT/Apache/GPL tools) | **Yes** |
| 4 Hybrid (3 or 5, plus a masked AI pass, plus product re-composite) | Exact base, bounded AI changes | Exact (re-pasted pixels); risk only at shadow and contact edges | High | 3 + one API call | 3 + ~5–30 s | As for 2, but only on non-product pixels | Beta / v2 |
| 5 Captured photo or splat + composited products | Exact (it is a photo) | Exact | High (real photo) | ~0 | Fast | Low (choose permissive splat code) | **Yes, partly**: viewpoints limited to near capture positions |

- The team's literal proposal (screenshot of the 3D view → AI model → polished image) is approach 2. If the 3D room is a RoomPlan-style parametric shell, the model has to invent wall finishes, floor, window views and lighting, and it will also redraw the products. That produces "a beautiful room", not "your room with this SKU". Better inputs are the depth, edge and mask passes, the product reference images and the nearest real keyframe photos (Gemini accepts up to 14 references). The output then needs the products re-composited.
- Approaches 3, 4 and 5 share one pipeline: a virtual camera matched to the chosen view, product beauty and alpha passes, depth/normal/ID passes, a shadow catcher, and lighting from the AR probes. Building 3 or 5 for v1 therefore builds most of what 4 needs later.

### Gaps
- I found no public benchmark that compares these approaches on interior scenes against ground truth.
- Release dates and real differences for Nano Banana 2.1 and gpt-image-2.5/2.6 "sunburst/flare" are unknown beyond the doc wording.
- Seedream 5.0 primary documentation (reference-image limits, mask support) was not found.
- The exact licence text for FLUX 3 Image Klein was not read (see Section 4).
- IC-Light weight licences were not verified.

## 2. Fidelity: room geometry, placement and product identity

### Takeaway
Every current generative editor redraws the whole frame. Vendors themselves document weak layout precision and masks that are only guidance, and consumer redesign tools show failures with room angles, proportions and partly visible features. Geometry and SKU fidelity can therefore only be guaranteed by keeping exact rendered or photographed pixels for products, conditioning the AI on YoungVista's own geometry, and checking outputs automatically. Showing an AI-altered product as the item being sold is a commerce and regulatory risk.

### Cited Findings
- OpenAI's documented limitations (V) — [OpenAI image guide](https://developers.openai.com/api/docs/guides/image-generation):
  - "Composition Control": the model "may have difficulty placing elements precisely in structured or layout-sensitive compositions".
  - "Consistency": it "may occasionally struggle to maintain visual consistency for recurring characters or brand elements".
  - Masks are "entirely prompt-based" and may not be followed "with complete precision".
  - Higher "complexity" "can increase latency" and can bring unwanted changes.
- Gemini docs describe editing only through text prompts, with no mask or inpainting control. The docs' own example prompt adds "Do not change any other elements of the image", so preservation depends on the prompt (V) — [Gemini docs](https://aistudio.google.com/docs/image-generation)
- Qwen-Image-Edit-2511 lists reducing "image drift" as a key enhancement over 2509, an admission that drift is a known issue in this class (V) — [HF card](https://huggingface.co/Qwen/Qwen-Image-Edit-2511)
- Structure-conditioned models still lose fine detail: Qwen-Image ControlNet Union cannot keep small text without prompting (V) — [HF card](https://huggingface.co/InstantX/Qwen-Image-ControlNet-Union)
- Consumer evidence:
  - Dwell's hands-on review of Wayfair Muse found unrealistic results to be the biggest drawback. It struggled with room angles, proportion and features only partly visible in the photo (S) — [Dwell](https://www.dwell.com/article/wayfair-ai-muse-review-e0a7fbd4)
  - Geo Week News (Sep 2025) warns that AI inpainting of the kind behind Matterport's Defurnish still makes errors (S) — [Geo Week News](https://www.geoweeknews.com/news/sometimes-a-quick-look-is-all-you-need)
  - A 2022 IKEA Kreativ review saw artifacts around inserted and erased furniture (S, old) — [Mixed News](https://mixed-news.com/en/?p=6088)
- Staging explainers (S, vendor) — [Sofabrain](https://sofabrain.com/learn/how-does-ai-virtual-staging-work), [virtualstaging.art](https://virtualstaging.art/blog-posts/howdoesvirtualstagingwork):
  - Overly aggressive generation "modifies parts of the property that should stay fixed — walls, windows, ceiling height, room dimensions".
  - Staging "may not accurately represent the natural lighting conditions or views from windows".
- Research:
  - Identity preservation and natural composition pull against each other. Strong identity injection freezes awkward poses, while weaker injection loses fidelity (SHINE) (S) — [arXiv 2509.21278](https://arxiv.org/html/2509.21278v4)
  - In driving-scene editing, a diffusion refinement pass "can introduce mild hallucinations, e.g., slightly degrading geometric consistency". The paper measured geometry before and after, a usable template for a drift check (S, different domain) — [arXiv 2512.17445](https://arxiv.org/pdf/2512.17445)
- "Similar, not exact" is the norm in generative redesign. Decorify linked its images to the *closest-matching* Wayfair products (S) — [Chain Store Age](https://chainstoreage.com/wayfair-creates-shoppable-home-images-generative-ai). Muse surfaces "complementary items" (V) — [Wayfair press release](https://www.aboutwayfair.com/category/company-news/wayfair-introduces-new-ai-powered-tool-muse-to-inspire-and-personalize-the-home-shopping-experience)
- Mitigation levers now offered by the models:
  - Up to 10 object references on Nano Banana 2/2.1 (V) — [Gemini docs](https://aistudio.google.com/docs/image-generation)
  - Up to 10 references plus bounding-box layout and targeted edits on FLUX 3 Image Klein, whose weights can be fine-tuned within the licence (V) — [bfl.ai](https://bfl.ai/models/flux-3-image-klein)
  - Always-high input fidelity on gpt-image-2 (V) — [OpenAI guide](https://developers.openai.com/api/docs/guides/image-generation)
  - Depth, canny and soft-edge conditioning under Apache-2.0 (V) — [Qwen ControlNet Union](https://huggingface.co/InstantX/Qwen-Image-ControlNet-Union)
- Commerce rules:
  - Google Merchant Center requires AI-generated product images to keep IPTC `DigitalSourceType = trainedAlgorithmicMedia` metadata, and its misrepresentation policy applies regardless of tool (S, rule dated Feb 2024) — [Google Merchant Center help](https://support.google.com/merchants/answer/14572008), [Search Engine Land](https://searchengineland.com/google-wants-you-to-label-ai-generated-images-used-in-merchant-center-437645)
  - The EU Unfair Commercial Practices Directive prohibits misleading information about a product's "main characteristics" (K) — [Directive 2005/29/EC](https://eur-lex.europa.eu/eli/dir/2005/29/oj)
  - A June 2026 aggregator report says AI-generated product images in Amazon search drew shopper complaints (S, low-confidence source) — [Pulse](https://www.pulse.bot/ecommerce/news/amazon-adds-aigenerated-product-images-to-search-sparking-shopper-concerns-3691a97d-ef72-449d-8c05-b2e3e57a9f16/)

### Inferences
- **Expected failure modes when a generative pass touches the whole frame:**
  - Windows or doors shift, merge or disappear.
  - Ceiling height or wall angles change, or a wide-angle look is "corrected" into a different perspective.
  - Products are subtly resized relative to the room, which breaks the measurement promise.
  - Fabric colour or texture drifts, leg or arm shapes simplify, and hardware or handles change.
  - Clutter is invented, and the window view is replaced with generic scenery.
- **Mitigation stack, strongest first:**
  1. Never let the model decide placement or scale. Placement, scale and camera come from the 3D scene, and the model receives conditioning rendered from that same camera (depth, normals, edges, wall/window/door segmentation, product mask).
  2. Lock product pixels. After generation, re-composite the exact product render or alpha over the output. Let the AI change only a dilated ring and the floor region, for contact shadows and reflections.
  3. Protect structure. Use wall, window and door masks from RoomPlan or the ARKit mesh classification as do-not-edit regions, or as a strong edge constraint.
  4. Give product references: multiple-angle hero shots and material swatches. Use per-SKU fine-tunes only for best-sellers.
  5. Run automated QA:
     - Compare edges and depth of the output (estimated with monocular depth) against the conditioning passes.
     - Score product-region similarity (perceptual distance, colour ΔE) against the exact render.
     - Reject and retry, or fall back to the deterministic render.
  6. UX: label the image "AI-enhanced visualisation", show the exact render beside it or behind a toggle, and keep provenance metadata.
  7. Log every render request (scene version, SKUs and variants, camera, model and version, prompt, seed, masks) so "that's not what I bought" complaints can be audited.
- Even with re-compositing, the remaining risk is lighting: the product's shading must match the AI-relit room. Either relight the product in the PBR pass with the same environment light, or allow a narrowly bounded harmonisation, accepting slight tone changes. Colour accuracy of upholstery is the most commercially sensitive part.

### Gaps
- I found no quantitative public benchmark of window/door/wall preservation by current editors (Nano Banana 2.1, gpt-image-2.x, FLUX 3, Seedream 5, Qwen-Edit-2511) on interior photos, and no measured SKU-fidelity rates.
- I found no FTC or EU guidance specific to AI room or furniture visualisations; only general misrepresentation rules apply.

## 3. Existing products doing similar things

### Takeaway
There are two families:
- **Exact-SKU visualisers** (IKEA Kreativ, Amazon Room Decorator, Houzz 3D) use real 3D models over photos or AR. Where they use AI, it is on the room (erasing, inpainting), not on the product.
- **Generative redesign tools** (Wayfair Decorify → Muse, RoomGPT, Reimagine Home, Collov, Spacely) produce inspiration images and link to "closest-matching" or "complementary" products.

No consumer product found combines a phone scan, metric room geometry, exact SKUs and a generated photoreal final image. That is YoungVista's opening, and the gap may also signal how hard faithful generative visualisation is.

### Cited Findings
**IKEA Kreativ**
- Launched June 2022 in the US (web and iOS first) as an "AI-powered design experience". It builds a 3D replica of the customer's own room, removes existing furniture and places true-to-scale IKEA products (S) — [VentureBeat](https://venturebeat.com/business/ikea-launches-first-ai-powered-design-experience-no-swedish-meatballs-included), [IKEA US newsroom](https://ikea.com/us/en/newsroom/corporate-news/ikea-launches-new-ai-powered-digital-experience-empowering-customers-to-create-lifelike-room-designs-pub58c94890)
- The technology came from Geomagical Labs, which Ingka (IKEA's parent group) acquired in 2020. The scan stitches several photos into a navigable, measured replica (S) — [Furniture Today](https://www.furnituretoday.com/furniture-retailer/how-is-ikeas-new-platform-erasing-existing-furniture), [CB Insights](https://www.cbinsights.com/company/geomagical-labs)
- Output is a static, photo-based scene, not live AR (S) — [Gizmodo AU](https://gizmodo.com.au/?p=1796063)
- A 2022 review reported artifacts around inserted and erased furniture (S) — [Mixed News](https://mixed-news.com/en/?p=6088)
- UK launch around Feb 2023 (S) — [IKEA GB newsroom](https://www.ikea.com/gb/en/newsroom/stories/ikea-kreativ-launches-making-home-design-even-easier-and-more-accessible-for-the-many-pub71d09380). By 2026 it was folded into the main IKEA app as an AI design feature, at least in Belgium; the exact date is uncertain (S) — [RetailDetail BE](https://www.retaildetail.be/nl/news/wonen/ikea-app-helpt-inrichten-met-artificiele-intelligentie/)
- Some coverage uses the Kreativ name for a separate IKEA "AI Assistant" GPT in OpenAI's GPT Store, so check which product a source means (S) — [B&T](https://www.bandt.com.au/ikea-launches-cutting-edge-ai-interior-designer-feature/)

**Matterport (CoStar)**
- The Fall 2024 release (possibly outdated) added generative-AI "Defurnish", which removes furniture and clutter from captured spaces, plus AI-written property descriptions (S) — [Matterport news](https://matterport.com/news/matterport-fall-2024-release-insights-meets-imagination-elevates-the), [HousingWire](https://housingwire.com/articles/matterport-ai-defurnish-photos-property-descriptions)
- Defurnish works in 3D, so the room can be toured defurnished, and it uses semantic segmentation to find furniture (S, Oct 2024) — [The Real Deal](https://therealdeal.com/san-francisco/2024/10/01/will-ai-ease-resi-agent-pain-points/)
- CoStar completed its acquisition on 28 Feb 2025 (~$1.6B) (S) — [BusinessWire](https://www.businesswire.com/news/home/20250228873241/en/CoStar-Group-Completes-Acquisition-of-Matterport-Ushering-in-a-New-Era-of-3D-Digital-Twins-and-AI-Powered-Real-Estate-Innovation). In Feb 2026 CoStar launched "Homes AI" on Homes.com, with Matterport 3D data as one input (S) — [RISMedia](https://www.rismedia.com/2026/02/17/costar-launches-ai-experience-refining-future-home-shopping/)

**Wayfair**
- Decorify was a July 2023 US pilot. Users upload a room photo and pick a style, and get photoreal, "shoppable" images linked to the *closest-matching* Wayfair products (S) — [Wayfair](https://www.aboutwayfair.com/category/company-news/wayfair-launches-decorify-a-virtual-room-styler-powered-by-generative-ai), [Chain Store Age](https://chainstoreage.com/wayfair-creates-shoppable-home-images-generative-ai)
- Muse was announced on 11 Feb 2025 as a generative-AI inspiration and search tool (V) — [Wayfair press release](https://www.aboutwayfair.com/category/company-news/wayfair-introduces-new-ai-powered-tool-muse-to-inspire-and-personalize-the-home-shopping-experience):
  - Users browse AI images, shop "complementary items" and save collections, and can upload a photo of their own room to apply a saved style.
  - The release names no model or partner, makes no exact-SKU claim, includes no AI disclaimer, and calls Decorify a "previous pilot".
- Trade press says Muse replaced Decorify (S) — [Furniture Today](https://www.furnituretoday.com/e-commerce/wayfair-retools-its-consumer-ideation-experience-replacing-decorify-with-muse). Dwell's review found it struggled with angles and proportions but helped users pick a direction from a blank slate (S) — [Dwell](https://www.dwell.com/article/wayfair-ai-muse-review-e0a7fbd4)

**Amazon**
- Room Decorator (Aug 2020) places several furniture and decor items in the real room in AR. It is ARKit-based and iOS-first, and users can save layouts (S, old) — [Engadget](https://www.engadget.com/amazon-ar-shopping-furniture-home-decor-171005257.html), [Retail Dive](https://www.retaildive.com/news/amazon-debuts-ar-tool-for-viewing-multiple-furniture-items-in-one-room/584171)
- Showroom (2019) uses a provided virtual room, not the shopper's own (S) — [TechRadar](https://techradar.com/uk/news/amazon-showroom-gives-you-a-glimpse-of-your-virtual-dream-home)
- I found no Amazon generative feature that renders products into the customer's own room as of late 2026. The related ad tool is described in Section 1(4).

**Houzz**
- "View in My Room" (2016) covered more than 1.8M catalog items. "View in My Room 3D" (~2017) covers 300k+ 3D products with realistic materials. I found no generative-AI visualiser (S, old) — [Home Textiles Today](https://www.hometextilestoday.com/industry-news/houzz-digs-virtual-reality), [Houzz blog](https://blog.houzz.com/houzz-brings-augmented-reality-to-home-design-and/)

**RoomGPT, Reimagine Home, Collov, Spacely and Shopify apps**
- RoomGPT is MIT open source with ~10.7k stars and uses ControlNet on Replicate. The repo is the "previous and open source version"; roomGPT.io is now a paid SaaS (V) — [GitHub](https://github.com/Nutlope/roomGPT)
- Reimagine Home claims photoreal makeovers from a room photo that respect geometry and lighting, plus matched shoppable products. It sells a Shopify app so retailers can show their products in shoppers' rooms (S, vendor) — [reimaginehome.ai](https://reimaginehome.ai/answers/ai-interior-design), [Shopify App Store](https://apps.shopify.com/reimaginehome-room-visualizer)
- Collov AI does virtual staging and redesign from a single room photo; it is US-based and founded in 2020 (S) — [Softwarefinder](https://softwarefinder.com/artificial-intelligence/collov-ai)
- Spacely AI costs about $20/month for 500 credits and moved from unlimited renders to credits in late 2025 (S) — [rework.com guide](https://resources.rework.com/ja/tools/ai-tools/best-ai-interior-design-tools-2026)
- Shopify apps such as "My Room Visualiser" let a store show its own products in a shopper's room photo (S) — [Shopify App Store](https://apps.shopify.com/my-room-visualiser)

### Inferences
- The players that must show the exact item (IKEA, Amazon, Houzz) render real 3D assets and confine AI to the room. That is approaches 3, 4 and 5, which supports the hybrid design.
- Wayfair's move from Decorify, a faithful-ish restyle linked to similar products, to Muse, an inspiration and search tool, may indicate that faithful generative visualisation of real SKUs was hard to deliver at retail quality. This is a low-confidence reading.
- YoungVista's differentiator could be "your measured room, the exact product, a magazine-quality image". That bar is higher than any competitor found.

### Gaps
- Interior AI (Pieter Levels) was not researched for budget reasons.
- No details were found on Matterport "Project Genesis" or post-acquisition Defurnish pricing.
- Wayfair Muse's model, whether it is still live, and Wayfair's data on generative imagery and purchases were not read — [Retail Dive](https://www.retaildive.com/news/wayfair-generative-ai-imagery-irl-purchases/739874).
- Not researched: Pinterest, Target, Lowe's, Home Depot, Google Shopping, Homestyler, Planner 5D, Coohom, Havenly, Decor8 AI, Roomvo.
- No independent quantitative quality tests were found. Apart from Wayfair, which shows none, competitors' disclaimers were not checked.

## 4. Cost, latency, self-hosting and licences, and privacy

### Takeaway
At list price, a ~1–2 MP final image costs about $0.03 (Nano Banana 2.1 or 2 Lite, Qwen-Edit hosted on fal, Seedream Lite) to $0.13–0.21 (Nano Banana Pro, gpt-image-2 "high"). Third-party reports put typical latency at about 1–15 s, and OpenAI documents a worst case of 2 minutes. Only Apache-licensed weights can be self-hosted commercially without a vendor licence: Qwen-Image-Edit-2511, FLUX.2 [klein] 4B and the Qwen ControlNet. On privacy:
- Google's paid tier and OpenAI do not train on API data. BFL may retain and use inputs unless the user opts out.
- Gemini's terms bar apps likely to be used by under-18s.
- Apple requires explicit consent before personal data goes to third-party AI.
- EU AI Act marking duties apply from 2026.

### Cited Findings
**Price per image (list prices on 2026-11-05)**
- **Google Gemini API.** No free tier for any image model (V) — [Gemini pricing](https://aistudio.google.com/docs/pricing):
  - Nano Banana 2.1: 1K $0.0336, 2K $0.0504, 4K $0.113; batch is half (1K $0.0168).
  - Nano Banana 2: 0.5K $0.045, 1K $0.067, 2K $0.101, 4K $0.151.
  - Nano Banana 2 Lite: 1K $0.0336 (batch $0.0168).
  - Nano Banana Pro: 1K/2K $0.134, 4K $0.24; input images $0.0011 each.
  - Legacy 2.5 Flash Image: $0.039 (shutdown 15 Mar 2027).
  - The docs add that "thinking tokens are billed by default for thinking models" (V) — [docs](https://aistudio.google.com/docs/image-generation)
- **OpenAI gpt-image-2**, output cost per image (V) — [OpenAI image guide](https://developers.openai.com/api/docs/guides/image-generation), [pricing](https://developers.openai.com/api/docs/pricing):
  - 1024×1024: low $0.006, medium $0.053, high $0.211.
  - 1536×1024 or 1024×1536: low $0.005, medium $0.041, high $0.165.
  - Edits also pay image-input tokens at $8 per 1M; batch is half price.
  - The 2.5 and 2.6 sunburst/flare variants are billed per token ($30 per 1M output tokens) with no per-image table.
  - Older models: gpt-image-1.5 high is $0.133–0.20, gpt-image-1-mini high is $0.036–0.052.
- **BFL.**
  - FLUX 3 Image starts at $0.041 per image (V) — [OpenRouter](https://openrouter.ai/black-forest-labs/flux-3-image)
  - BFL's own calculator shows $0.048 per image without naming the model. It says "No subscriptions, no seat fees" (V) — [bfl.ai/pricing](https://bfl.ai/pricing)
  - BFL states "All images generated through the BFL API include full commercial usage rights" (V) — [BFL help](https://help.bfl.ai/articles/4375863104-can-i-use-the-api-for-a-commercial-application)
- **Seedream 5.0**, reseller prices only (S) — [Atlas Cloud](https://www.atlascloud.ai/models/explore/seedream-5-pro-lowest-price), [EmpirioLabs](https://empiriolabs.ai/models/seedream-5-0-pro), [AIMLAPI](https://aimlapi.com/models/seadream-5-0-lite):
  - Pro: $0.036–0.075 per image. Resellers cite an "official" $0.045 that I could not verify.
  - Lite: about $0.035–0.046.
- **Qwen-Image-Edit-2511 hosted on fal:** "$0.03 per megapixel", tagged "Commercial use" (V) — [fal.ai](https://fal.ai/models/fal-ai/qwen-image-edit-2511)

**Latency (third-party reports from Mar–May 2026; conditions unclear)**
- Nano Banana 2 takes about 1–3 s in one ranking and about 2–5 s in another. Nano Banana Pro takes about 10–15 s (S) — [DEV ranking](https://dev.to/skilaai/i-ranked-every-ai-image-model-by-speed-the-001-one-crushed-gpt-image-2-4ee5), [Flowith](https://flowith.io/blog/5-reasons-nano-banana-fastest-4k-image-generator), [DEV post](https://dev.to/brooks_wilson_36fbefbbae4/gpt-image-2-what-it-is-what-it-can-do-and-why-its-different-from-every-ai-image-tool-that-came-5068)
- gpt-image-2 is about 15 s for simple prompts and 40–60 s for complex ones in one ranking; another post says about 3 s in "instant" mode. These conflict (S) — same sources. OpenAI's own docs say "Complex prompts may take up to 2 minutes to process" (V) — [OpenAI guide](https://developers.openai.com/api/docs/guides/image-generation)
- Seedream 5 Lite takes about 2 s and FLUX 1.1 Pro about 5–10 s (S) — [DEV ranking](https://dev.to/skilaai/i-ranked-every-ai-image-model-by-speed-the-001-one-crushed-gpt-image-2-4ee5). FLUX.2 [klein] is described as generating images "in less than a second" (S, headline) — [VentureBeat](https://venturebeat.com/technology/black-forest-labs-launches-open-source-flux-2-klein-to-generate-ai-images-in)
- Gemini 3-class image models always "think", which can't be disabled in the API, so latency is traded against quality through thinking levels (V) — [Gemini docs](https://aistudio.google.com/docs/image-generation)

**Self-hosting and licences (commercial use?)**

| Model / tool | Licence | Commercial use | Source |
|---|---|---|---|
| Qwen-Image-Edit-2511 (~20B) | Apache-2.0 | Yes | (V) [HF](https://huggingface.co/Qwen/Qwen-Image-Edit-2511) |
| InstantX Qwen-Image-ControlNet-Union | Apache-2.0 | Yes | (V) [HF](https://huggingface.co/InstantX/Qwen-Image-ControlNet-Union) |
| Qwen-Image-2.1 | Reported Qwen Research License | No, without a separate agreement | (S) [Apidog](https://apidog.com/blog/what-is-qwen-image-2-1/) |
| FLUX.2 [klein] 4B | Apache-2.0 | Yes ("fully open, no restrictions") | (V) [BFL help](https://help.bfl.ai/articles/4375863104-can-i-use-the-api-for-a-commercial-application) |
| FLUX.2 [klein] 9B, FLUX.2 [dev], FLUX.1 Kontext [dev] | FLUX Non-Commercial | No, without a BFL licence | (V) [BFL help](https://help.bfl.ai/articles/4375863104-can-i-use-the-api-for-a-commercial-application) |
| FLUX.1 Depth/Canny [dev] | FLUX.1 [dev] Non-Commercial | No, without a BFL licence | (K) [HF](https://huggingface.co/black-forest-labs/FLUX.1-Depth-dev) |
| FLUX 3 Image Klein (5.6B) | Licence on the HF card; reportedly the "FLUX Kommunity License" | Product use needs a commercial licence: "Running Klein in a product needs a commercial license" | (V) [bfl.ai](https://bfl.ai/models/flux-3-image-klein); name (S) [zeli](https://zeli.app/story/50123580) |
| BFL commercial self-host tiers | Builder 10K images/month, Platform/Professional 100K/month, Enterprise custom; prices not public | Yes, under licence | (V) [bfl.ai/pricing](https://bfl.ai/pricing) |
| SDXL + SDXL ControlNets | CreativeML Open RAIL++-M | Yes, with use restrictions | (K) [HF](https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0) |
| Stable Diffusion 3.5 | Stability AI Community License | Yes, below $1M annual revenue | (K) [stability.ai](https://stability.ai/license) |
| ControlNet reference code | Apache-2.0 | Yes | (K) [GitHub](https://github.com/lllyasviel/ControlNet) |
| RoomGPT (app code) | MIT | Yes | (V) [GitHub](https://github.com/Nutlope/roomGPT) |
| Blender / Cycles standalone | GPL (outputs are yours) / Apache-2.0 | Yes | (K) [Blender](https://www.blender.org/about/license/), [Cycles](https://www.cycles-renderer.org/) |
| three.js / three-gpu-pathtracer | MIT / MIT | Yes | (K) [three.js](https://github.com/mrdoob/three.js), [pathtracer](https://github.com/gkjohnson/three-gpu-pathtracer) |
| Inria 3D Gaussian Splatting | Non-commercial research licence | No | (K) [GitHub](https://github.com/graphdeco-inria/gaussian-splatting) |
| gsplat / Spark | Apache-2.0 / MIT | Yes | (K) [gsplat](https://github.com/nerfstudio-project/gsplat), [Spark](https://github.com/sparkjsdev/spark) |
| IC-Light | Repo Apache-2.0; check weights | Code yes; weights unverified | (K) [GitHub](https://github.com/lllyasviel/IC-Light) |

**Privacy and compliance for sending photos of homes to APIs**
- **Gemini API terms** (effective 23 Mar 2026) (V) — [Gemini API terms](https://aistudio.google.com/docs/terms):
  - Unpaid tier: content is used to "improve, and develop Google products", "human reviewers may read" it, and users are told "Do not submit sensitive, confidential, or personal information".
  - Paid tier: prompts and responses are not used to improve products, but they are logged "for a limited period of time" for abuse detection.
  - Apps offered in the EEA, Switzerland or the UK must use paid services.
  - Users must be 18+, and API clients "directed towards or likely to be accessed by individuals under the age of 18" are barred.
  - The pricing page confirms paid tier = "Content not used to improve our products" (V) — [pricing](https://aistudio.google.com/docs/pricing)
- **OpenAI API** (V) — [OpenAI "Your data"](https://developers.openai.com/api/docs/guides/your-data):
  - Data "is not used to train or improve OpenAI models" unless you opt in, and abuse-monitoring logs are kept "up to 30 days".
  - `/v1/images/generations` and `/v1/images/edits` are eligible for Zero Data Retention with prior approval. Eligible models are gpt-image-2, the 2.5 sunburst/flare variants, 1.5 and 1-mini, but not gpt-image-1.
  - Images flagged as potential CSAM are retained for manual review even under ZDR.
  - EU data residency for image endpoints "requires approval for enhanced Zero Data Retention or enhanced Modified Abuse Monitoring".
- **BFL.** The privacy notice was revised 1 Aug 2026. Inputs "may be retained and used", opting out of training is done by email, and enterprise contracts are governed separately (S) — [BFL privacy policy](https://bfl.ai/privacy-policy). The pricing page shows ISO 27001:2022 and SOC 2 Type II badges (V) — [bfl.ai/pricing](https://bfl.ai/pricing)
- **Apple App Review Guideline 5.1.2(i)** (V) — [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/):
  - "You must clearly disclose where personal data will be shared with third parties, including with third-party AI, and obtain explicit permission before doing so."
  - Guideline 1.2 adds moderation duties (filtering, reporting, blocking) for AI content-creation apps that host user content.
- **EU AI Act Article 50** transparency obligations, including machine-readable marking of synthetic images, apply from 2 Aug 2026 (S) — [Messaging Architects](https://messagingarchitects.com/?p=12400). The 7 May 2026 Digital Omnibus deal reportedly moved the Art. 50(2) marking deadline to 2 Dec 2026, but only for systems on the market before 2 Aug 2026 (S) — [Taylor Wessing](https://taylorwessing.com/en/insights-and-events/insights/2026/05/the-eu-digital-omnibus-on-ai-what-the-political-deal-means). Sources conflict on the final dates and on formal adoption, so check EUR-Lex.
- **Provenance marks:** every Gemini image carries SynthID (V) — [Gemini docs](https://aistudio.google.com/docs/image-generation). OpenAI images carry C2PA metadata (K) — [OpenAI help](https://help.openai.com/en/articles/8912793-c2pa-in-chatgpt-images)

### Inferences
- **Illustrative monthly cost** (my arithmetic, list prices). 30,000 final images a month cost about $1,000 on Nano Banana 2.1 at 1K, about $2,000 at Nano Banana 2 1K, about $4,000 on Nano Banana Pro, and about $6,300 on gpt-image-2 "high" at 1024². Users usually regenerate 2–3 times, so the cost per *accepted* image is roughly 2–3× list.
- Latency of 5–60 s rules out a synchronous "tap and wait" on slow models. Design it as an async job with a progress state and a push notification, and show the deterministic render immediately.
- **Self-hosting** Apache models (Qwen-Image-Edit-2511, FLUX.2 [klein] 4B) is the only path where home photos never reach a third-party model provider and no per-image vendor fee applies. The GPU cost and break-even were not researched (gap). A hosted Apache model on fal at about $0.03/MP is a middle ground: the data still goes to a third party, but there is no model-vendor lock-in.
- Treat model choice as swappable. In 2026 alone Google shipped Nano Banana 2, 2 Lite and 2.1 and is retiring 2.5 Flash Image; OpenAI lists six or more image models; BFL went from FLUX.2 to FLUX 3. Put a provider-abstraction layer and a fixed evaluation set in place from day one.
- A home photo can show faces, family photos, documents, screens, valuables and address clues, which is personal data under GDPR if a person is identifiable. Apple's rule plus Gemini's under-18 clause mean the AI feature needs a separate opt-in. It may need an age gate or a different provider, and should blur faces and documents on the device before upload. Legal review is needed.

### Gaps
- BytePlus (Seedream) official pricing and data terms, and Alibaba Model Studio (Qwen API) data terms, were not found.
- BFL's API retention period and Gemini's abuse-log retention period are not stated ("limited period").
- No independent, like-for-like latency benchmark for editing requests with 4–10 reference images at 2K exists in what I found; all latency figures are third-party and may be outdated.
- GPU cost per image for self-hosted Qwen-Edit-2511, FLUX 3 Klein or Blender Cycles was not researched.
- Release dates for Nano Banana 2.1 and gpt-image-2.5/2.6 were not found.
- The exact FLUX 3 Image Klein licence text and at-scale threshold were not read.

## 5. What YoungVista should capture now to enable this later

### Takeaway
Capture is the decision that can't be undone. Renders can be regenerated later with better models only if each scan stored calibrated photos, camera poses, depth, lighting and semantics, and each placement stored the exact SKU, variant, asset version and transform. Storing this now is cheap; recovering it later means asking customers to rescan.

### Cited Findings
**iOS (ARKit / RoomPlan)**
- `captureHighResolutionFrame` (iOS 16+) (V) — [Apple JSON doc](https://developer.apple.com/tutorials/data/documentation/arkit/arsession/capturehighresolutionframe(completion:).json):
  - Returns an `ARFrame` with "a high quality, high resolution" `capturedImage` while still filling in "pose information, anchors, and frame semantics".
  - Can be called "at any time during a session" without disturbing the normal frame stream, and can fail if a capture is already in progress.
  - Resolution comes from the session's video format; Apple recommends `recommendedVideoFormatForHighResolutionFrameCapturing`.
  - The ~12 MP figure is from WWDC22 (K) — [WWDC22 "Discover ARKit 6"](https://developer.apple.com/videos/play/wwdc2022/10126/)
- ARKit 6 also added a 4K video format and camera control of exposure and white balance. Locking these gives consistent keyframes (K) — [WWDC22](https://developer.apple.com/videos/play/wwdc2022/10126/)
- Per-frame `ARCamera.transform` (4×4 world pose), `intrinsics` (3×3, pixels), `imageResolution` and exposure values (K) — [ARCamera.intrinsics](https://developer.apple.com/documentation/arkit/arcamera/intrinsics), [transform](https://developer.apple.com/documentation/arkit/arcamera/transform)
- LiDAR depth (iOS 14+): `sceneDepth` / `smoothedSceneDepth` provide a Float32 depth map in metres plus a confidence map. The commonly cited size of 256×192 was not verified (K) — [ARFrame.sceneDepth](https://developer.apple.com/documentation/arkit/arframe/scenedepth), [ARDepthData](https://developer.apple.com/documentation/arkit/ardepthdata)
- Lighting (K) — [ARLightEstimate](https://developer.apple.com/documentation/arkit/arlightestimate), [AREnvironmentProbeAnchor](https://developer.apple.com/documentation/arkit/arenvironmentprobeanchor):
  - In world tracking, `ARLightEstimate` gives only ambient intensity and colour temperature. Directional and spherical-harmonics estimates are face-tracking only.
  - `AREnvironmentProbeAnchor` provides an environment cube map, optionally HDR. This is the best light probe on iOS.
- `ARMeshAnchor` classification (LiDAR, iOS 13.4+) labels faces as wall, floor, ceiling, table, seat, window or door: free coarse segmentation (K) — [ARMeshClassification](https://developer.apple.com/documentation/arkit/armeshclassification)
- RoomPlan `CapturedRoom` lists walls, doors, windows, openings and objects with dimensions and transforms, and exports USDZ. iOS 17 added multi-room `CapturedStructure` and the option to run RoomPlan on the app's own `ARSession`, so frames, high-res stills and depth can be grabbed during the RoomPlan scan (K) — [CapturedRoom](https://developer.apple.com/documentation/roomplan/capturedroom), [WWDC23 10192](https://developer.apple.com/videos/play/wwdc2023/10192/)

**Android (ARCore)**
- Depth API (V) — [ARCore Depth](https://developers.google.com/ar/develop/depth):
  - Uses a "depth-from-motion algorithm" and merges a ToF sensor if present.
  - Range is 0–65 m, most accurate at 0.5–5 m.
  - "Valid depth data are only available after the user has started moving their device".
  - Device-limited; see [supported devices](https://developers.google.com/ar/devices).
  - A raw depth plus confidence mode also exists (K) — [raw depth](https://developers.google.com/ar/develop/java/depth/raw-depth)
- Lighting (V) — [ARCore lighting estimation](https://developers.google.com/ar/develop/lighting-estimation):
  - Environmental HDR mode gives a main directional light (direction and intensity), ambient spherical harmonics and an HDR cubemap.
  - Ambient Intensity mode is "a coarse setting".
- The Scene Semantics API "supports outdoor scenes only and is not intended for indoor use cases", so there is no free indoor segmentation on Android (V) — [ARCore Scene Semantics](https://developers.google.com/ar/develop/scene-semantics)
- Pose and intrinsics come from `Camera.getPose()` and `getImageIntrinsics()` (K) — [CameraIntrinsics](https://developers.google.com/ar/reference/java/com/google/ar/core/CameraIntrinsics). The Recording & Playback API records camera, IMU and custom tracks to MP4 for later reprocessing (K) — [docs](https://developers.google.com/ar/develop/recording-and-playback)

**Storage conventions**
- glTF 2.0 uses metres, right-handed axes and +Y up, matching ARKit/ARCore world space. Its perspective camera stores only yfov, aspect ratio and clip planes, so a full intrinsics matrix needs `extras` (K, plus my inference) — [glTF 2.0 spec](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html)
- Nerfstudio's `transforms.json` format (fl_x, fl_y, cx, cy, w, h, plus a per-frame transform_matrix) is a common interchange format for later splat or NeRF reconstruction (K) — [Nerfstudio data conventions](https://docs.nerf.studio/quickstart/data_conventions.html)

### Inferences — proposed capture and data schema (v1)
- **Per scan:**
  - Device, OS and SDK versions; world convention (metres, Y-up, gravity-aligned); scan ID and version.
  - Room geometry (RoomPlan `CapturedRoom` JSON plus USDZ on LiDAR iPhones; the app's own mesh or plane model elsewhere).
  - Classified mesh where available.
- **Keyframes** (automatic every N cm or degrees of motion, plus a few user-prompted "hero" stills from likely viewpoints):
  - A high-res RGB image (`captureHighResolutionFrame` on iOS; the best CPU image on Android).
  - 4×4 pose, intrinsics (fx, fy, cx, cy, w, h), exposure, ISO, white balance (lock them during capture), timestamp and tracking state.
  - Depth plus confidence (16-bit PNG or EXR) where available.
- **Lighting:** 2–4 HDR environment cubemaps (ARKit probes / ARCore Environmental HDR), plus ARCore main light and spherical harmonics. Window and door positions serve as daylight hints. Optionally record time of day.
- **Placements:**
  - Product SKU and variant (fabric or colour), GLB asset ID plus content hash and version, real-world dimensions.
  - 4×4 transform in room coordinates, a scale lock (no user scaling of real SKUs), and timestamp.
  - Catalog-side reference pack per SKU (multi-angle hero photos, material swatches) for later reference conditioning; another researcher covers product-model sourcing.
- **Per render request:** virtual camera (pose, FOV/intrinsics, resolution), scene version, renderer or provider plus model ID and version, prompt, seed, masks and passes, output, QA scores. This is the audit trail.
- **Consent and privacy:** a separate opt-in flag for cloud AI processing, on-device face and document blurring before upload, a retention policy and deletion support. Keyframes are the most sensitive data YoungVista will hold.
- **Cross-topic notes for other researchers (brief):** ARCore indoor semantics is not available and depth is device-dependent, so Android needs server-side or own-model segmentation and depth estimation. RoomPlan-on-own-ARSession (iOS 17) lets one scan produce both the parametric model and the photo and depth set.

### Gaps
- Exact high-res frame sizes per device, ARKit depth resolution and ARCore depth image size were not confirmed on primary pages.
- On-device storage and upload size per scan (e.g., 50–150 high-res keyframes plus depth) was not estimated with data; it needs a prototype measurement.

## 6. Recommendation: minimal v1 vs later, with risks

### Takeaway
Do **not** make a generative "AI final image" a v1 promise. Ship three things in v1:
1. A deterministic **"HQ snapshot"**: exact products from the chosen viewpoint, rendered in high quality and, where possible, composited onto a real high-res photo captured during the scan.
2. The full **capture schema** from Section 5.
3. The **render-request data model**.

Prototype the hybrid AI pass internally in parallel. Release "AI-enhanced" only as an opt-in, labelled beta once an evaluation set shows product pixels and room structure are preserved. The team members who see this as core to the experience are right about the outcome — a polished image — but v1 can deliver most of that polish without generative risk.

### Cited Findings
- The vendors' own docs admit layout and consistency limits and soft masks (V) — [OpenAI guide](https://developers.openai.com/api/docs/guides/image-generation), [Gemini docs](https://aistudio.google.com/docs/image-generation). Consumer generative redesign tools show angle and proportion failures (S) — [Dwell](https://www.dwell.com/article/wayfair-ai-muse-review-e0a7fbd4)
- Exact-SKU incumbents render real assets and confine AI to the room (S) — [Furniture Today on IKEA Kreativ](https://www.furnituretoday.com/furniture-retailer/how-is-ikeas-new-platform-erasing-existing-furniture), [The Real Deal on Matterport Defurnish](https://therealdeal.com/san-francisco/2024/10/01/will-ai-ease-resi-agent-pain-points/)
- ARKit can capture high-res, posed stills mid-session, so a photo-composite snapshot is feasible on iOS (V) — [Apple](https://developer.apple.com/tutorials/data/documentation/arkit/arsession/capturehighresolutionframe(completion:).json). ARCore offers HDR lighting estimation for matching product lighting (V) — [ARCore](https://developers.google.com/ar/develop/lighting-estimation)
- Generative costs are $0.03–0.21 per image with seconds to minutes of latency (V/S, Section 4). Consent is required (V) — [Apple 5.1.2(i)](https://developer.apple.com/app-store/review/guidelines/). Gemini's under-18 clause and its EEA/UK paid-only rule also apply (V) — [Gemini terms](https://aistudio.google.com/docs/terms)
- Model churn is fast: Gemini 2.5 Flash Image shuts down on 15 Mar 2027 (V) — [Gemini pricing](https://aistudio.google.com/docs/pricing). OpenAI lists gpt-image-2, 2.5 and 2.6 variants within 2026 (V) — [OpenAI pricing](https://developers.openai.com/api/docs/pricing)

### Inferences
- **v1 (minimal, deterministic, recommended):**
  1. **HQ snapshot.** The user picks an angle in the 3D view and taps "Create image". The renderer produces a 2–4 MP image of the room with exact GLB products, using PBR materials, soft shadows, ambient occlusion and the captured environment cubemap for lighting. The render runs on the device or server (three.js, or Blender/Cycles on a server for path tracing). There is no AI and near-zero marginal cost.
  2. **Photo mode, where feasible.** If the chosen angle is near a captured high-res keyframe, render the products from that exact pose and intrinsics and composite them onto the real photo. Use a floor shadow catcher, light from the probe, and handle occlusion with LiDAR depth or the mesh. This gives "your real room" realism, the IKEA Kreativ style, without hallucination. Otherwise fall back to the 3D-room render.
  3. Both modes output the passes the AI stage will need later (beauty, product alpha/ID, depth, normals, structure masks), so the v2 AI pass plugs in without redesign.
  4. Ship the Section 5 capture schema and per-render logging even if no AI ships.
- **If the team insists on AI in v1, limit it to:**
  - An opt-in "AI enhance (beta)" built as approach 4: product pixels re-composited, wall/window/door masks protected, AI used only for relighting, shadow harmonisation and finish polish.
  - One provider behind an abstraction layer, for example Nano Banana 2.1 at about $0.03–0.05, or Qwen-Image-Edit-2511 hosted or self-hosted under Apache-2.0.
  - A visible "AI-enhanced visualisation" label, the exact render one tap away, and preserved SynthID/C2PA/IPTC metadata.
  - Async delivery, explicit consent and face/document blurring.
  - Automated QA with fallback to the deterministic image.
- **v2 (later):**
  - The full hybrid pipeline with an evaluation set (e.g., 50 real rooms × 10 SKUs) and acceptance thresholds for product-region similarity and structure-edge alignment.
  - Optional per-SKU reference packs and fine-tunes for best-sellers.
  - An optional "inspiration mode" (pure approach 2) that is clearly separated and labelled as not showing exact products.
  - Optional splat-based photoreal rooms (permissive licences only: gsplat or Spark, not Inria code) to free the viewpoint.
- **Key risks and mitigations:**

| Risk | Why it matters | Mitigation |
|---|---|---|
| Product misrepresentation (wrong colour, shape or material) | Returns, complaints, and consumer-protection and marketplace exposure | Never generate product pixels; re-composite; label; keep the exact render visible |
| Room geometry drift (windows or doors moved, ceiling changed) | Breaks the "matches your real space" promise | Condition on own depth, edges and masks; protect structure; automated edge/depth checks |
| Cost blow-up from regenerations | $0.03–0.21 × 2–3 retries per accepted image | Quotas, cheaper default model, batch pricing where async allows, deterministic default |
| Latency (5–60 s, up to 2 min) | Feels broken if synchronous | Async job, notification, instant deterministic preview |
| Privacy and consent | Interior photos are sensitive; Apple 5.1.2(i); GDPR | Separate opt-in, on-device blurring, paid tiers or ZDR, retention limits, EU routing |
| Provider terms | Gemini bars API clients likely to be used by under-18s; EEA/UK requires paid tier | Age gate or choose a provider accordingly; legal review |
| EU AI Act Art. 50 marking | Synthetic images need machine-readable marking | Keep provider watermarks and metadata; add visible labels |
| Model churn and deprecation | Models replaced within ~6–18 months | Provider abstraction, pinned versions, re-run the evaluation set on every model change |
| Android heterogeneity | No indoor semantics; device-limited depth | Server-side segmentation and depth; deterministic path works everywhere |
| Rights to send catalog imagery or 3D to third-party AI | Some providers may retain or use inputs (BFL by default) | Check supplier contracts; prefer no-training or ZDR terms, or self-host |

- **Decision gate for promoting AI out of beta** (my suggestion): on the evaluation set, at least 99% of renders keep product pixels identical to the exact render (guaranteed by re-composite), no structural element (window, door, wall edge) moves beyond a set pixel tolerance, and the median latency and cost per accepted image are within budget.

### Gaps
- No user research was found on how much customers value an "AI-polished" image over a high-quality deterministic render or photo composite for purchase confidence. Wayfair's data on generative imagery and purchases was not read — [Retail Dive](https://www.retaildive.com/news/wayfair-generative-ai-imagery-irl-purchases/739874).
- Engineering effort for photo-mode compositing (occlusion, shadow matching) on non-LiDAR Android phones was not estimated.
- Legal review is needed on Gemini's under-18 clause, EU AI Act timing and consumer-protection exposure in YoungVista's launch markets, which are not stated in the brief.
