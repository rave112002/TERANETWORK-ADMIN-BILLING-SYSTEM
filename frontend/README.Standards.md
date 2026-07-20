# 🧩 Project Standards and Guidelines

This document defines the project structure, naming conventions, configuration standards, and reusable utilities used across this **React + Vite + Tailwind CSS + Ant Design** template.

Use it as the single source of truth when scaffolding a new app from this template.

---

## ⚙️ Tech Stack

| Concern | Library |
| --- | --- |
| Framework | React 19 |
| Build tool | Vite 7 |
| Styling | Tailwind CSS 4 (`@tailwindcss/vite`) + `tailwind-merge` + `tailwindcss-animate` |
| UI components | Ant Design 5 (`antd`, `@ant-design/icons`, `@ant-design/v5-patch-for-react-19`) |
| Icons | Ant Design Icons + `lucide-react` |
| Routing | `react-router` / `react-router-dom` v7 |
| Server state | TanStack React Query 5 |
| Client state | Zustand (with `persist` middleware) |
| Validation | Zod |
| HTTP | Axios (with token-refresh interceptor) |
| Date/number | `dayjs`, `Intl.NumberFormat` |

### Scripts

```bash
npm run dev      # start Vite dev server
npm run build    # production build
npm run preview  # preview the production build
npm run lint     # run ESLint
```

---

## 🏗️ Folder Structure

```
src/
├─ assets/           # Images, fonts, static JSON (regions/provinces/cities, address refs)
│  └─ images/
├─ components/        # Shared/reusable UI
│  ├─ common/         # Generic pieces (LoadingFallback, SearchInput, ...)
│  ├─ layouts/        # Page shells (CMSLayout, ...)
│  └─ ui/             # Low-level UI primitives
├─ configs/           # App-level configuration
├─ constants/         # Static data & enums (menu.jsx, address/*.json)
├─ contexts/          # React contexts (SocketContext, ...)
├─ helpers/           # Cross-cutting helpers (message-context, ...)
├─ hooks/             # Reusable custom hooks
├─ pages/             # Page-level components, grouped by area (CMS/, Login)
├─ routes/            # Router setup, route guards, per-area route configs
├─ services/          # Data layer (API + React Query)
│  ├─ api/            # Axios client + endpoint functions
│  ├─ query/          # React Query read hooks (useQuery)
│  └─ mutation/       # React Query write hooks (useMutation)
├─ store/             # Zustand stores
├─ utils/             # Pure helpers/formatters
│  └─ formatters/     # Address, currency, and date formatters
├─ App.jsx            # Main application component
├─ main.jsx           # ReactDOM root, providers (Router, Query, AntD ConfigProvider)
└─ index.css          # Tailwind import, @theme tokens, global styles
```

---

## 🧭 Naming Conventions

| Case | Applies to |
| --- | --- |
| `kebab-case` | Folder names (and file names for pure JS utility modules, e.g. `date-formatter.js`) |
| `PascalCase` | Components, classes, types (`CMSLayout.jsx`, `Login.jsx`) |
| `camelCase` | Functions, variables, custom hooks (`useTableColumns`), Zod schemas |
| `snake_case` | Database tables and columns only |

> Custom hook files start with `use` and use the `.jsx` extension when they render JSX, otherwise `.js`.

---

## 🔗 Path Aliases

Aliases are defined in **`vite.config.js`** (runtime) and mirrored in **`jsconfig.json`** (editor IntelliSense). Always import via alias instead of long relative paths.

| Alias | Resolves to |
| --- | --- |
| `@assets` | `src/assets` |
| `@images` | `src/assets/images` |
| `@components` | `src/components` |
| `@constants` | `src/constants` |
| `@helpers` | `src/helpers` |
| `@hooks` | `src/hooks` |
| `@pages` | `src/pages` |
| `@routes` | `src/routes` |
| `@utils` | `src/utils` |
| `@features` | `src/features` |
| `@lib` | `src/lib` |

```js
// ✅ good
import { cn } from "@utils/cn";

// ❌ avoid
import { cn } from "../../../utils/cn";
```

