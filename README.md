# AutoChemEx Expert Review Site

Static GitHub Pages app for expert review of AutoChemEx `review_packet` JSON
files. Experts only need a browser. The app does not run a backend and does not
write files to a server; reviewed packets are downloaded from the browser.

## Expert Workflow

1. Open the review site URL.
2. Select a reaction packet in the left sidebar.
3. Review or edit the reaction background, platform steps, and parameters.
4. Click **Save draft** to keep a browser-local draft.
5. Click **Download JSON** for the current packet, or **Download bundle** for all
   browser-saved drafts.
6. Send the downloaded JSON files back to the AutoChemEx maintainer.

Local drafts are stored in the browser's `localStorage`. They are not uploaded.

## Maintainer Workflow

Prepare data from the AutoChemEx project:

```powershell
python scripts\prepare_review_data.py --source-root D:\learn\exp\autochemex
```

This writes:

```text
public/data/parsed_parameter_registry.json
public/data/review_packet_index.json
public/data/review_packets/*.json
```

Run locally:

```powershell
npm install
npm run dev
```

Build:

```powershell
npm run build
```

## GitHub Pages

Push this repository to GitHub and enable Pages with **GitHub Actions** as the
source. The included workflow builds the Vite app and deploys `dist`.

If the review packets contain unpublished chemistry or paper-derived data, do
not publish them in a public repository unless that disclosure is acceptable.
For sensitive reviews, use a private distribution path or a private Pages setup
available through your GitHub plan.

## Data Contract

The static app expects review packets shaped like:

```text
literature_uuid
reaction
platform_review_steps
notes
metadata
```

The platform and operation choices come from
`public/data/parsed_parameter_registry.json`. When experts change an operation,
the parameter editor is regenerated from that operation's registry schema while
preserving matching existing parameter values.
