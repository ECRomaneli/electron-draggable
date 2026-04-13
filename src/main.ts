import { BaseWindow, BrowserWindow, Event, Point, Rectangle, screen, WebContents } from 'electron';

/** Configuration options for window drag behavior. */
export interface DragOptions {
  /**
   * Draggable region. If not specified, the entire content is draggable (following the other options).
   * 
   * Only checks for existing bounds:
   * @example
   * region: { height: 200 } // Draggable within 200px from top, regardless of window height
   * @example
   * region: { y: 100 } // Draggable only below 100px from top
   * @example
   * region: { y: 50, height: 100 } // Draggable between 50px and 150px from top
   */
  region?: Partial<Rectangle>;
  /** Mouse button that triggers the drag. Default: 'left' */
  button?: 'left' | 'right' | 'middle';
  /** CSS selector that marks elements as drag handles. Can be combined with `exclude`. */
  selector?: string;
  /** CSS selector for elements that should NOT trigger drag. Can be combined with `selector`. */
  exclude?: string;
  /** Enable double-click to maximize/unmaximize. */
  maximize?: boolean;
  /** Frames per second for drag updates. Default: Screen refresh rate */
  fps?: number | null;
  /** If true, auto-attach the window's webContents on initialization. Default: true */
  attachOnInit?: boolean;

}

interface InternalDragOptions extends DragOptions {
  isDraggable?: Promise<boolean> | boolean;
  interval?: NodeJS.Timeout | null;
  intervalDelay?: number;
}

type DraggableWindow = BaseWindow & {
  readonly __wdrag__?: Draggable,
  readonly webContents?: WebContents
};

export class Draggable {
  private static readonly DRAG_WINDOW_PROP = '__wdrag__';
  private static readonly CATCH_FALSE = () => false;
  private readonly optionsByWebContents = new Map<WebContents, InternalDragOptions>();
  private readonly options: InternalDragOptions;
  private readonly sharedBeforeMouseEvent: (this: WebContents, event: Event, input: Electron.MouseInputEvent) => void;
  private readonly onceWebContentsDestroyed: (this: WebContents) => void;
  private readonly onceWindowClosed = () => this.destroy();
  private readonly onResizeDuringDrag = () => this.updateOffset();
  private window?: DraggableWindow;
  private offset = { x: 0, y: 0 };

  /**
   * Get or create a WindowDrag instance for the given window.
   *
   * This method returns a single instance per window. If an instance already exists
   * for the window, it is returned immediately. Otherwise, a new instance is created,
   * registered on the window object, and returned.
   *
   * Use this method for the typical case where each window should have exactly one
   * WindowDrag instance managing its drag behavior.
   *
   * @param window The Electron window to enable dragging for
   * @param options Optional drag behavior configuration
   * @returns A unique WindowDrag instance for this window
   */
  public static from(window: DraggableWindow, options?: DragOptions): Draggable {
    if (window.__wdrag__) { return window.__wdrag__; }
    const instance = new Draggable(window, options);
    Draggable.setWindowRef(window, instance);
    return instance;
  }

  /**
   * Create a new independent WindowDrag instance for the given window.
   *
   * This method creates a new instance without registering it on the window object.
   * Multiple instances can coexist for the same window without overwriting each other.
   * Each instance independently manages its own drag configuration and WebContents attachments.
   *
   * Use this method when you need:
   * - Multiple independent drag managers for the same window
   * - Alternative workflows or parallel drag configurations
   * - Fine-grained control over instance lifecycle
   * - Testing or temporary drag behavior
   *
   * For most use cases, prefer using {@link from} to get the cached instance.
   *
   * @param window The Electron window to enable dragging for
   * @param options Optional drag behavior configuration
   * @returns A new independent WindowDrag instance
   */
  public static create(window: DraggableWindow, options?: DragOptions): Draggable {
    return new Draggable(window, options);
  }

