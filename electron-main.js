import { app, BrowserWindow, Menu } from "electron";

let mainWindow;

function createWindow(){
    mainWindow = new BrowserWindow({
        width: 1024,
        height: 1024,
        minWidth: 400,
        minHeight: 400,
        backgroundColor: '#1a1a1a',
        title: 'Strive Zonis',
        webPreferences:{
            contextIsolation: true,
            nodeIntegration: false, 
        }, 
    }); 

    // Load your game's index.html:
    mainWindow.loadFile('public/index.html'); 

    // Remove default menu bar (File/Edit/View/etc.) for a cleaner game feel:
    Menu.setApplicationMenu(null);

    // Uncomment during development to open DevTools automatically:
    // mainWindow.webContents.openDevTools();

    mainWindow.on('closed', () => {
        mainWindow = null;
    }); 
}

app.whenReady().then(createWindow); 

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin')
    {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0)
    {
        createWindow(); 
    }
});  