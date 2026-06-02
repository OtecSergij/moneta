# Design System Master File

> **LOGIC:** When building a specific page, first check `design-system/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file.
> If not, strictly follow the rules below.

---

**Project:** moneta
**Generated:** 2026-05-17 (adapted from uupm output)
**Category:** Personal finance / Expense tracker (single-user)

---

## Global Rules

### Color Palette

Light theme is the default. Dark theme is auto-applied when `prefers-color-scheme: dark`.

| Role               | Light                   | Dark                    | CSS Variable        |
| ------------------ | ----------------------- | ----------------------- | ------------------- |
| Background         | `#FFFFFF`               | `#0B0B0E`               | `--bg`              |
| Surface (card)     | `#FAFAFA`               | `#17171B`               | `--surface`         |
| Surface raised     | `#FFFFFF`               | `#1F1F23`               | `--surface-raised`  |
| Surface sunken     | `#E8EAEE`               | `#202027`               | `--surface-sunken`  |
| Border             | `#E5E7EB`               | `#2A2A30`               | `--border`          |
| Text primary       | `#09090B`               | `#FAFAFA`               | `--text`            |
| Text secondary     | `#52525B`               | `#A1A1AA`               | `--text-muted`      |
| Accent (CTA)       | `#2563EB`               | `#3B82F6`               | `--accent`          |
| Accent hover       | `#1D4ED8`               | `#60A5FA`               | `--accent-hover`    |
| Danger             | `#DC2626`               | `#F87171`               | `--danger`          |
| Success            | `#16A34A`               | `#4ADE80`               | `--success`         |

**Category colours** (for user-picked tags) — preset palette user can choose from:

| Name    | Hex       |
| ------- | --------- |
| Red     | `#EF4444` |
| Orange  | `#F97316` |
| Amber   | `#F59E0B` |
| Yellow  | `#EAB308` |
| Lime    | `#84CC16` |
| Green   | `#10B981` |
| Teal    | `#14B8A6` |
| Cyan    | `#06B6D4` |
| Blue    | `#3B82F6` |
| Indigo  | `#6366F1` |
| Violet  | `#8B5CF6` |
| Pink    | `#EC4899` |
| Rose    | `#F43F5E` |
| Brown   | `#A16207` |
| Slate   | `#64748B` |

### Typography

- **Font:** Inter (variable) — single family for headings + body. Already wired via Next.js
  `next/font/google` in `src/app/layout.tsx`.
- **Numeric font feature:** enable `font-variant-numeric: tabular-nums` for all monetary
  values so digits align vertically in tables and totals.
- **Mood:** clean, neutral, modern, trustworthy.

**Scale:**

| Token         | Size | Line height | Usage                            |
| ------------- | ---- | ----------- | -------------------------------- |
| `text-xs`     | 12px | 16px        | meta, captions                    |
| `text-sm`     | 14px | 20px        | secondary text                    |
| `text-base`   | 16px | 24px        | body (mobile minimum)             |
| `text-lg`     | 18px | 28px        | subheadings                       |
| `text-xl`     | 20px | 28px        | section titles                    |
| `text-2xl`    | 24px | 32px        | page titles                       |
| `text-3xl`    | 30px | 36px        | total amount in summary           |
| `text-5xl`    | 48px | 1.0         | hero amount (если будет)          |

### Spacing Variables

| Token       | Value          | Usage                       |
| ----------- | -------------- | --------------------------- |
| `--space-xs`  | `4px`  / `0.25rem` | Tight gaps                |
| `--space-sm`  | `8px`  / `0.5rem`  | Icon gaps, inline spacing |
| `--space-md`  | `16px` / `1rem`    | Standard padding          |
| `--space-lg`  | `24px` / `1.5rem`  | Section padding           |
| `--space-xl`  | `32px` / `2rem`    | Large gaps                |
| `--space-2xl` | `48px` / `3rem`    | Section margins           |

### Radii

