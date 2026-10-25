# Catch2Catch demo video

**Live site:** https://catch2catch.vercel.app/today

Target length: about 2 minutes. Four AI-generated story scenes (32 s), then a screen recording of the real product (about 90 s), then a closing card.

The story is for the Anthropic track: a small-business owner whose community depends on her, a distributor who wants to help, and how a shared record of every phone order keeps them both whole. Claude listens and writes it down; the owner always makes the final call.

---

## Part 1: Story scenes (Gemini Veo, 4 × 8 s)

Rules that keep the four clips consistent:

1. Generate one still image of Maria and one of Leo first, and attach both to every video prompt.
2. Keep narration and music out of the clips. Add one narration voice and one soft piano track in editing.
3. No readable text in the clips. Overlay the real WhatsApp screenshot on the phones in Scene 4 while editing.

| Scene | What happens | Line in the clip | Narration (added in editing) |
|---|---|---|---|
| 1. The rush | Maria at the grill in a packed taquería at lunch, phone pinned to her shoulder | Maria: "Leo, two cases of beef by Friday. Please, I'm completely out." | "Maria feeds her whole neighborhood. Every order she places is a phone call made in a rush." |
| 2. I got you | Leo, calm in a sunlit office, happy to help; a blank sticky-note pad he never touches | Leo: "Of course, Maria! I got you. Friday, done." | "Leo wants to help. But nobody writes it down." |
| 3. The loss | Friday delivery arrives without the meat; a family walks out | Maria: "No meat… I ordered two cases." | "No record. No meat. No lunch for the families who count on her. For a small shop, one lost order can be the beginning of the end." |
| 4. The turn | Split screen; both phones buzz with the same message at once | Maria: "Finally. It's all in writing." | "Catch2Catch listens to every order call, so both sides get the same summary the moment they hang up." |

<details>
<summary>Full Veo prompts</summary>

### Scene 1
```
FORMAT: 8-second video, 16:9, 24 fps. One continuous shot with no cuts. Stylized 3D animation in the look of a modern Pixar feature: soft global illumination, slightly simplified rounded shapes, saturated but natural colors, expressive faces. Keep this exact style for the whole clip.

CHARACTERS:
MARIA: Latina woman, late 30s, warm tan skin, thick wavy dark-brown hair in a messy claw clip with loose strands falling over her face, tired dark eyes with slight bags under them, small silver hoop earrings, faded red t-shirt under a black apron dusted with flour and sauce stains.
BACKGROUND CUSTOMERS: about eight simple, softly blurred neighborhood customers (a mom with a small child, a construction worker, two teenagers, an elderly man), never in sharp focus, never speaking clearly.

SETTING: A tiny, cramped, warmly lit neighborhood taquería at lunch rush. Maria stands behind the counter at a hot flat-top grill on the left half of the frame, facing the camera. Strings of colorful blank paper flags hang from the ceiling. Steam and grill smoke rise in front of her. On the right half of the frame, a line of customers crowds the counter and stretches out the open front door into a sunny street. The small child tugs at her mom's sleeve. A metal order bell sits on the counter.

TIMELINE:
0.0–2.0s: Medium-wide shot. Maria flips meat on the grill with a spatula in one hand while a phone is pinned between her ear and shoulder. A customer taps the order bell twice. Maria blows a loose strand of hair out of her face, out of breath.
2.0–5.0s: Still flipping, she says into the phone, rushed and pleading:
"Leo, two cases of beef by Friday. Please, I'm completely out."
5.0–6.5s: The small child points at the grill, the line shuffles forward, two more people squeeze in through the front door. Maria grabs a plate with her free hand and nearly drops the phone, catching it with her shoulder.
6.5–8.0s: Maria pauses for one breath, eyes closing for a moment, exhausted. The grill keeps sizzling. Hold to the end.

DIALOGUE: Exactly one line, word for word, in clear American-accented English with a light Mexican accent: Maria's line at 2.0–5.0s. Background customers only murmur indistinctly. No narration, no voiceover.

SOUND: Constant loud overlapping customer chatter (indistinct), loud grill sizzle, two dings of the order bell at 0.5s, a door chime at 5.5s, plates clattering. No music at any point.

CAMERA: Locked-off and steady for the whole clip, framed so Maria, the grill, the counter, the line of customers and the open front door are all visible at all times. No movement, no zoom, no cuts.

DO NOT INCLUDE: any readable text, letters, menus, signs, logos, brand names, captions, subtitles or watermarks; any music; any other main character; any change to Maria's outfit, hair or earrings; fire beyond normal grill flames; anyone getting hurt.
```