> When you add a new alias, add it to **both** `vite.config.js` and `jsconfig.json`. A few sample files still reference aliases like `@services/*` or `@hooks/api/*`; align those imports with the folders above when you wire up real features.

---

## 🎨 Styling and Theming

- Global colors are declared in `@theme` inside `src/index.css`. Reference them through Tailwind token names (`bg-green`, `bg-green-hover`, etc.).
- Avoid inline styles for colors — use theme tokens for consistency.
- Merge conditional class names with the `cn` helper (`clsx` + `tailwind-merge`) to prevent conflicting Tailwind classes:

  ```jsx
  import { cn } from "@utils/cn";
  <div className={cn("px-4 py-2", isActive && "bg-green")} />
  ```

- Ant Design theming is centralized in `main.jsx` via `ConfigProvider` (`colorPrimary`, `fontFamily`, per-component overrides). Adjust the global look there rather than styling components individually.

---

## 🪝 Hooks (`src/hooks`)

Reusable, presentation-agnostic logic. Hooks that render JSX use `.jsx`.

| Hook | Purpose |
| --- | --- |
| `useAddressData` | Lazy-loads region/province/city JSON and exposes cascading loaders (`loadProvincesData`, `loadCitiesData`) with per-level loading flags. |
| `useDataBasedFilters` | Builds Ant Design table column filter config (`filters`, `onFilter`) from unique values in a dataset, with optional value mapping/custom filter. |
| `useImageCompressor` | Compresses images (PNG/JPG) via `browser-image-compression`, supports base64 input, and returns an `UploadLoading` progress modal. |
| `useSocketEvent` | Subscribes/unsubscribes to a socket event through `SocketContext`. |
| `useTableColumns` | Factory for Ant Design table columns: search dropdowns, highlighted matches, sorters (`createColumn`, `getColumnSearchProps`, `renderInputSearch`). See `docs/TABLE_COLUMNS_USAGE_SAMPLE.md`. |
| `useTableSearchCustom` | Client-side, multi-column table search returning `filteredData` and a `handleSearch` handler. |

---

## 🧰 Utilities (`src/utils`)

Pure, framework-light helper functions. Prefer these over re-implementing logic in components.

| File | Exports / purpose |
| --- | --- |
| `buildMenuItems.jsx` | Transforms a menu config into Ant Design `Menu` items (recursive, respects `isShow`, renders `NavLink` labels). |
| `cn.js` | `cn(...)` — merge Tailwind classes safely (`clsx` + `tailwind-merge`). |
| `decodeHTML.js` | `decodeHTML()` — recursively decodes HTML entities (`html-entities`), optional copyable output. |
| `formatData.js` | `decodeHtmlEntities()` (textarea-based decode) and `arrayToSelectDropdown()` for AntD Select options. |
| `heDecode.js` | `heDecode()` — decode HTML entities with the `he` library. |
| `itemFormat.js` | `viewHandlerCopyable()` — wraps a value in a copyable `Typography.Text`, or `"N/A"`. |
| `redirect.js` | Role constants + role→module maps and `getRedirectByRole()` for post-login landing. |
| `redirectTo.js` | `redirectTo` — persist/consume the intended path in `sessionStorage` (used by the auth flow). |
| `regex.js` | Shared validation regexes (password, email, username, mobile number, etc.). |
| `renderRoutes.jsx` | Recursively renders `<Route>` elements from a route config. |
| `sanitizer.js` | `capitalizeFirstLetter`, `capitalizeFirstLetterEachWord`. |
| `sortHelper.js` | `COLUMN_SORTER_TYPES` + `buildSorter()` — comparator factory for AntD table columns (string/number/date, nulls-last). |
| `zodValidator.js` | Zod ↔ Ant Design Form bridge: `validateWithZod`, `zodValidator`, `zodToAntdRules`, `validateFormWithZod`. |
| `formatters/address-formatter.js` | `formatAddress`, `formatAddressByCode` (resolves PSGC codes to names). |
| `formatters/currentcy-formatter.js` | Number/PHP currency formatters (`formatPHPCurrency`, `formatCurrency`, `getPercentage`, `unformatPHPCurrency`, ...). |
| `formatters/date-formatter.js` | `dayjs`-based formatters (`formatDateReadable`, `formatRelativeTime`, Excel-safe dates, ...). |