| Token   | Value | Usage                  |
| ------- | ----- | ---------------------- |
| `--r-sm`  | `6px`  | inputs, small chips   |
| `--r-md`  | `8px`  | buttons               |
| `--r-lg`  | `12px` | cards                 |
| `--r-xl`  | `16px` | modals                |
| `--r-pill`| `999px`| pills, category chips |

### Shadows

| Level         | Value                                | Usage                |
| ------------- | ------------------------------------ | -------------------- |
| `--shadow-sm` | `0 1px 2px rgba(0,0,0,0.05)`         | Subtle lift          |
| `--shadow-md` | `0 4px 6px rgba(0,0,0,0.08)`         | Cards, buttons       |
| `--shadow-lg` | `0 10px 15px rgba(0,0,0,0.10)`       | Modals, dropdowns    |

---

## Layout Pattern

**Pattern Name:** Minimal Single Column (mobile-first, max-w-md on phone / max-w-2xl on desktop).

### Главная (`/`)

```
┌──────────────────────────────────────┐
│  moneta              ⚙  ←nav       │
├──────────────────────────────────────┤
│  На этой неделе                      │
│  ₽ 12 480                            │  ← total, text-3xl tabular-nums
│  по 8 тратам                         │
├──────────────────────────────────────┤
│  По категориям                       │
│  ▮▮▮▮▮▮▮▮▮▮ Еда           ₽ 6 200  │  ← horizontal bar list
│  ▮▮▮▮▮       Транспорт    ₽ 2 800  │
│  ▮▮▮         Развлечения  ₽ 1 800  │
│  ▮           Прочее         ₽ 1 680 │
├──────────────────────────────────────┤
│  Добавить трату                      │
│  ┌────────────────────────────────┐  │
│  │ Сумма  [    ₽] [Категория ▾]   │  │
│  │ Заметка (необязательно)        │  │
│  │ Дата [Сегодня]   [ Добавить ]  │  │
│  └────────────────────────────────┘  │
├──────────────────────────────────────┤
│  Последние                           │
│  • 17 мая  Еда         Магнит   ₽ 850│
│  • 17 мая  Транспорт   Такси    ₽ 420│
│  ...                                 │
│              [ Вся история → ]       │
└──────────────────────────────────────┘
```

### История (`/history`)

```
┌──────────────────────────────────────┐
│  ← История                          │
├──────────────────────────────────────┤
│  [ от 10.05 ] — [ до 17.05 ]   ⟳   │  ← date range, default last 7 days
├──────────────────────────────────────┤
│  Итого: ₽ 12 480 за 8 трат           │
│  ▮▮▮▮▮▮▮▮▮▮ Еда           ₽ 6 200  │  ← same breakdown as main
│  ...                                 │
├──────────────────────────────────────┤
│  Список                              │
│  17 мая                              │
│   • Магнит      Еда         ₽ 850   │
│   • Такси       Транспорт   ₽ 420   │
│  16 мая                              │
│   ...                                │
└──────────────────────────────────────┘
```

### Настройки (`/settings`)

```
┌──────────────────────────────────────┐
│  ← Настройки                        │
├──────────────────────────────────────┤
│  Категории                           │
│  ● Еда           [✎] [×]            │
│  ● Транспорт     [✎] [×]            │
│  ...                                 │
│  + Новая категория                   │
├──────────────────────────────────────┤
│  Дни зарплаты                        │
│  числа месяца 1–31, тап — выбрать    │
│  [1][2][▣3][4][5][6][7]  …  [▣17]    │
│  [ Сохранить ]                       │
├──────────────────────────────────────┤
│  Аккаунт                             │
│  email@example.com                   │
│  [ Выйти ]                          │
└──────────────────────────────────────┘
```

---

## Component Specs

### Buttons

- Primary: `bg-accent text-white px-4 py-3 rounded-md font-medium`,
  hover `bg-accent-hover`, focus ring `ring-2 ring-accent/40`.
- Secondary (outline): `bg-transparent border border-border text-text px-4 py-3 rounded-md`.
- Ghost (icon, e.g. edit/delete): `text-text-muted hover:text-text hover:bg-surface p-2 rounded-md`.
- Touch target ≥ 44×44 px on all interactive controls.

