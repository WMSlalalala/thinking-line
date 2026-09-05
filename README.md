# Thinking Line

Thinking Line is Mingshuo Wang's public notebook for research notes, creative experiments, and life outside the screen.

This repository is the public source for the static site and its managed road-trip data. The three routes in `trips.json` are repository-managed loops. The public page is read-only: route stops, geometry, colors, and highlighted states are edited in source and rebuilt through GitHub Actions. There is no visitor-facing route editor or upload form.

## Local build

```powershell
python build.py
```

The build emits `dist/client`, the directory published by the Pages workflow. The Worker and D1/R2 files are included as backend source for the shared interaction service; GitHub Pages itself serves the static client. The live interaction origin remains the configured Thinking Line Site, so public comments, hooks, and visit counts continue to use the same service.

## Route data

`trips.json` contains the three closed loops, ordered stops, GeoJSON road connections, route colors, and public provenance. The geometry is an inferred road connection between the listed stops, not a GPS track or turn-by-turn navigation record. `route-sources.json` records the public map and routing sources used to prepare it. Visible map attribution is kept in the page and in `assets/map/`.

## Research data and figures

`papers.json` contains the public research notes and figure attributions. Private slide-deck references and handoff material are intentionally absent from this repository. Figures retain their original authorship and license information.

## GitHub Pages

Push to `main` or run the workflow manually. The workflow builds the client and deploys `dist/client` with GitHub Pages.
