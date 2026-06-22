# Velora CRM: AI System Instructions

## 🎯 1. Project Identity & Goal
- **Product:** Premium, ultra-comfortable B2B CRM (aiming to objectively surpass Altegio).
- **Vibe:** Premium Minimalism, Clean UI, Soft Tech. "Wow-effect" through perfect neatness, intuitiveness, and expensive simplicity. 
- **Timeline:** MVP by June 25, Perfect V1 by August 10. 
- **Quality Standard:** Production-ready at 99%. Code must be clean, modular, and maintainable.

---

## 🛑 2. STRICT AI RULES (CRITICAL)

**ALWAYS:**
1. Analyze the task and project context before writing any code.
2. Maintain existing architecture. Do NOT introduce new patterns without explicit discussion.
3. Run necessary build/lint tests (`npm run build`, `npm run lint`) after making changes.
4. During refactoring, preserve 100% of the previous functionality/behavior unless instructed otherwise.

**NEVER:**
1. Do NOT make `git commit`, `git push`, or alter git history without explicit user permission.
2. Do NOT create temporary or junk files in the root directory.
3. Do NOT run dangerous, destructive, or complex terminal commands without asking. Only standard dev/build commands are allowed.
4. Do NOT leave code half-finished with comments like `// implement later`.

---

## 💻 3. Tech Stack & Execution Commands

**Frontend (React 19 + TypeScript):**
- Vite, React Router 7, Recharts, CSS Modules (`.module.css`).
- *Run:* `cd front && npm run dev`
- *Build & Check:* `npm run build && npm run lint`

**Backend (Python + FastAPI):**
- FastAPI, SQLAlchemy + asyncpg (PostgreSQL), Alembic, Pydantic, JWT (python-jose).
- *Run:* `cd back && venv\Scripts\activate && uvicorn main:app --reload`
- *Migrations:* `alembic revision --autogenerate -m "msg"` -> `alembic upgrade head`

---

## 🏗 4. Architecture & Structure Rules

**Frontend (Feature-Sliced Modular Design):**
- Keep files small (< 200-300 lines). If a file grows, split logic into `hooks/` and UI into `components/`.
- **Feature Structure:** `src/pages/dashboard/<FeatureName>/`
  - `index.ts` (barrel export)
  - `<Feature>.tsx` (Orchestrator/Controller, lean)
  - `types.ts` (Interfaces) & `constants.ts` (Mocks/Static data)
  - `components/` (Local UI) & `hooks/` (Local logic)
  - `components/modals/` (Strictly 2-column premium grid, high-quality animations).

**Backend (Layered API):**
- `routers/` (Endpoints) -> `schemas.py` (Pydantic validation) -> `models.py` (SQLAlchemy ORM) -> `database.py`.

---

## 🎨 5. UI/UX Design System (Strict adherence required)

- **Colors:**
  - *Primary Accent:* Peach `#FCAE91` / `#F9A08B` (Use strictly for CTA, checkboxes, active icons. No large background fills).
  - *Light Theme BG:* Pearl-alabaster `#FDFCFB`. (Never use pure `#FFFFFF` for backgrounds, only for top-level cards).
  - *Dark Theme BG:* Deep matte graphite `#121212`. Cards: `#1E1E1E`.
  - *Text:* Headers `#1A1A1A` (Onyx). Body `#666666` (Soft gray).
  - *Status:* Success `#A3C9A8` (Pistachio), Error `#D88C9A` (Dusty rose).
- **Typography:** Manrope, Inter, or Gilroy. H1 (32-40px Bold), Body (14-16px Regular/Medium).
- **Geometry & Spacing:**
  - *Radius:* 12px or 16px for cards, 8px for inputs. 
  - *Padding:* Generous internal padding (24px - 32px minimum in cards). Let the UI breathe. Use negative space instead of divider lines.
- **Shadows:** Ultra-soft, levitating. Example: `Y: 8, Blur: 24, Spread: -4, Black 4%`.
- **Inputs:** Minimalist. Light gray border. On focus: Soft glow with Primary Accent (`#FCAE91`) and light shadow.

---

## 🐛 6. Debug & Dev Protocol
- **CORS / Auth:** If UI gets 401/403/CORS, verify JWT format (`Bearer ${token}`) and FastAPI `CORSMiddleware` config (ports 5173 <-> 8000).
- **Types:** Strictly resolve TS errors. Use Optional Chaining (`client?.phone`) and type guards to prevent undefined crashes.
- **Backend Debug:** Use `engine = create_async_engine(URL, echo=True)` to debug SQLAlchemy queries. Rely on Pydantic `ValidationError` logs for bad inputs.