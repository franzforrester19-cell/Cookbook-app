# My Cookbook

A free, private, installable cookbook designed for iPad. Recipes and photos stay in the browser on the device—there is no account, subscription, database, or paid API.

## What it does

- Opens the iPad camera or Photos library from the **Scan recipe** button.
- Automatically reads a selected photo or screenshot with free in-browser OCR, then opens the extracted recipe for review.
- Also supports pasted text or manual entry when needed.
- Extracts ingredients, method, cooking times, servings, and suggested categories for review.
- Searches recipes, filters categories, and saves favourites.
- Adjusts ingredient amounts when servings change.
- Stores photos and recipes locally with IndexedDB.
- Exports and restores a private cookbook backup.
- Works offline after the app shell has loaded once. OCR may need a connection the first time its language files are loaded.
- Installs from Safari with **Share → Add to Home Screen → Open as Web App**.

## Privacy and limitations

The app does not send cookbook data to an application server. The OCR library runs in the browser. A social-media link is saved as the recipe source; because social sites commonly block browser extraction, paste the caption or upload a screenshot for reliable importing.

Browser storage can be cleared by the device or user, so download a backup regularly.

## GitHub Pages

The included workflow publishes the `dist` folder whenever changes are pushed to `main`. In the repository’s **Settings → Pages**, choose **GitHub Actions** as the source if prompted.

## Local preview

Serve the `dist` folder with any small static web server. Service workers and installability require an HTTP(S) address rather than opening `index.html` directly from Files.

## Licence

MIT. Tesseract.js is provided separately under the Apache-2.0 licence.
