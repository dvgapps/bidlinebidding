# iPad display notes (installed home-screen app)

Milestone: git tag **`milestone-ipad-bottom-fixed`** (build `4856af0`, 5 Nov 2026). On the iPad at that build the app reaches
the bottom of the screen. To go back to it: `git checkout milestone-ipad-bottom-fixed -- app/index.html app/src/index.css`
(or `git revert` the commits after the tag).

## Bottom of the app (what worked)

The app is a normal full-height box with nothing forcing it:

```css
html, body { background: #2b3942; }          /* page colour, same as the header */
.app { height: 100dvh; }                      /* like the GroceryList app */
.tabs { padding-bottom: 0; }
.tabs button {                                /* the home-indicator space is part of each tab */
  height: calc(16px + env(safe-area-inset-bottom, 0px));
  min-height: calc(16px + env(safe-area-inset-bottom, 0px));
  padding: 4px 8px env(safe-area-inset-bottom, 0px);
}
.tabs button + button { border-left: 1px solid #8a8f98; }
```

`index.html` has `viewport-fit=cover` and `apple-mobile-web-app-capable`.

What did **not** work, and was removed (they made the gap worse or did nothing; simplifying fixed it):
- `.app { position: fixed; inset: 0 }` (pinning to the screen edges).
- Painting the strip under the tab bar (`html`/`body` background colours, a `body` gradient, a no-repeat image on `html`).
- `theme-color` / manifest `background_color` set to the tab bar colour (this also made iOS draw a white fade at the top).
- Removing the tab bar's safe-area bottom padding.

## Top of the app (still has the iOS fade)

The installed app uses a transparent status bar, so the page runs under it and iOS 26 draws a gradient over the top.

`index.html`:

```html
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
<meta name="theme-color" content="#2b3942" />   <!-- keep the header colour: white made the fade show -->
```

`index.css` (the top-of-page pieces):

```css
:root { --status-strip-scale: 1.6; --status-strip: calc(env(safe-area-inset-top, 0px) * var(--status-strip-scale)); }
body::before { content: ''; position: fixed; top: 0; left: 0; right: 0; height: var(--status-strip); background: #000; z-index: 1000; pointer-events: none; }
.app { padding-top: var(--status-strip); }
.topbar { padding-top: calc(6px + env(safe-area-inset-top, 0px)); }
@media (display-mode: standalone) { .topbar { padding-top: calc(6px + env(safe-area-inset-top, 0px) + 14px); } }
@media (display-mode: standalone) and (orientation: portrait) { .topbar { padding-top: calc(6px + 14px); } }
```

The black strip is 1.6 times the status bar height so most of the fade falls on black. The fade is still faintly visible.

## What other developers report (iOS 26)

- iOS 26.1+ draws a blur or dark gradient over the top of a `black-translucent` web app; `env(safe-area-inset-top)` can read 0.
  See WebKit bug 301994 and autobrr/qui issue 2520.
- The usual workaround is to drop `black-translucent`, so the status bar is opaque and the page starts below it. The style is
  read when the app is added to the Home Screen, so the app has to be deleted and added again.
- No setting is known that keeps the page under the status bar without the fade. A fix may have to come from Apple.

## Tried and reverted: opaque status bar (`apple-mobile-web-app-status-bar-style` = `black`), 5 Nov 2026

With the style set to `black` and the top workarounds removed, the installed iPad app still drew the page under the status bar and
the fade, and the header (now without its extra top padding) sat inside the fade. It looked much worse. Reverted to the code of
the milestone tag. The app was deleted from the Home Screen and added again before the screenshot, and the build code matched, so the result is conclusive: on this iPad (iPadOS 26) the `black` style does not give an opaque status bar that pushes the page down. Because iOS keeps the style from the moment the app is added, the app has to be deleted and added again after going back to `black-translucent`.

## Header drop fix (5 Nov 2026)

The earlier "14px header drop" never applied: `.topbar, .topbar:first-child { padding-top: 6px }` is more specific than a plain
`.topbar` rule in a media query. The installed-app block now names `.topbar:first-child` too, uses 30px (6 + 14 + 10), and keeps the
black strip at least 51px tall even when iOS reports no safe-area inset (as happens if the app was added with a different status
bar style).

Update: the installed-app header top padding was then set to 20px (from 30px).
Update: then set to 10px.
Update: black strip reset to baseline: --status-strip-scale 1 (strip = 1.0 x safe-area-inset-top), the 51px minimum removed.
Update: black strip set to 1.3 x safe-area-inset-top (--status-strip-scale 1.3).
Update: black strip set to 1.6 x safe-area-inset-top (--status-strip-scale 1.6).
Update: black strip set to 2.0 x safe-area-inset-top (--status-strip-scale 2).
Update: black strip set to 4.0 x safe-area-inset-top as an extreme test (the 2.0 change was not visible).
Update: the black strip is now set in plain pixels (--status-strip: 51px in the installed-app block), not as a multiple of the safe-area inset. (The multiples did work once the app was deleted and added again; 4.0 x was an extreme test.)
Update: the black strip set to 80px.
Update: the black strip set to 40px.
