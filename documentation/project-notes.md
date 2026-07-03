# Project Notes

## Design System
- Palette: `#1A1A1A` (primary/dark), `#D4AF37` (gold accent), `#FFFFFF`, `#F5F5F5` (bg), `#333333` (text)
- Fonts: Playfair Display (headings), Poppins (body), Montserrat (UI/labels/buttons)
- Signature concept: hero headline weight "fades" line by line (900 → 700 → 400), echoing a skin fade haircut
- Services are styled as a chalkboard ticket menu (dotted leaders to price), not generic cards

## Structure decisions
- Navbar, footer, and loader live in `components/` and are injected at runtime via `[data-include]` + `fetch()` in `js/main.js`
- This requires the site to be served over http(s) — use VS Code "Live Server" or `python3 -m http.server` during development; `fetch()` of local files won't work over `file://`
- `data-page` attribute on `<body>` drives active nav-link highlighting
- `data-reveal` attribute on elements triggers scroll-in animation via IntersectionObserver in `js/animation.js`
- `data-counter="N"` on a span animates a count-up when scrolled into view

## Status
- [x] Folder structure
- [x] Design tokens (variables.css)
- [x] Core styles, responsive rules, animations
- [x] Navbar / footer / loader components
- [x] Home page (all sections from brief)
- [ ] About page
- [ ] Services page (full menu)
- [ ] Gallery page (filter + lightbox)
- [ ] Team page
- [ ] Booking page (form + validation)
- [ ] Contact page (map + form)
- [ ] Real photography to replace placeholders in assets/images/

## Asset placeholders to fill
- `assets/images/hero-placeholder.jpg` — hero background photo
- `assets/images/services/*.jpg` — one per service (classic-haircut, skin-fade, beard-trim, hot-towel-shave, premium-package)
