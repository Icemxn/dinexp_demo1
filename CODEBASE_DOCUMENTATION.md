# Digital Restaurant Menu - Technical Documentation

This document explains how the current project works end-to-end.
It reflects the implementation in this workspace as of the latest update.

## 1. Tech Stack

- Runtime: React 18
- Build tool: Vite 5
- Language: JavaScript (ES modules)
- Styling: plain CSS
- 3D viewer: model-viewer (lazy-loaded from CDN)
- Data source: Google Apps Script Web App endpoint (backed by Google Sheets)

## 2. Project Structure

- `index.html`: HTML shell, font/preconnect hints, and app mount point
- `src/main.jsx`: React bootstrapping and ErrorBoundary wrapper
- `src/App.jsx`: all application logic (fetching, caching, mapping, rendering, modals)
- `src/styles.css`: complete visual styling for layout, states, and responsive behavior
- `src/data/fallbackData.js`: local fallback rows if network/API fails
- `public/icons/veg.svg`: Veg badge icon
- `public/icons/spicy.svg`: Spicy badge icon
- `public/icons/chef.svg`: Chef Special badge icon
- `vite.config.js`: Vite root/app config and dev server defaults
- `package.json`: scripts and dependencies

## 3. App Startup Flow

1. Browser loads `index.html`.
2. Vite serves `src/main.jsx`.
3. `src/main.jsx` mounts `<App />` inside an ErrorBoundary.
4. `src/App.jsx` runs `initMenu()` in a `useEffect`.
5. Data is resolved using this order:
   - fresh localStorage cache if valid
   - Google Apps Script endpoint (`SHEET_URL`)
   - fallback data from `src/data/fallbackData.js`
6. Data is transformed and grouped by category.
7. UI renders:
   - sticky category nav
   - sectioned dish tiles
   - search filter
   - skeletons during load

## 4. Data Source and Sheet Contract

The app expects row objects with these keys:

Required:
- `Dish Name`
- `Category`

Optional but supported:
- `Description`
- `Price1`, `Price2`, `Price3`
- `Image`
- `3d model` (also accepts `3D model`)
- `Veg`
- `Spicy`
- `Chef Special`

Yes/No parsing:
- Badge flags use a permissive truthy parser that treats `yes`, `true`, and `1` as enabled (case-insensitive).

## 5. Google Sheets Fetch + Cache

Constants in `src/App.jsx`:
- `SHEET_URL`: Apps Script Web App URL
- `CACHE_KEY`: `menu_rows_cache_v1`
- `CACHE_TTL_MS`: 1 hour

`initMenu()` behavior:

1. Try cache first:
   - read localStorage
   - verify shape
   - verify TTL
2. If cache missing/stale, fetch remote JSON
3. Normalize payload shape with `normalizeRows()`
   - supports top-level array
   - supports `{ rows: [] }`
   - supports `{ data: [] }`
4. Persist fresh rows in cache
5. If anything fails, use `FALLBACK_DATA`

This provides fast repeat loads and resilience to endpoint issues.

## 6. Data Transformation Pipeline

Main functions in `src/App.jsx`:

- `normalizeText(value)`: trims and string-normalizes fields
- `parseYes(value)`: badge truth parser
- `mapRowToDish(row, index)`: creates normalized dish object
- `groupByCategory(rows)`: creates category order and grouped dishes map

Mapped dish fields include:
- `id`, `name`, `category`, `description`
- `price1`, `price2`, `price3`
- `image`, `glbUrl`, `hasModel`
- `veg`, `spicy`, `chefSpecial`

## 7. Search Behavior

Search state is in `searchTerm`.

Filtering is computed via `useMemo`:
- Query matches against combined lowercase text of name, description, and category
- Empty query returns full data
- Non-empty query returns only categories containing matches

If no results exist, empty state is shown.

## 8. Category Navigation and Scroll Spy

Sticky nav:
- Horizontal scrollable pills
- Active pill styles reflect selected section

Scroll-to-section:
- Clicking a pill calls `scrollToCategory(category)`
- Computes offset by nav height
- Uses smooth scrolling

Scroll spy:
- `IntersectionObserver` watches section nodes
- Uses tuned `rootMargin` and thresholds
- Updates `activeCategory` based on most visible intersecting section

## 9. Dish Tile Interaction Rules

Each tile has:
- left content: name, description, price text, badges
- right content: image and View in 3D ghost button

