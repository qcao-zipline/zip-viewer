# STEP Viewer MVP

This is a minimal browser-based STEP viewer focused on the bundled `DRONE.stp`
model in this repo.

## What it does

- Loads the repo's `DRONE.stp` file directly in the browser
- Renders the model with Three.js orbit controls
- Includes a reload button for the bundled model
- Includes fit-view, reset-camera, wireframe, and edge toggles

## Run it

Serve the folder with a local static server, then open the app in your browser.

```bash
python3 -m http.server 8000
```

Then visit `http://localhost:8000`.

## Notes

- The viewer uses `three.js` and `occt-import-js` from public CDNs.
- No build step is required for this MVP.