  /**
   * Create a new WindowDrag instance for the given window.
   *
   * This constructor creates a new instance without registering it on the window object.
   * Use the static factory methods instead: {@link from} for a cached instance or {@link create} for
   * an independent one.
   *
   * @param window The Electron window to enable dragging for
   * @param options Optional drag behavior configuration
   */
  private constructor(window: DraggableWindow, options: DragOptions = {}) {
    this.options = options;
    if (options.fps === undefined) { options.fps = null }
    if (options.button === undefined) { options.button = 'left'; }
    Draggable.normalizeOptions(this.options);

    const self = this;
    this.sharedBeforeMouseEvent = function(this: WebContents, e: Event, input: Electron.MouseInputEvent) {
      self.handleBeforeMouseEvent(this, e, input);
    };
    this.onceWebContentsDestroyed = function(this: WebContents) {
      self.detach(this);
    };
    
    this.setWindow(window);
  }

  /** Register a WebContents as a drag source for this window. */
  public attach(webContents: WebContents, overrideOptions?: DragOptions): this {
    if (webContents.isDestroyed()) {
      throw new Error('Cannot attach to destroyed WebContents');
    }

    if (this.optionsByWebContents.has(webContents)) {
      overrideOptions && this.updateOptions(webContents, overrideOptions); 
      return this;
    }

    let options: InternalDragOptions;
    if (overrideOptions) {
      // Fix: Avoid changing the user-provided options object
      const newOptions = { ...overrideOptions };
      Draggable.normalizeOptions(newOptions);
      options = { ...this.options, ...newOptions };
    } else {
      options = { ...this.options };
    }

    this.optionsByWebContents.set(webContents, options);
    webContents.on('before-mouse-event', this.sharedBeforeMouseEvent);
    webContents.once('destroyed', this.onceWebContentsDestroyed);
    return this;
  }

  /** Unregister a WebContents from dragging. */
  public detach(webContents: WebContents): this {
    const options = this.optionsByWebContents.get(webContents);
    if (options) {
      webContents.off('before-mouse-event', this.sharedBeforeMouseEvent);
      webContents.off('destroyed', this.onceWebContentsDestroyed);
      this.stopDragging(options);
      this.optionsByWebContents.delete(webContents);
    }
    return this;
  }

  /** Unregister all WebContents from dragging. */
  public detachAll(): this {
    for (const wc of this.optionsByWebContents.keys()) {
      this.detach(wc);
    }
    return this;
  }

  /**
   * Disable drag for all registered WebContents and release the window reference.
   * @remarks After calling this method, the instance is dead and must not be reused.
   */
  public destroy(): this {
    if (!this.window) { return this; }
    this.detachAll();
    if (this.window.__wdrag__ === this) {
      Draggable.setWindowRef(this.window, undefined);
    }
    this.window!.off('closed', this.onceWindowClosed);
    this.window = undefined;
    return this;
  }

  /**
   * @deprecated Use {@link Draggable.destroy} instead.
   * @see {@link Draggable.destroy}
   */
  public disable(): this {
    return this.destroy();
  }

  /**
   * Update drag options all registered WebContents.
   * @param update - Partial options to merge with existing configuration
   *
   * @example
   * drag.updateOptions({ fps: 120 });
   */
  public updateOptions(update: Partial<DragOptions>): this;

  /**
   * Update drag options for specific WebContents.
   * @param wc - The WebContents to update options for
   * @param update - Partial options to merge with existing configuration
   *
   * @example
   * drag.updateOptions(webContents, { fps: 120 });
   */
  public updateOptions(wc: WebContents, update: Partial<DragOptions>): this;

  public updateOptions(wcOrUpdate: WebContents | Partial<DragOptions>, update?: Partial<DragOptions>): this {
    const newOptions = update ?? wcOrUpdate as Partial<DragOptions>;
    Draggable.normalizeOptions(newOptions);

    if (update) {
      const options = this.optionsByWebContents.get(wcOrUpdate as WebContents)!;
      Object.assign(options, newOptions);
    } else {
      for (const options of this.optionsByWebContents.values()) {
        Object.assign(options, newOptions);
      }
    }
    return this;
  }

