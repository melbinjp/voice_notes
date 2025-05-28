# PWA & APK Best Practices and Maintenance Guide

This guide helps you keep your PWA and APK compatible with PWABuilder, Play Store, and modern browsers. Follow these steps when making changes or updates.

---

## 1. Manifest (`manifest.json`)
- **name**: Full app name (string, >0 length)
- **short_name**: Short app name (string, >0 length)
- **description**: Brief description (string, >0 length)
- **id**: Unique string, usually "/" or your app's root path
- **start_url**: Where the app starts (usually "." or "/")
- **scope**: URL scope (usually "." or "/")
- **display**: "standalone" or "fullscreen" for app-like feel
- **display_override**: ["standalone", "window-controls-overlay"] for best compatibility
- **background_color** and **theme_color**: Set for splash and UI
- **orientation**: e.g., "portrait" (must be a valid value)
- **lang**: e.g., "en" (valid language code)
- **dir**: "ltr", "rtl", or "auto"
- **icons**: At least 192x192 and 512x512 PNGs
- **screenshots**: Array of screenshot objects (see below)
- **categories**: Array of strings (e.g., ["productivity", "notes"])
- **launch_handler**: { "client_mode": "auto" }
- **prefer_related_applications**: Boolean (usually false)

### Example Screenshot Object
```
{
  "src": "screenshot-1.png",
  "sizes": "540x960",
  "type": "image/png",
  "label": "Main UI"
}
```

---

## 2. Service Worker
- Must be present and registered in your app.
- Should cache all core assets and support offline use.
- Use a network-first strategy for HTML to allow updates.
- Respond to `skipWaiting` messages for update banners.

---

## 3. App Structure
- All asset paths should be relative (e.g., `./app.js`).
- Place all files in the root or `/docs` for GitHub Pages.
- Add a `.nojekyll` file if using GitHub Pages.

---

## 4. Required Manifest Fields for PWABuilder/Play Store
- `description`, `id`, `scope`, `orientation`, `lang`, `dir`, `screenshots`, `categories`, `launch_handler`, `prefer_related_applications`.
- All must be valid and non-empty.

---

## 5. Optional Advanced Features
- `display_override`, `window-controls-overlay`, `file_handlers`, `protocol_handlers`, `shortcuts`, `share_target`, `background sync`, `push notifications`, etc. (Add as needed.)

---

## 6. When Updating the App
- Update version in `CACHE_NAME` in `service-worker.js` if you want to force a cache refresh.
- Add new screenshots if UI changes.
- Test on PWABuilder before publishing APK.
- Always check for new required manifest fields.

---

## 7. Troubleshooting PWABuilder Warnings
- **Service Worker not found**: Ensure `service-worker.js` is present and registered in your JS.
- **description/id/scope/lang/dir/orientation/screenshots/categories/launch_handler**: All must be present and valid in `manifest.json`.
- **Screenshots**: Add at least one PNG screenshot (540x960 or similar) to your repo and reference it in the manifest.
- **App not updating**: Make sure your service worker uses a network-first strategy for HTML and supports `skipWaiting`.

---

## 8. Publishing as APK
- Use [PWABuilder](https://www.pwabuilder.com/).
- Enter your live PWA URL.
- Fix any manifest or service worker warnings.
- Download and test the APK before publishing.

---

## 9. References
- [PWABuilder Manifest Docs](https://docs.pwabuilder.com/#/home/pwa-manifest)
- [Web App Manifest Spec](https://developer.mozilla.org/en-US/docs/Web/Manifest)
- [Service Worker Cookbook](https://serviceworke.rs/)

---

**Keep this file updated as your app evolves!**
