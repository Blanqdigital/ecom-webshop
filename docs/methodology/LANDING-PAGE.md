# Landing page methodology

How to structure the landing page for every store built from this template.
Distilled from Mark (Mark Builds Brands), "copy my landing page template, it
made me $1.4m in 30 days" — [video](https://www.youtube.com/watch?v=IIm60Qk4VEs),
full transcript in [`sources/transcript-copy-my-landing-page-template.md`](sources/transcript-copy-my-landing-page-template.md),
his whiteboard in [`sources/landing-page-whiteboard.png`](sources/landing-page-whiteboard.png).

**When building a new store from this template, follow this document.**
Also follow [the required product-page structure](PRODUCT-PAGE.md): gallery,
compact buying controls and image-led sections. Use only substantiated claims;
the example transformations, timeframes and reviews below are not default copy.
First implementation: SVEVA (sveva.vercel.app) — use it as the living example.

## Core principles

1. **Sell the outcome, not the product.** Features → benefits → *outcome*
   (the emotional end-state). Nobody buys an inflatable cushion; they buy
   arriving without back pain.
2. **Clear beats clever.** A confused mind never buys. Copy is judged on
   clarity, not wit.
3. **Every element must have a purpose.** If you can't say what an image,
   section or bullet is doing (handling an objection, seeding a belief,
   showing a transformation), cut it.
4. **Research before copy.** Know the market's pain points, the alternatives
   they've already tried (in order of frequency), their exact language, and
   the true authority figure. Run deep research first; write second.
5. **Subtraction over addition.** When optimizing, ask "what can I remove?"
   before "what can I add?" — lighter pages load faster and convert better.

## Above the fold

The single most important section. Its only goal: **get people to scroll /
keep consuming**. Design mobile-first — that's where ~95% of traffic is.
On mobile, above the fold = headline + subheadline + image + a few bullets.
Spend 90% of your effort here.

### Photo carousel — intentional image cadence

Never random. Default order (adapt per market, keep the purpose per slot):

| # | Slot | Purpose |
|---|------|---------|
| 1 | Hero shot | Product clearly visible — what it is, what it does |
| 2 | Before/after or transformation | Nothing sells like a transformation; can attack different pain points across two slides |
| 3 | Objection handler | Pre-handle the #1 objection before it becomes conscious; list every avatar-specific "does it work for MY case?" |
| 4 | Logical evidence / take-them-to-the-future | Research, mechanism proof, or competitor comparison — market-specific |
| 5 | Risk reversal | Money-back guarantee as an image |
| 6 | Social proof | Testimonial collage or review card |

In this template the carousel = main image + `gallery` array in
`src/lib/products.ts`. Order the gallery entries to this cadence.

### Headline + subheadline

Formula that works: **outcome + timeframe + mechanism**.
("Fuller, smoother lips in 5 minutes with the MicroLift system.")

Subheadline: acknowledge what they've already tried, in order of frequency —
**"without"** is the most powerful word in sophisticated markets.
("Without Botox, costly clinic visits or invasive procedures.")

Score every headline+subheadline combo against this 7-point checklist —
**hit at least 4** (multiple instances of one quality count):

1. Curiosity
2. Call out the pain point
3. Promise the solution
4. Specificity
5. Simplicity
6. Credibility
7. Timeframe

### Benefit bullets

Four bullets under the subheadline, benefit-driven (not feature-driven —
features belong in the education section):

- 2× *what does life look like after?* (outcome)
- 2× *why does it work?* (mechanism — the real one: pressure distribution,
  collagen production, etc.)

### Offer + CTA, then risk reversal directly beneath

See "Offer structure" below. Risk reversal (guarantee) sits immediately
under the CTA.

### FAQs directly under the offer

A few objection-handling FAQs right below the buy box, plus a fuller FAQ
section further down the page. In sophisticated markets, FAQs everywhere
don't hurt.

## Offer structure

- **Quantity breaks only** (Bundle & Save) — bigger discount per tier.
  Never random free-gift piles. Already implemented in `src/lib/offers.ts`
  (tiers) + `src/lib/pricing.ts` (server-side enforcement).
- One tier highlighted as **most popular / best value**.
- Consider a **decoy tier**: a middle option priced close to the top option
  so the top bundle looks like a no-brainer.
- **Every free gift must either overcome an objection or help them get the
  outcome faster/easier.** If it does neither, drop it. (SVEVA example: free
  carry bag handles the "will I actually bring it along?" objection.)
- If buying multiples doesn't logically make sense for the product, bundle a
  cross-sell instead of a 2x tier.

## Below the fold

Order after the fold:

1. **Testimonials / reviews as transformations.** Each review must overcome
   an objection or seed a belief — never proof for proof's sake. People in
   photos must match the target avatar (age, gender, demographic) exactly.
2. **Education section** — authority figure, how-it-works (GIFs are strong),
   mechanism/ingredients with the research behind them, who-it's-for,
   us-vs-them comparison table (essential in stage 3–4 sophistication
   markets).
3. **Inject social proof between every educational block.** Education is
   where people drop off; the interleaved proof keeps them moving.
4. **More FAQs** — the fuller objection list.
5. **Final offer card** — restate outcomes, CTA, urgency/scarcity if
   truthful (see compliance note).

Template mapping: `ProductHero.tsx` = above the fold; `Sections.tsx` blocks
(TrustStrip, Benefit blocks, FeatureGrid, StepSetup, FeatureBand, Reviews,
Guarantee) = education + proof; order them per the list above in the
product page.

## Sourcing FAQs and objections (survivorship bias)

Don't build FAQs from ad-comment complainers — most will never buy.
The higher-signal question goes to **actual customers**:
*"What almost kept you from buying?"* Those answers become the FAQ and the
objection-handler slides.

## Authority figures

Don't default to "doctor". In sophisticated markets there's often resentment
toward the establishment; the real authority may be "I tried everything and
figured it out myself". Let the research decide. **And per our own rules:
never fabricate an endorsement — only real, consented quotes
(markedsføringsloven).**

## Traffic temperature (context, not page structure)

Conversion rate is capped by traffic match, not just the page:

- Match funnel length to traffic temperature: bottom-of-funnel traffic goes
  straight to the sales page; cold/indirect traffic (native statics, long
  VSLs) needs a pre-sell step (advertorial, listicle, quiz) first.
- Indirect ads = cheaper clicks, lower CVR — that's fine; judge the funnel,
  not the page alone.

## Testing rules

- **Never split-test the page your ads point at** (the page Meta crawls).
  Changing it disturbs optimization and skews both variant and control. To
  test that page: duplicate to a new URL and launch **new post IDs** with
  the same creatives.
- Split-testing *deeper* pages with a 50/50 divert is fine.
- Judge tests on **EPV (earnings per view)** — or profit per view — not
  conversion rate. AOV changes make CVR misleading.
- Test removals as eagerly as additions.

## Compliance guardrails (ours, non-negotiable)

The source material is aggressive US direct-response. We keep the structure
but stay inside Norwegian/EU rules:

- No fake scarcity, countdowns or "only X left" unless literally true.
  Real seasonal sales/holidays are the compliant urgency lever.
- No invented authority figures, awards, press logos or reviews.
- Before/afters and claims must be real and substantiable.
- Guarantees must be at least as strong as statutory rights (angrerett,
  reklamasjonsrett) — never present the law as a perk.