  /** Retarget the instance to a new window. */
  public setWindow(newWindow: DraggableWindow): this {
    const oldWin = this.window;
    this.window = newWindow;
    this.window.once('closed', this.onceWindowClosed);

    // Auto-attach for BrowserWindow (has its own webContents)
    if (this.options.attachOnInit !== false && newWindow.webContents) {
      this.attach(newWindow.webContents);
    }
    
    if (oldWin) {
      if (oldWin.__wdrag__ === this) {
        Draggable.setWindowRef(oldWin, undefined);
        Draggable.setWindowRef(this.window, this);
      }
      oldWin.webContents && this.detach(oldWin.webContents);
      oldWin.off('closed', this.onceWindowClosed);
    }
    return this;
  }

  private handleBeforeMouseEvent(wc: WebContents, e: Event, input: Electron.MouseInputEvent): void {
    const options = this.optionsByWebContents.get(wc)!;

    // If not the configured button, stop dragging
    if (input.button !== options.button) {
      if (options.interval !== void 0) {
        console.debug('Stopping drag due to button mismatch');
        this.stopDragging(options);
      }
      return;
    }

    // If already dragging, handle mouse move and stop conditions
    if (options.interval !== void 0) {

      // Handle mouse move events, set up interval to update position
      if (input.type === 'mouseMove') {
        e.preventDefault();
        if (options.interval === null) {
          this.startDragging(options);
        }
        return;
      }

      // Do not prevent defaults for non-move events to allow clicks, but stop dragging.
      options.interval !== null && e.preventDefault();

      // Stop dragging on any other event, except for mouseLeave (which triggers when moving too fast)
      if (input.type !== 'mouseLeave') {
        console.debug('Dragging stopped due to event:', input.type);
        this.stopDragging(options);
      }
    }

    // Handle mouse down (only if not already dragging)
    if (input.type === 'mouseDown') {
      // Start dragging on mouse down (only if not already dragging).
      // Note: isDraggable may be async (executeJavaScript ~1-5ms). The drag begins after
      // resolution, using the cursor position at that time. If an extremely slow provider
      // is used, a mouseUp could arrive before resolution; in that case, the next mouseDown
      // will naturally clean up via the interval guard above.
      if (input.clickCount === 1) {
        // Not using input.x/y because of inconsistent values (e.g. relative to popups like color picker)
        const cursor = screen.getCursorScreenPoint();
        const point = this.getRelativeCursorPoint(cursor);
        options.isDraggable = Draggable.isDraggable(wc, point, options);
        if (options.isDraggable === false) { return; }
        this.updateOffset(cursor);
        if (options.isDraggable === true) { options.interval = null; return; }
        options.isDraggable.then(d => d && (options.interval = null));
        return;
      }

      // Handle double-click to maximize/unmaximize
      if (input.clickCount === 2 && options.maximize) {
        if (options.isDraggable === false) { return; }
        if (options.isDraggable === true) { e.preventDefault(); this.toggleMaximize(); return; }
        options.isDraggable!.then(d => d && (e.preventDefault(), this.toggleMaximize()));
      }
    }
  }

  private getRelativeCursorPoint(cursor = screen.getCursorScreenPoint()): Point {
    const winPos = this.window!.getPosition();
    return { x: cursor.x - winPos[0], y: cursor.y - winPos[1] };
  }

