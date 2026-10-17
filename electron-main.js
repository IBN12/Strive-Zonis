import { app, BrowserWindow, Menu, screen, shell } from "electron";
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from "node:url";

// --WSL GPU FIX-- Under WSL2, Chromium blocklists the GPU and Mesa falls back to llvmpipe
// (CPU rendering), so Phaser runs with no WebGL and lags badly. Point Mesa at the D3D12
// driver (the real Windows GPU) and skip the blocklist. Chromium reads the environment at
// startup, so if GALLIUM_DRIVER isn't set yet we relaunch ourselves once with it set.
if (process.platform === 'linux' && os.release().toLowerCase().includes('microsoft'))
{
    if (!process.env.GALLIUM_DRIVER)
    {
        spawn(process.execPath, process.argv.slice(1), {
            env: { ...process.env, GALLIUM_DRIVER: 'd3d12' },
            stdio: 'inherit',
        }).on('exit', (code) => process.exit(code ?? 0));
        await new Promise(() => {});            // Wait here; the relaunched copy runs the game
    }
    app.commandLine.appendSwitch('ignore-gpu-blocklist');
}

const chooseWindowDuration = {
    originalWindow: false,
    newWindow: true,
}

// ES modules have no __dirname, so  we build it ourselves:
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// true while developing (npm run electron), false in the installed game:
const isDev = !app.isPackaged;

// .env is only for `npm run electron`; a packaged game has no .env and ships no node_modules.
if (isDev) await import('dotenv/config');

// --BUILD MODE-- `npm run build:dev*` / `build:prod*` stamp strive.buildMode into the packaged
// package.json; `npm run electron` uses the value in the real package.json ("development").
const { strive } = JSON.parse(fs.readFileSync(path.join(app.getAppPath(), 'package.json'), 'utf8'));
const buildMode = strive.buildMode;
const isProdBuild = buildMode === 'production';

// --NEW WINDOW-- `npm run electron:windowed` passes --windowed; players get fullscreen.
const windowed = process.argv.includes('--windowed');

// The game is loaded FROM the server (not from file://) so login cookies and CORS work
// exactly like they do in a browser. Server addresses live in package.json -> strive.servers;
// STRIVE_SERVER_URL overrides them for a single run.
const SERVER_URL = process.env.STRIVE_SERVER_URL || strive.servers[buildMode];

// DevTools (F12) everywhere except production builds:
const allowDevTools = !isProdBuild;

// Shown while the server can't be reached; we retry automatically.
const offlinePage = 'data:text/html;charset=utf-8,' + encodeURIComponent(`
    <body style="background:#000;color:#ccc;font-family:sans-serif;display:grid;place-items:center;height:100vh;margin:0">
        <div style="text-align:center">
            <h2>Can't reach the Strive Zonis server</h2>
            <p>${SERVER_URL}</p>
            <p>Retrying...</p>
        </div>
    </body>`);

// --ORIGINAL WINDOW--:
let mainWindow;

/**
 * Work out a 16:9 window size that fits on the player's monitor.
 * A 1920x1080 game area PLUS a title bar is taller than a 1080p screen,
 * so on those monitors we use 80% of the free space (above the taskbar).
 * On a 1440p or 4k monitor the full 1920x1080 fits, so we use that. 
 */
function windowedSize(win){
    const display = win 
        ? screen.getDisplayMatching(win.getBounds())        // The montitor the window is on
        : screen.getPrimaryDisplay();

    const area = display.workArea;                          // Screen minus the taskbar
    const maxW = Math.min(1920, Math.floor(area.width * 0.8));
    const maxH = Math.min(1080, Math.floor(area.height * 0.8));
    const width = Math.min(maxW, Math.floor(maxH * 16 / 9)); // keep 16:9
    return { width, height: Math.round(width * 9 /16) };
}

if (chooseWindowDuration.newWindow)
{
    function createNewWindow(){
        const size = windowedSize(null); 

        const win = new BrowserWindow({
            width: size.width,
            height: size.height,
            useContentSize: true,               // width/height = the game area, not the title bar
            minWidth: 640,
            minHeight: 360,
            fullscreen: !windowed,              // Borderless fullscreen, like most pc games. 
            backgroundColor: '#000000',       // No white flash while loading
            show: false,
            title: 'Strive: We Are Zonis', 
            webPreferences: {
                contextIsolation: true,         // Keep these three on: your game page
                nodeIntegration: false,         // Can't touch files or the OS
                sandbox: true,
                devTools: allowDevTools         // No DevTools in the production game
            }
        }); 

        Menu.setApplicationMenu(null);          // Games don't have a File/Edit/View menu
        win.once('ready-to-show', () => win.show());

        // When we come OUT of fullscreen, give the window a size that fits the screen and centre
        // it. We wait for this event becauses the OS restores the old size first and would 
        // overwrite anything we set earlier:
        win.on('leave-full-screen', () => {
            const { width, height } = windowedSize(win);
            win.setContentSize(width, height);
            win.center();
        });

        // Keyboards shortcuts at the window level:
        win.webContents.on('before-input-event', (event, input) => {
            if (input.type !== 'keyDown' || input.isAutoRepeat) return; // holding a key = one toggle
            if (input.key === 'F11' || (input.key === 'Enter' && input.alt))
            {
                win.setFullScreen(!win.isFullScreen());
                event.preventDefault();
            }
            else if (allowDevTools && input.key === 'F12')
            {
                win.webContents.toggleDevTools();
                event.preventDefault();
            }
        }); 

        // Links that leave the game open in the player's browser, never inside the game window:
        const serverOrigin = new URL(SERVER_URL).origin;
        win.webContents.setWindowOpenHandler(({ url }) => {
            if (url.startsWith('http')) shell.openExternal(url);
            return { action: 'deny' };
        });
        win.webContents.on('will-navigate', (event, url) => {
            if (new URL(url).origin !== serverOrigin) event.preventDefault();
        });

        // Server down (or not started yet): show the offline page and keep retrying.
        win.webContents.on('did-fail-load', (_e, _code, _desc, url, isMainFrame) => {
            if (!isMainFrame || url.startsWith('data:')) return;
            win.loadURL(offlinePage);
            setTimeout(() => !win.isDestroyed() && win.loadURL(SERVER_URL), 3000);
        });

        // Load the SAME public/index.html that Express serves in the browser.
        win.loadURL(SERVER_URL);
    }

    app.whenReady().then(createNewWindow);
    app.on('window-all-closed', () => app.quit()); 
    
}
else if (chooseWindowDuration.originalWindow)
{
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
}