### Inputs

- Min height 44 px. `border border-border rounded-md px-3 py-2 text-base bg-surface-raised`.
- Focus: `border-accent ring-2 ring-accent/20`. No `outline: none` without ring replacement.
- Number input for amount: `inputmode="decimal"` (mobile gets decimal keypad).
- Date input: native `<input type="date">` for MVP — system picker, zero deps.
- Labels are **always visible above** the input. Placeholder ≠ label.

### Category Select

- Combo: select with options + last option `+ Создать новую…` opens inline mini-form
  (name + colour swatch picker). On save, new category becomes the selected value.
- Each option shows colour dot + name.

### Day-of-month grid (Settings → «Дни зарплаты»)

- Grid of 31 toggle buttons (1–31), 7 per row (`grid-cols-7 gap-1.5`), each
  `h-11` (≥44px tap) with `tabular-nums`. Selected = `bg-accent text-white
  border-accent`; unselected = `border-border text-text hover:bg-border/60`.
- Multi-select (a user can have several salary days). Empty selection is valid
  and hides the History «С последней зарплаты» preset; non-empty shows it.

### Cards

- `bg-surface rounded-lg p-4` (или `p-6` для главной summary).
- Static surfaces don't react to hover; clickable rows/cards get a subtle
  `hover:bg-border/60 cursor-pointer` — a translucent darken that reads on both
  tinted and untinted rows (a solid fill would vanish on the tinted zebra rows).
- Zebra lists (expense rows): tint even rows `bg-surface-sunken`, leave odd rows
  on the card surface; on hover both darken via `bg-border/60`. Surface scale is
  `sunken` < `surface` < `raised`.

### Money rendering

- Always tabular nums: `font-variant-numeric: tabular-nums`.
- Currency symbol left, space between symbol and value: `₽ 12 480`.
- Group separator: thin space (U+202F) or NBSP (U+00A0).
- No decimals if amount has no kopecks; otherwise 2 decimals (`₽ 12 480,50`).

### Charts

- **Category breakdown** = horizontal bar list (not pie). Sorted descending by amount.
  Each bar's colour = category colour. Width proportional to share of total.
  Value label at right end of bar.
- Library: lightweight inline CSS bars (flex + percentage width). No chart library needed
  for MVP — saves bundle size. Reconsider if we add timeline / trends later.

---

## Style Guidelines

**Style:** Minimal Light (default) with auto dark via `prefers-color-scheme`.

- Lots of whitespace. Single column. No decorative imagery.
- Numbers are the hero — large, tabular, high contrast.
- Colour used sparingly: category dots, CTA button, status (success/danger).
- Borders > shadows for separation on desktop. Subtle shadows on cards on mobile.

---

## Anti-Patterns (Do NOT Use)

- ❌ **Emojis as icons** — use SVG icons (Heroicons / Lucide).
- ❌ **Placeholder-only labels** — every input needs a visible `<label>`.
- ❌ **Missing `cursor-pointer`** on clickable elements.
- ❌ **Layout-shifting hovers** — no scale transforms.
- ❌ **Floating-point money** — store cents/kopecks as INTEGER.
- ❌ **Low contrast text** — keep ≥ 4.5:1.
- ❌ **Invisible focus states** — every interactive element shows focus ring.

---

## Pre-Delivery Checklist

- [ ] No emojis used as icons (use SVG instead)
- [ ] All icons from one icon set (Lucide recommended for Next.js: `lucide-react`)
- [ ] `cursor-pointer` on all clickable elements
- [ ] Hover/focus states with smooth transitions (150-300ms)
- [ ] Text contrast 4.5:1 minimum in both light and dark
- [ ] Focus states visible for keyboard navigation
- [ ] All monetary values use `tabular-nums`
- [ ] All inputs have visible `<label>`
- [ ] `prefers-reduced-motion` respected
- [ ] Responsive: 375px, 768px, 1024px, 1440px
- [ ] No horizontal scroll on mobile