### Scene 2
```
FORMAT: 8-second video, 16:9, 24 fps. One continuous shot with no cuts. Stylized 3D animation in the look of a modern Pixar feature: soft global illumination, slightly simplified rounded shapes, saturated but natural colors, expressive faces. Keep this exact style for the whole clip.

CHARACTERS (only this character appears in the entire clip):
LEO: young man, about 22, light brown skin, big curly black hair, friendly wide smile, bright eager eyes, white t-shirt under an open green plaid flannel shirt, small white wireless earbuds.

SETTING: A calm, sunlit small distribution office with big windows and golden afternoon light. Leo sits at a light wooden desk in the center of the frame, facing the camera, leaning back in a comfy chair. On the desk: an open laptop, a steaming coffee mug, a small potted plant, and a small pad of sticky notes with a pen lying beside it (the pad is completely blank). Through the window behind him, a quiet loading yard with a few stacked boxes. Dust motes float in the sunbeams.

TIMELINE:
0.0–1.5s: Leo listens on his phone, relaxed, nodding, sipping his coffee.
1.5–4.5s: He sits up, smiles warmly and genuinely, and says into the phone, upbeat and kind:
"Of course, Maria! I got you. Friday, done."
4.5–6.5s: He hangs up, sets the phone face down, and turns happily to his laptop, typing. His hand passes right over the blank sticky-note pad and pen without picking them up.
6.5–8.0s: The blank sticky-note pad sits untouched in the foreground in soft focus while Leo hums contentedly in the background. Hold to the end.

DIALOGUE: Exactly one line, word for word, in clear American-accented English: Leo's line at 1.5–4.5s. No other speech, no narration, no voiceover.

SOUND: Quiet room tone, birds outside, a soft sip at 1.0s, gentle keyboard typing at 5.0–8.0s, Leo humming softly. No music at any point.

CAMERA: Locked-off and steady for the whole clip, framed so Leo, the desk, the blank sticky-note pad and the window are visible at all times. No movement, no zoom, no cuts.

DO NOT INCLUDE: any readable text, letters, writing on the sticky notes, screen content, signs, logos, brand names, captions, subtitles or watermarks; any music; any other people; any change to Leo's outfit or hair.
```

### Scene 3
```
FORMAT: 8-second video, 16:9, 24 fps. One continuous shot with no cuts. Stylized 3D animation in the look of a modern Pixar feature: soft global illumination, slightly simplified rounded shapes, expressive faces, but with a cooler, slightly desaturated morning color palette. Keep this exact style for the whole clip.

CHARACTERS:
MARIA: Latina woman, late 30s, warm tan skin, thick wavy dark-brown hair in a messy claw clip with loose strands falling over her face, tired dark eyes with slight bags under them, small silver hoop earrings, faded red t-shirt under a black apron dusted with flour and sauce stains.
FAMILY (background only): a dad, a mom and a small girl, softly blurred, seen through the kitchen pass-through window.

SETTING: The small back kitchen of the taquería in early morning, cool blue light. Maria stands on the left half of the frame next to a hand dolly stacked with three plain brown cardboard boxes (produce and drinks, no labels). Behind her on the right, an open stainless-steel walk-in fridge with completely empty metal shelves. In the back wall, a wide pass-through window looks into the front of the restaurant, where the family stands at the counter.

TIMELINE:
0.0–2.0s: Maria opens the top box, looks inside, opens the second, then the third, faster each time, searching.
2.0–4.5s: She turns to look at the empty fridge shelves, then says quietly, voice cracking:
"No meat… I ordered two cases."
4.5–6.5s: Through the pass-through window, the family at the counter hears something, the little girl's face falls, and the family slowly turns and walks out the front door.
6.5–8.0s: Maria watches them leave, presses her hand over her mouth, eyes glossy, shoulders sinking. Hold to the end.

DIALOGUE: Exactly one line, word for word, in clear American-accented English with a light Mexican accent: Maria's line at 2.0–4.5s. No other speech, no narration, no voiceover.

SOUND: Cardboard flaps opening at 0.0–2.0s, the low hum of the empty fridge, a faint door chime at 6.0s as the family leaves, then near silence. No music at any point.

CAMERA: Locked-off and steady for the whole clip, framed so Maria, the boxes, the empty fridge and the pass-through window with the family are visible at all times. No movement, no zoom, no cuts.

DO NOT INCLUDE: any readable text, letters, labels, signs, logos, brand names, captions, subtitles or watermarks; any music; any raw meat on screen; anyone yelling or crying loudly; any change to Maria's outfit, hair or earrings.
```

