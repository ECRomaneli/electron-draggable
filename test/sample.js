const { BaseWindow, WebContentsView, app, Menu, MenuItem, ipcMain } = require('electron')
const { Draggable } = require('electron-draggable')

app.whenReady().then(() => {  
  const window = setupWindow();
  Menu.setApplicationMenu(null);
  setupApplicationMenu(window);
})

function setupWindow() {
  const window = new BaseWindow({ width: 800, height: 600, frame: false });
  
  const view = new WebContentsView({
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });
  window.contentView.addChildView(view);
  view.setBounds({ x: 0, y: 0, width: 800, height: 600 });
  window.on('resize', () => {
    const [width, height] = window.getContentSize();
    view.setBounds({ x: 0, y: 0, width, height });
  });
  view.webContents.loadFile(`${__dirname}/sample.html`);
  const dragHandler = Draggable.from(window, { region: { height: 100 }, maximize: true }).attach(view.webContents, { exclude: '.not-drag-1'});
  window.__wdrag__ = null;
  window.__wdrag__ = void 0;
  Draggable.create(window, { selector: '.drag-2', fps: 10 }).attach(view.webContents);
  Draggable.create(window, { selector: '.drag-3', button: 'middle' }).attach(view.webContents);
  if (dragHandler !== Draggable.from(window)) {
    window.destroy();
    throw new Error('attach did not return the Draggable instance');
  }
  return window;
}

function setupApplicationMenu(window) {
  const appMenu = Menu.getApplicationMenu() ?? new Menu(); // Your menu here
  appMenu.append(new MenuItem({ label: 'Menu', submenu: [
    { label: 'toggleDevTools', accelerator: 'CommandOrControl+Shift+I', click: () => { window.contentView.children[0].webContents.openDevTools() } },
  ]}))
  Menu.setApplicationMenu(appMenu);
}
