# Room Scanning and AR Product Placement App: Requirements

## Your task

The notes below come from our team meeting about software we want to build. We are still figuring out exactly what we need, so please read everything, do some planning and research, and then come back and grill us with questions. Do not start building the full app yet. Use the research to make your questions specific, then let our answers shape the final plan.

## What we currently have

We are at the idea stage. We did not discuss any existing app, code, design, or product catalog in the meeting, so please treat this as a new project. What we have so far is the product idea, the basic user flow, a few technical ideas, and some quick tests that we did with Apple's built-in Measure app.

## What we want to build

We want a phone app that lets a customer scan a real room and see how products would look inside it. The customer opens the app, points the phone's camera around the room, and captures it in 360 degrees. The app turns that scan into a 3D model of the room. The customer can then drag preset items, such as cabinets, sofas, beds, and tables, into the room to see how they look.

This product is mainly for customers, not contractors. The business lead wants a business-to-customer (B2C) product instead of one that sells only to businesses or general contractors. A regular customer should be able to scan their own room, place products in it, and see what they like. That is the main purpose of the app, so it needs to be easy for someone without any technical or construction experience.

## Main user flow

The user opens the app on their phone and starts the camera. They hold a button and scan the whole room. When the scan is finished, the 3D model of the room is available on their phone.

The user then has two ways to view the room. The first is a 3D view, where they can look at the whole room as a model, move around it, drag with their finger, and zoom in. The second is an AR view, where they look through the phone's live camera and see products placed in the real room. In AR, the user should be able to place a product, move it around, and see how it looks from the camera.

## Measurements and accuracy

The scan needs to understand the room's dimensions so that products appear at a realistic size and fit properly in the space. We want to use a concept similar to Apple's Measure app, which can estimate the size of objects using the phone's camera. We do not know exactly how Apple does this, so please research how it works. Then look for open-source tools that use the same or similar logic.

We tested the Measure app in the meeting, and the results were mixed. One teammate is about 5'5". The app first measured them at 5'1", then at 5'4" on another try. We also tried measuring a 14-inch MacBook, and the result from a distance was not accurate at all. We think that being closer to an object may improve accuracy, but we have not confirmed that. The app seems to work best for measuring from one point to another. It was less reliable when we tried to measure something larger or a whole object. So even Apple's built-in app is not fully accurate, and we should not assume that phone measurements will be exact.

For now, we are making a demo. The measurements do not have to be 100% correct, but they should be close enough that a sofa or other product can be placed in the room and look about right. Please tell us what level of accuracy is realistic on a normal phone.

## Matterport research

Please research how Matterport works, especially its room rendering, its 360-degree camera, and how it gets correct lengths and measurements. A teammate told us about Matterport a couple of months ago when we asked about BIM. We believe it is widely used in the construction industry, and this technology has been around for a long time.

Matterport's camera is expensive, and we do not think a regular customer would buy one. They just want to see how something looks in their room. The company also appears to have a reason to keep selling its hardware instead of offering everything through a phone app. The dedicated device does look more professional, but our idea is to make a similar experience work with only phone software.

One of our theories is that the camera itself may not be the special part and that most of the value is in the software. If that is true, we may be able to apply the same approach to phone cameras, since almost everyone already has one. We want you to research this and figure out how much of Matterport's concept can be recreated on a phone. Please also tell us what cannot be matched without special hardware.

Also, we are fairly sure that apps may already exist that scan a whole room and convert it into a 3D model. Please look for them and tell us what we can learn from them or reuse.

## Difficult room situations

Rooms will not always be simple rectangles or boxes. Some rooms may be circular, have many angles, or have unusual shapes. We also do not know what should happen when a door is open. For example, should the scan include the area outside the door, or should it treat the door as the edge of the room? Please also consider how the shapes of walls and windows affect the scan and any final image.

We do not want to hardcode a solution for every possible case. Please look for open-source tools and existing methods that can handle these situations, and bring us any decisions we need to make.

## Products and 3D models

We do not have our own product catalog right now. Please research and find open-source 3D product models that we can use. We believe that GLB is the right file format, so use GLB unless your research gives us a strong reason to choose something else.

We want a good bare-minimum set of products to test the experience, and more options are better. It should include things like sofas, cabinets, beds, and tables. The user should be able to pick a product, drag it into the room, and place it where they want.

## Final picture with image generation

We discussed a possible feature that creates a cleaner, better-looking picture after the customer has finished placing products. A photo from the phone may look shaky or rough, so this would give the customer a higher-quality result.

The idea is that the customer chooses an angle in their 3D room and clicks a button. The app captures a screenshot from that angle and sends it to an AI image model. The model then creates a polished image based on the products the customer chose and where they placed them. It needs to take the room's measurements and shape into account so that the final picture matches the real space.

We did not fully decide when to build this. One option was to note it in a file as a future feature, but some of us felt it could be important to the final customer experience. Please treat it as a later feature for now, keep it in mind during planning, and ask us whether it should be included in the first version.

## Platforms

We need the app to work on both iPhone and Android. We asked whether Expo would be a good choice. We are not sure, because Apple and Android may use different modules for this kind of scanning and AR work. Please research this and recommend the best approach for supporting both platforms.

The main focus is the mobile app. We first said that a website could come later, but then we decided that we want both. After a user scans a room and submits it, they should also be able to see their room and the process on a web browser, including on a bigger screen. Whatever they complete on the phone should be viewable across their devices.

## What to do next

Please do a little planning and research first. Cover how Matterport and Apple's Measure app work, what open-source scanning and measurement tools are available, whether similar apps already exist, where to get GLB product models, and how to support iPhone, Android, and the web. When that is done, share what you found and then grill us with questions. Ask about anything that is unclear, anything we have not thought about, and every decision we need to make before you create the final plan and start building.