Interactive behavior:
- Tile itself is not a navigation link
- Tile has hover/focus visual highlight
- Image click:
  - opens 3D modal if `hasModel`
  - opens image modal if no model
- View in 3D button:
  - opens 3D modal when model exists
  - disabled otherwise

## 10. 3D Viewer Modal

Implemented in `src/App.jsx` with a conditional overlay.

Load strategy:
- model-viewer is not bundled eagerly
- first 3D open triggers dynamic import from jsDelivr

Viewer setup:
- source URL from dish `glbUrl`
- camera controls enabled
- auto-rotate enabled
- camera/fov applied on `load` event

Constants:
- `MODEL_VIEW_FOV = '20deg'`
- `MODEL_CAMERA_ORBIT = 'auto auto auto'`

Close behavior:
- close button
- backdrop click
- Escape key

## 11. Image Modal Fallback

For dishes without a 3D model:
- image click opens image modal instead
- URL is transformed to high-res Cloudinary variant where possible

Function used:
- `getHighResImageUrl(url)` -> Cloudinary width transform to 1920

## 12. Cloudinary Image Optimization

Functions in `src/App.jsx`:
- `isCloudinaryUrl(url)`
- `cldTransform(url, { w })`
- `buildSrcSet(url, widths)`

Applied transforms for Cloudinary `upload` URLs:
- `f_auto`
- `q_auto`
- `dpr_auto`
- `c_limit`
- `w_<width>`

Each dish image uses:
- transformed `src`
- responsive `srcSet`
- `sizes` hint from `IMAGE_SIZES`

Non-Cloudinary URLs pass through unchanged.

## 13. Loading Skeletons

While `isLoading` is true:
- category pills render as skeleton pills
- sections render as skeleton cards

Skeleton generation:
- helper `skeletonSections()` returns deterministic placeholder groups

Styling and animation are defined in `src/styles.css`.

## 14. Scroll Lock for Modals

When either modal opens:
- body is fixed
- current scrollY is preserved

When modal closes:
- body styles reset
- original scroll position restored

Functions:
- `lockScroll()`
- `unlockScroll()`

## 15. Error Boundary and Runtime Safety

`src/main.jsx` wraps app in a class-based ErrorBoundary:
- catches render/runtime errors in React tree
- shows user-facing error fallback panel instead of blank screen
- logs original error to console for debugging

Additional runtime safety in `src/App.jsx`:
- payload normalization via `normalizeRows()`
- fetch errors fallback to local demo rows

## 16. Styling System

All styles are in `src/styles.css`.

Design characteristics:
- white background, near-black text
- flat visual system
- subtle borders and hover states
- badge colors for veg/spicy/chef
- responsive single-column layout with max content width 720px

Key responsive breakpoints:
- small-screen adjustments near 374px
- desktop/tablet refinements at 768px+

## 17. Dev and Build Commands

From project root:

- install deps: `npm install`
- start dev server: `npm run dev`
- production build: `npm run build`
- preview build: `npm run preview`

If port conflicts occur, run Vite directly with a strict port:
- `npx vite --host 127.0.0.1 --port 5180 --strictPort`

## 18. Vite Configuration Notes

`vite.config.js` includes:
- explicit `root: resolve(__dirname)`
- `appType: 'spa'`
- dev server defaults (`host`, `port`)

This avoids scenarios where Vite serves only internal client assets but not the project `index.html`.

## 19. Common Troubleshooting

### Blank white page

Check:
1. Browser console errors
2. Whether dev server is running and URL is correct
3. ErrorBoundary message content

### Localhost 404

Likely causes:
1. wrong port opened
2. stale process on that port
3. server not running

Use the exact Local URL printed by Vite.

### Localhost connection refused

No process is listening.
Start dev server again and keep terminal open.

### Sheet data not updating

App caches for 1 hour.
Clear localStorage key `menu_rows_cache_v1` to force refetch.

### Fallback data appears instead of live data

Possible causes:
1. endpoint returned non-2xx
2. endpoint JSON shape invalid
3. sheet web app permissions not public

Verify Apps Script deployment is publicly accessible and returns JSON rows.

## 20. Suggested Maintenance Improvements

1. Move `SHEET_URL` to environment variables for safer configuration.
2. Add unit tests for mapping and normalization helpers.
3. Split `src/App.jsx` into smaller components for maintainability.
4. Add request timeout and retry for sheet fetch.
5. Add lightweight analytics/logging for fetch source (cache vs network vs fallback).