### Scene 4
```
FORMAT: 8-second video, 16:9, 24 fps. One continuous shot with no cuts. Stylized 3D animation in the look of a modern Pixar feature: soft global illumination, slightly simplified rounded shapes, saturated but natural colors, expressive faces, warm hopeful morning light. Keep this exact style for the whole clip.

LAYOUT: The frame is split vertically down the middle into two equal halves for the entire clip, separated by a thin white line. Left half: Maria's taquería. Right half: Leo's sunlit office.

CHARACTERS (only these two appear in the entire clip):
MARIA: Latina woman, late 30s, warm tan skin, thick wavy dark-brown hair in a messy claw clip with loose strands falling over her face, tired dark eyes, small silver hoop earrings, faded red t-shirt under a black apron dusted with flour and sauce stains.
LEO: young man, about 22, light brown skin, big curly black hair, friendly wide smile, white t-shirt under an open green plaid flannel shirt, small white wireless earbuds.

SETTING: Left: Maria behind her counter, grill quiet behind her, warm light. Right: Leo at his wooden desk with the plant and coffee mug, sunbeams.

TIMELINE:
0.0–2.0s: Both are finishing the same phone call, nodding. Both lower their phones and tap the screen to hang up.
2.0–3.5s: At the exact same moment, both phones buzz and light up in their hands. Close enough to see the screens: each shows one blank glowing message bubble (no readable text).
3.5–5.5s: Maria reads, her shoulders drop, she exhales a long breath of relief and a small smile spreads across her face. Leo reads, grins, and gives a thumbs-up toward the camera.
5.5–8.0s: Maria looks straight into the camera, holding up her phone, and says softly, relieved:
"Finally. It's all in writing."
Hold to the end.

DIALOGUE: Exactly one line, word for word, in clear American-accented English with a light Mexican accent: Maria's line at 5.5–8.0s. No other speech, no narration, no voiceover.

SOUND: Two identical soft notification chimes at exactly 2.0s, one on each side. Maria's long exhale at 4.0s. Quiet room tone on both sides otherwise. No music at any point.

CAMERA: Locked-off and steady for the whole clip on both halves, both characters fully visible at all times. No movement, no zoom, no cuts, the split line never moves.

DO NOT INCLUDE: any readable text, letters, phone screen content, app icons, logos, brand names, captions, subtitles or watermarks; any music; any other people; any change to either character's outfit or hair.
```

</details>

---

## Part 2: Product walkthrough on the live site (about 90 s)

Record the browser at https://catch2catch.vercel.app with two phones beside the laptop. Bridge narration into this part: *"Maria orders everything by phone: meat, produce, drinks. Here's her next order."*

