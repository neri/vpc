// Electron bootstrap
const { app, Menu, BrowserWindow } = require('electron');

const path = require('path');
const url = require('url');

let mainWindow;

const createWindow = () => {
  mainWindow = new BrowserWindow(
    {
      // titleBarStyle: 'hidden',
      width: 640, 
      height: 480,
    });

  mainWindow.loadURL(url.format({
      pathname: path.join(__dirname, '/index.html'),
      protocol: 'file:',
      slashes: true
  }));

  mainWindow.setMenuBarVisibility(false)
  mainWindow.setAutoHideMenuBar(true)
  if (process.env.NODE_ENV === 'development') {
    mainWindow.openDevTools()
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.on('ready', () => {
  // const template = [
  //   {
  //     label: "Main",
  //     submenu: [
  //       {label: "About", role: "about"},
  //       {type: "separator"},
  //       {label: "DevTool", role: "toggledevtools"},
  //       {type: "separator"},
  //       {label: "Quit", role: "quit"},
  //     ]
  //   },
  //   {label: "Edit", role: "editMenu"}
  // ]
  
  // const menu = Menu.buildFromTemplate(template)
  // Menu.setApplicationMenu(menu)

  createWindow()
});

app.on('window-all-closed', () => {
  // if (process.platform !== 'darwin') {
    app.quit();
  // }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});
