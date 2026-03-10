const { BaseWindow, WebContentsView, app, Menu, MenuItem, ipcMain } = require('electron')
const { Draggable } = require('electron-draggable')

app.whenReady().then(() => {  
  const window = setupWindow();
  setupFindbar(window);
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
  view.webContents.loadFile(`${__dirname}/sample.html`);
  Draggable.from(window, { actionArea: 100 }).attach(view.webContents, { exclude: '.not-draggable, pre, button'});
  return window;
}

function renewWindow(window) {
  const newWindow = new BaseWindow({ width: 800, height: 600 })
  newWindow.contentView.addChildView(window.contentView.children[0]);
  window.close();
  return newWindow;
}

function setupApplicationMenu(window) {
  const appMenu = Menu.getApplicationMenu() ?? new Menu(); // Your menu here
  appMenu.append(new MenuItem({ label: 'Menu', submenu: [
    { label: 'toggleDevTools', accelerator: 'CommandOrControl+Shift+I', click: () => { window.contentView.children[0].webContents.openDevTools() } },
    { label: 'Test renew Window', click: () => window = renewWindow(window) },
    { label: 'Test hide/show parent window', click: () => { window.hide(); setTimeout(() => window.show(), 2000); }, accelerator: 'CommandOrControl+H' },
  ]}))
  Menu.setApplicationMenu(appMenu);
}