| # | Page | Time | What to do and show | Narration / caption |
|---|---|---|---|---|
| 1 | **Today** | 6 s | Start on the Today page: greeting, "Owed to you", "Who owes you", the 14-day chart. Click **Read it to me** for two seconds, then **Español** and back. | "This is the owner's day at a glance. It reads itself aloud, in English or Spanish." |
| 2 | Live call | 25 s | Buyer phone calls **+1 916 252 0633** on speaker. Keep the consent message audible; both press 1. Run the 30-second script (below). Speed up the middle 1.5×; show both phones picture-in-picture. | "Both sides agree to be recorded. No AI talks on the call." |
| 3 | **Calls** | 6 s | The new call appears at the top and its status moves to Done. | "Grok transcribes each voice on its own track." |
| 4 | Call page | 10 s | Open the call. Play 2 s of **The recording**, scroll **What was said** (shop on the left, you on the right), stop on **The order from this call**. | "Claude reads the whole call, follows every change, and writes down where it ended." |
| 5 | WhatsApp | 8 s | Screen recordings from both phones, side by side: the same summary arriving at the same moment. Hold long enough to read. | "Same message, same moment, for both of them. No more 'that's not what you said.'" |
| 6 | **Orders** | 12 s | The order with items, prices, total, delivery and payment. Click **Confirm order**; confetti. | "One click turns the call into a confirmed order." |
| 7 | **Bills** | 5 s | The new bill under "Not paid yet". | "Confirmed orders become bills automatically." |
| 8 | **Packing** | 8 s | Open the order on a phone (Packing page), scan one can, take one photo. | "The warehouse scans and photographs every case, so there's proof of what shipped." |
| 9 | **Problems** | 15 s | Two problems are already there. **Sunset Bodega** says 2 cases of Celsius were missing, but the packing scan shows all 8 shipped: open it, show Claude's suggestion (reject, with the scan as proof), and approve. Then show **Pupusería El Volcán**: the scan confirmed 2 cases short, so Claude credited $28 on its own (small and proven, under the shop's auto-approve limit). | "Claude checks every complaint against the call and the warehouse scan. Small, proven ones it settles itself. Anything else waits for the owner." |
| 10 | **History** | 4 s | Scroll the audit log. | "Every step, who did it, and why." |
| 11 | Closing card | 6 s | Maria smiling at a full counter (reuse the end of Scene 4). Text: *"Catch2Catch: every order, witnessed. So small shops can keep feeding their communities."* Team names and sponsor logos. | |

### Call script (about 30 s)

> **Buyer:** Hi, it's Maria's Taquería. I need to place an order.
> **Distributor:** Sure, what do you need?
> **Buyer:** Five cases of Coca-Cola and three cases of Dr Pepper.
> **Distributor:** Coca-Cola is fourteen fifty a case, Dr Pepper is fourteen dollars a case.
> **Buyer:** Can you do Coke at fourteen?
> **Distributor:** I can do fourteen twenty-five.
> **Buyer:** Deal. Can you deliver Friday the 30th?
> **Distributor:** Friday the 30th works. Payment due in 14 days, okay?
> **Buyer:** Perfect. Thanks!

Expected summary: 5 cases Coca-Cola @ $14.25, 3 cases Dr Pepper @ $14.00, total $113.25, delivery Friday the 30th, payment in 14 days.

---

## Before you hit record

- [x] Demo storefront loaded: 7 fictional shops (Maria's Taquería on +1 628 997 6788, Corner Market, Tienda La Esperanza, Quick Stop Deli, Pupusería El Volcán, Sunset Bodega, Pho Linh Café) with a month of calls, bills, payments, a late payer and two problems. To rebuild it from scratch (back up first):
  ```bash
  npx convex export --path backup.zip --include-file-storage && npx convex run demoData:resetDemoData && npx convex run demoData:seedStorefront '{"livePhone":"+16289976788"}'
  ```
- [ ] Both phones send `join met-flower` on WhatsApp to **+1 415 523 8886** within the hour before recording (sandbox messages only reach people active in the last 24 hours).
- [ ] `SELLER_PHONE` on the deployment is the distributor phone you're actually holding.
- [ ] Keep the two phones in different rooms or off speaker near each other, so voices don't leak into the other track.
- [x] Store prices loaded for Coca-Cola, Dr Pepper and Celsius (real Walmart listings from Subhan's Apify run). Horchata has no Walmart match. Walmart is currently returning listings without prices to scrapers, so **don't press Refresh prices during the recording**: it keeps the old prices, but it won't add new ones.
- [ ] Browser at 125% zoom, bookmarks bar hidden, Do Not Disturb on both phones and the laptop.
- [ ] Do one full dry run first. The summary takes about a minute after hanging up; cut that wait in editing.
