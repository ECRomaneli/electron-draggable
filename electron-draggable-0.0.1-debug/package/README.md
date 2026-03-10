<p align='center'>
    <!-- TODO: Add project banner/demo image(s) here -->
    <img src="IMAGE_PLACEHOLDER_BANNER" alt='Electron Draggable Demo'>
</p>
<p align='center'>
    Multi-platform Electron window drag tool
</p>
<p align='center'>
    <a href="https://github.com/ECRomaneli/electron-draggable/tags"><img src="https://img.shields.io/github/v/tag/ecromaneli/electron-draggable?label=version&sort=semver&style=for-the-badge" alt="Version"></a>
    <a href="https://github.com/ECRomaneli/electron-draggable/commits/master"><img src="https://img.shields.io/github/last-commit/ecromaneli/electron-draggable?style=for-the-badge" alt="Last Commit"></a>
    <a href="https://github.com/ECRomaneli/electron-draggable/blob/master/LICENSE"><img src="https://img.shields.io/github/license/ecromaneli/electron-draggable?style=for-the-badge" alt="License"></a>
    <a href="https://github.com/ECRomaneli/electron-draggable/issues"><img src="https://img.shields.io/badge/contributions-welcome-brightgreen.svg?style=for-the-badge" alt="Contributions Welcome"></a>
</p>

## Installation

