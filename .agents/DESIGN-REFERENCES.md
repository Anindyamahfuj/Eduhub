# StudyHub UI Design References

## Design System

### Color Palette (Dark Theme)
- Background: `#0B0D17` (primary), `#111827` (secondary)
- Surface: `#1A1D2E`, `#1F2337`
- Primary: `#8B5CF6` (purple)
- Accent: `#06B6D4` (cyan)
- Text: `#E2E8F0` (primary), `#94A3B8` (secondary)
- Error: `#EF4444`
- Success: `#10B981`
- Warning: `#F59E0B`

### Typography
- Headings: Inter (700, 800)
- Body: Inter (400, 500)
- Mono: JetBrains Mono

### Spacing & Radius
- Base radius: 12px
- Card radius: 16px
- Button radius: 8px
- Input radius: 8px

---

## Components

### 1. Slider Login/Signup (CodePen Reference)

**Structure:**
- Container: 900px × 550px, border-radius: 20px, shadow
- Left panel: Sign-in form (260px width)
- Right panel: Image with overlay + CTA
- Smooth 1.2s transitions between forms

**Sign-in Form:**
- Email input (border-bottom style)
- Password input
- "Forgot password?" link
- Submit button (purple gradient)

**Sign-up Form:**
- Name input
- Email input
- Password input
- Submit button

**Image Panel:**
- Full-height background image
- Dark overlay (rgba(0,0,0,0.6))
- Text prompts for switching forms
- Toggle button with border outline

---

### 2. Dark Dashboard (LMS Reference)

**Layout:**
- Collapsible sidebar (240px → 64px)
- Top header with search + user profile
- Main content area with grid cards

**Stats Cards:**
- Icon (purple background)
- Value (large, bold)
- Label (small, muted)
- Trend indicator (up/down arrow + percentage)

**Navigation:**
- Active state: purple left border + background tint
- Hover: subtle background change
- Icons: Phosphor or Lucide

---

### 3. Geometric Decorations

**Background Elements:**
- Large circle (top-right, purple, 10% opacity)
- Triangle (bottom-left, cyan, 8% opacity)
- Dashed ring (center-left, purple, 5% opacity)
- Small dots scattered (2-4px, various colors)

---

## Pages to Redesign

1. **Login/Signup** - Slider form with dark theme
2. **Dashboard** - Stats cards + widgets
3. **Navigation** - Sidebar with icons

---

## Implementation Notes

- Keep existing functionality intact
- Add smooth transitions between views
- Use CSS custom properties for theming
- Ensure mobile responsiveness
- Maintain existing API integrations