---

## 🌐 Services (`src/services`)

The data layer is split into three responsibilities. Sample files are suffixed `Sample` and are meant to be copied and renamed per feature.

### `services/api`
Axios setup and raw endpoint functions.

- `axios.js` — configured `axiosClient` with:
  - `VITE_BASE_URL` base URL and `withCredentials` for the refresh-token cookie.
  - Request interceptor that attaches the `Bearer` access token from the auth store.
  - Response interceptor that handles `401` → silent refresh → retry (queued), and logs out + saves the redirect path on failure.
  - Helpers: `defaultAxios(method, url, config)`, `axiosMultipart(...)` for `FormData`, and the `httpMethod` enum.
- `authSampleApi.js`, `sampleApi.js` — example endpoint functions returning `res.data`.

### `services/query`
Read operations via `useQuery`.

- Use a descriptive `queryKey` array (e.g. `["GET Announcements"]`).
- Optionally sync results into a Zustand store, or return the query directly. See `useSampleQuery.js`.

### `services/mutation`
Write operations via `useMutation`.

- Standardize `onError` (surface `messageApi` error) and `onSuccess` (invalidate related queries, show a success message).
- Accept an `args` object so callers can pass their own `onSuccess`/`onError`. See `useSampleMutation.js`, `useAuthSampleMutation.js`.

**Convention:** `services/api` never touches React Query; `query`/`mutation` never call Axios directly — they import from `services/api`.

---

## 🗄️ State Management (`src/store`)

- Client/UI and auth state use **Zustand**. Auth state (`useAuthSampleStore.js`) uses the `persist` middleware backed by `sessionStorage`.
- **Server state stays in React Query** — do not duplicate fetched data in Zustand unless a store genuinely needs to share it app-wide.

---

## 🧱 Providers & App Bootstrap

`main.jsx` wires the global providers in order:

```
BrowserRouter → QueryClientProvider → ConfigProvider (AntD theme) → AntApp → App
```

- React Query defaults to a 5-minute `staleTime`.
- `@ant-design/v5-patch-for-react-19` is imported first for React 19 compatibility.
- Global message API is provided through `MessageContext` (`@helpers/message-context`) and consumed with `useContext` in mutations/hooks.

---

## 🚀 Using This Template

1. **Install dependencies**
   ```bash
   npm install
   ```
2. **Configure environment** — create a `.env` with your API base URL:
   ```
   VITE_BASE_URL=https://your-api.example.com
   ```
3. **Set the theme** — edit `@theme` tokens in `src/index.css` and the AntD `ConfigProvider` in `main.jsx`.
4. **Define navigation** — update `src/constants/menu.jsx` and the role maps in `src/utils/redirect.js`.
5. **Build a feature** (recommended flow):
   - Add endpoint functions in `services/api/<feature>Api.js`.
   - Add `services/query/use<Feature>Query.js` and/or `services/mutation/use<Feature>Mutation.js`.
   - Add a Zustand store in `store/` only if the state must be shared broadly.
   - Build the page under `pages/<Area>/` and register it in `routes/`.
   - Reuse hooks (`useTableColumns`, etc.) and utils rather than duplicating logic.
6. **Run** `npm run dev` and `npm run lint` before committing.

---

## ✅ Conventions Checklist

- [ ] Imports use path aliases, not deep relative paths.
- [ ] New aliases added to both `vite.config.js` and `jsconfig.json`.
- [ ] Colors come from `@theme` tokens; class names merged with `cn`.
- [ ] API calls live in `services/api`; data hooks in `query`/`mutation`.
- [ ] Server state managed by React Query; Zustand only for shared client state.
- [ ] Files/folders follow the naming conventions above.
- [ ] `npm run lint` passes.