Install the `electron-draggable` package via [npm](https://www.npmjs.com/package/electron-draggable):

```sh
npm install electron-draggable
```

## Overview

The `electron-draggable` package provides a lightweight, main-process solution for enabling window dragging in frameless Electron windows. It hooks into the `webContents.on('before-mouse-event')` to intercept mouse events and move the window accordingly, without requiring any CSS (`-webkit-app-region`) or renderer-process code.

<!-- TODO: Add a diagram or GIF showing the drag behavior here -->
<!-- <img src="IMAGE_PLACEHOLDER_DRAG_DEMO_GIF" alt="Drag Demo"> -->

### Highlights

- **Zero renderer-side code** — everything runs in the main process.
- **Works with `BrowserWindow` and `BaseWindow`** — supports both standard and multi-view setups.
- **Selector-based filtering** — include or exclude specific elements from dragging via CSS selectors.
- **Action area** — restrict dragging to a top region (e.g., a custom title bar).
- **Double-click to maximize** — optional built-in support for maximize/unmaximize on double-click.
- **Configurable FPS** — drag update rate defaults to the screen refresh rate.

## Usage

All public methods are documented with JSDoc and can be referenced during import.

### Importing

To import the `Draggable` class:

```js
const { Draggable } = require('electron-draggable')
```

### Creating an Instance

#### Using `Draggable.from` (recommended)

The `from` static method returns a **single cached instance** per window. If an instance already exists for the window, it is returned immediately:

```js
const drag = Draggable.from(window)
```

You can also pass drag options during creation:

```js
const drag = Draggable.from(window, { actionArea: 40, maximize: true })
```

When a `BrowserWindow` is used, its `webContents` is automatically attached as a drag source (unless `attachOnInit` is set to `false`).

#### Using `Draggable.create`

Use `create` when you need **multiple independent** drag managers for the same window:

```js
const drag = Draggable.create(window, options)
```

Each instance independently manages its own drag configuration and WebContents attachments. The instance is **not cached** on the window object.

### Drag Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `actionArea` | `number` | Entire Window | Drag zone height from top in pixels. `0` or `undefined` = entire window. |
| `selector` | `string` | Disabled | CSS selector that marks elements as drag handles. **Exclusive** with `exclude`. |
| `exclude` | `string` | Disabled | CSS selector for elements that should **NOT** trigger drag. **Exclusive** with `selector`. |
| `maximize` | `boolean` | Disabled | Enable double-click to maximize/unmaximize. |
| `fps` | `number` | Screen refresh rate | Frames per second for drag position updates. |
| `attachOnInit` | `boolean` | `true` | If true, auto-attach the `BrowserWindow.webContents` on initialization. |

> **Note:** `selector` and `exclude` are mutually exclusive. Use `selector` to whitelist draggable areas, or `exclude` to blacklist non-draggable elements within the drag zone.

### Attaching and Detaching WebContents

For `BaseWindow` setups with multiple `WebContentsView` children, you can manually attach and detach drag sources:

```js
const drag = Draggable.from(baseWindow, { actionArea: 100 })

// Attach a view's webContents with per-view overrides
drag.attach(view.webContents, { exclude: '.no-drag, button' })

// Detach when no longer needed
drag.detach(view.webContents)

// Or detach all at once
drag.detachAll()
```

Each attached `WebContents` can have its own override options that are merged with the instance defaults.

### Updating Options

You can update options at any time. Changes apply immediately to all subsequent drag interactions:

```js
// Update options for ALL attached WebContents
drag.updateOptions({ fps: 120, maximize: true })

// Update options for a SPECIFIC WebContents
drag.updateOptions(view.webContents, { actionArea: 60 })
```

### Disabling Drag

To permanently disable drag and release all references:

```js
drag.disable()
```

After calling `disable`, the instance is dead and must not be reused. The drag is also automatically disabled when the window is closed.

### Retargeting a Window

If you need to move the drag instance to a new window:

```js
drag.setWindow(newWindow)
```

This clears the old window reference and sets the new one, preserving all attached WebContents and their configurations.

### Quick Examples

#### BrowserWindow (simplest setup)

```js
const { app, BrowserWindow } = require('electron')
const { Draggable } = require('electron-draggable')

app.whenReady().then(() => {
  const window = new BrowserWindow({ frame: false })
  window.loadURL('https://github.com/ECRomaneli/electron-draggable')

  // Enable dragging on the top 40px, with double-click to maximize
  Draggable.from(window, { actionArea: 40, maximize: true })
})
```

#### BaseWindow with WebContentsView

```js
const { app, BaseWindow, WebContentsView } = require('electron')
const { Draggable } = require('electron-draggable')

app.whenReady().then(() => {
  const window = new BaseWindow({ width: 800, height: 600, frame: false })

  const view = new WebContentsView()
  window.contentView.addChildView(view)
  view.setBounds({ x: 0, y: 0, width: 800, height: 600 })
  view.webContents.loadFile('index.html')

  // Create drag instance and attach the view
  const drag = Draggable.from(window, { actionArea: 100 })
  drag.attach(view.webContents, { exclude: '.no-drag, button' })
})
```

### How It Works

<!-- TODO: Add a diagram illustrating the drag mechanism here -->
<!-- <img src="IMAGE_PLACEHOLDER_HOW_IT_WORKS_DIAGRAM" alt="How It Works"> -->

1. The `Draggable` instance hooks into `webContents.on('before-mouse-event')` for each attached `WebContents`.
2. On `mouseDown`, it checks whether the click position is within the action area and matches the selector/exclude rules (using `document.elementFromPoint` via `executeJavaScript`).
3. If the position is draggable, it records the offset between the cursor and the window position.
4. On `mouseMove`, it starts an interval (at the configured FPS) that reads the cursor screen position and updates the window position accordingly.
5. On `mouseUp` (or any non-move event), the interval is cleared and dragging stops.
6. If `maximize` is enabled and a double-click is detected, the window is toggled between maximized and normal states.

## API Reference

### Static Methods

```js
/**
 * Get or create a Draggable instance for the given window.
 * Returns a single cached instance per window.
 * @param {BaseWindow} window - The Electron window to enable dragging for.
 * @param {DragOptions} [options] - Optional drag behavior configuration.
 * @returns {Draggable} A unique Draggable instance for this window.
 */
Draggable.from(window, options)

/**
 * Create a new independent Draggable instance for the given window.
 * The instance is NOT cached on the window object.
 * @param {BaseWindow} window - The Electron window to enable dragging for.
 * @param {DragOptions} [options] - Optional drag behavior configuration.
 * @returns {Draggable} A new independent Draggable instance.
 */
Draggable.create(window, options)
```

### Instance Methods

```js
/**
 * Register a WebContents as a drag source for this window.
 * @param {WebContents} webContents - The WebContents to attach.
 * @param {DragOptions} [overrideOptions] - Optional per-WebContents drag options.
 */
attach(webContents, overrideOptions)

/**
 * Unregister a WebContents from dragging.
 * @param {WebContents} webContents - The WebContents to detach.
 */
detach(webContents)

/**
 * Unregister all WebContents from dragging.
 */
detachAll()

/**
 * Disable drag for all registered WebContents and release the window reference.
 * After calling this method, the instance is dead and must not be reused.
 */
disable()

/**
 * Update drag options for all registered WebContents.
 * @param {Partial<DragOptions>} update - Partial options to merge.
 */
updateOptions(update)

/**
 * Update drag options for a specific WebContents.
 * @param {WebContents} webContents - The WebContents to update options for.
 * @param {Partial<DragOptions>} update - Partial options to merge.
 */
updateOptions(webContents, update)

/**
 * Retarget the instance to a new window.
 * @param {BaseWindow} newWindow - The new window to attach to.
 */
setWindow(newWindow)
```

## Author

Created by [Emerson Capuchi Romaneli](https://github.com/ECRomaneli) (@ECRomaneli).

## License

This project is licensed under the [MIT License](https://github.com/ECRomaneli/electron-draggable/blob/master/LICENSE).