  private startDragging(options: InternalDragOptions) {
    const bounds = this.window!.getBounds();
    const normalBounds = this.window!.getNormalBounds();
    const isSnappedOrMaximized = bounds.x !== normalBounds.x || bounds.y !== normalBounds.y
        || bounds.width !== normalBounds.width || bounds.height !== normalBounds.height;

    if (isSnappedOrMaximized) {
      const cursor = screen.getCursorScreenPoint();

      // Calculate mouse position relative to the window size (percentage)
      const relativeX = (cursor.x - bounds.x) / bounds.width;
      const relativeY = (cursor.y - bounds.y) / bounds.height;

      console.debug('Window is maximized/snapped, restoring before drag');
      if (this.window!.isMaximized()) { this.window!.unmaximize(); }

      // Move the window so the cursor is still on the same relative position
      this.window!.setBounds({
        x: Math.round(cursor.x - relativeX * normalBounds.width),
        y: Math.round(cursor.y - relativeY * normalBounds.height),
        width: normalBounds.width,
        height: normalBounds.height
      });
      this.updateOffset(cursor);
    }

    console.debug('Dragging started');
    this.window!.on('resize', this.onResizeDuringDrag);
    options.interval = setInterval(() => this.updatePosition(), options.intervalDelay);
  }

  private stopDragging(options: InternalDragOptions) {
    if (options.interval) {
      clearInterval(options.interval);
      this.updatePosition();
    }
    this.window!.off('resize', this.onResizeDuringDrag);
    options.interval = undefined;
    console.debug('Dragging stopped');
  }

  private updateOffset(cursor: Point = screen.getCursorScreenPoint()) {
    console.debug('Updating drag offset');
    this.offset = this.getRelativeCursorPoint(cursor);
  }

  private updatePosition() {
    const mousePos = screen.getCursorScreenPoint();
    this.window!.setPosition(mousePos.x - this.offset.x, mousePos.y - this.offset.y);
  }

  private toggleMaximize() {
    console.debug('Toggling maximize');
    this.window!.isMaximized() ? this.window!.unmaximize() : this.window!.maximize();
  }

  private static isDraggable(webContents: WebContents, point: Point, options: InternalDragOptions): boolean | Promise<boolean> {
    if (options.region && !Draggable.isDraggingRegion(options.region, point)) { return false; }

    if (options.selector || options.exclude) {
      return Draggable.closest(webContents, point, options.selector, options.exclude);
    }

    return true;
  }

  private static isDraggingRegion(region: Partial<Rectangle>, point: Point): boolean {
    return (region.width === void 0 || point.x <= (region.x ?? 0) + region.width)
        && (region.height === void 0 || point.y <= (region.y ?? 0) + region.height) 
        && (region.x === void 0 || point.x >= region.x)
        && (region.y === void 0 || point.y >= region.y);
  }

  private static normalizeOptions(options: InternalDragOptions): void {
    if (options.selector) { options.selector = JSON.stringify(options.selector); }
    if (options.exclude) { options.exclude = JSON.stringify(options.exclude); }
    if (options.fps === null || (options.fps && options.fps <= 0)) { options.fps = Draggable.getDefaultFps(); }
    if (options.fps !== undefined) { options.intervalDelay = Math.floor(1000 / options.fps); }
  }

  private static getDefaultFps(): number {
    try {
        const refreshRate = screen.getAllDisplays().reduce((max, d) => Math.max(max, d.displayFrequency), 0);
        return refreshRate;
      } catch (e) {
        console.warn('Failed to get display refresh rate, defaulting to 60fps', e);
        return 60;
      }
  }

  private static closest(webContents: WebContents, p: Point, selector?: string, exclude?: string): Promise<boolean> {
    const selectorClause = selector ? `(el && !!el.closest(${selector})) && ` : 'true && ';
    const excludeClause = exclude ? `!(el && el.closest(${exclude}))` : 'true';
    return webContents.executeJavaScript(`{ const el = document.elementFromPoint(${p.x}, ${p.y}); ${selectorClause}${excludeClause}; }`).catch(Draggable.CATCH_FALSE);
  }

  private static setWindowRef(window: DraggableWindow, instance: Draggable | undefined): void {
    Object.defineProperty(window, Draggable.DRAG_WINDOW_PROP, { value: instance, configurable: true, writable: false });
  }
}
