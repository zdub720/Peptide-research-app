# Meniscus

Research peptide **reconstitution calculator** and **published titration schedule** reader.

**Not medical advice.** Not a prescription. Not an instruction to administer, compound, or use any substance. Numbers are arithmetic on values you enter, plus schedules transcribed from public labels and trial reports. Verify everything against primary sources.

## What it does

- Enter vial size (mg), diluent volume (mL), and dose
- Shows **U-100 syringe units**, mL to draw, concentration, and how many doses fit in the vial
- Optional: solve diluent so a dose lands on **10 units**
- Published schedules (labels / trials): semaglutide, tirzepatide, liraglutide, dulaglutide, retatrutide, cagrilintide, tesamorelin, bremelanotide
- Compounds **without** an established human schedule are listed with literature notes only (no invented protocols)
- Mobile-friendly; settings persist in this browser via `localStorage`

## Run locally

Open `index.html` in a browser, or from this folder:

```bash
python3 -m http.server 8080
```

Then visit `http://localhost:8080`.

No build step. No server-side code. Pure static HTML, CSS, and JavaScript.

## Host on GitHub Pages (public for others)

Yes — you can host this for others from GitHub. GitHub Pages serves static sites for free.

### Option A — new repo (simplest)

1. Create a new public GitHub repository (e.g. `meniscus`).
2. Upload everything in this folder to the **root** of the repo (`index.html` at the top level).
3. In the repo: **Settings → Pages**.
4. Under **Build and deployment**:
   - Source: **Deploy from a branch**
   - Branch: `main` (or `master`), folder **/ (root)**
5. Save. After a minute or two, the site is at:

   `https://YOUR_USERNAME.github.io/REPO_NAME/`

### Option B — project site in an existing repo

Put these files in a folder (e.g. `/docs` or `/meniscus`) and set Pages to serve that folder, or use a `gh-pages` branch.

### Custom domain

In **Settings → Pages** you can attach a custom domain. Add a `CNAME` file if GitHub asks for it.

## Privacy

All calculation and saved preferences stay in the visitor’s browser. There is no backend, no analytics in this package, and no accounts.

## Editing data

Compound lists and schedules live in `data.js`. Each protocol should keep a **source** and honest **caveat**. Do not invent human titrations where none exist.

## License / responsibility

You are responsible for how you publish and use this tool. Keep the research disclaimer visible. Do not present it as clinical guidance.
