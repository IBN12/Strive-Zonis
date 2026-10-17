/** |Singularity Card Animation Testing|
 * You will be able to test out the Singularity Card SFX and Animation with
 * Electron. Each card can be toggled on and off for testing.
 *
 *   npm run electron:SCTest                 fullscreen
 *   npm run electron:SCTest -- --windowed   in a window
 *
 * The first card toggled true is played on a loop in an arena staged for its
 * attribute - an Attack card is cast by the PLAYER and taken by the OPPONENT,
 * a Defence card raises its field and is then struck, and so on. Every
 * stage lives in its own file under scAnimationTest/stages/.
 *
 * Every beat the card announces ('singularityfx:beat') is listed on screen
 * and echoed here in the terminal with its time from the card being played -
 * the times to hang each sound effect on.
 *
 *   SPACE  pause / resume      R  restart the loop
 *   F11    fullscreen          F12  DevTools      ESC  quit
 *
 * A card left null has no effect of its own yet - toggled true it plays the
 * placeholder cue.
 */

import { app, BrowserWindow, Menu } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCToTest = {
    nova_burst: false,
    containment_field: false,
    light_mend: false,
    dark_disturbance: false,
    an_artifact: false,
    heavy_mend: false,
    pattern_interruption: false,
    el_draco: null,
    samsara_wheel: null,
    sphere_network: null,
    my_lost_love: null,
    the_return: null,
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const windowed  = process.argv.includes('--windowed');

const toggled = Object.keys(SCToTest).filter(id => SCToTest[id] === true);

if (!toggled.length){
    console.log('[SCTest] No Singularity Card is toggled true in SCToTest ' +
        '(server/test/singularityCardAnimationTesting.js). Set one to true and run again.');
    process.exit(0);
}

const cardId = toggled[0];
if (toggled.length > 1){
    console.log(`[SCTest] More than one card is toggled true - testing ${cardId}. ` +
        `Also toggled: ${toggled.slice(1).join(', ')}.`);
}

function createTestWindow(){
    const win = new BrowserWindow({
        width: 1600,
        height: 900,
        useContentSize: true,
        fullscreen: !windowed,
        backgroundColor: '#000000',
        show: false,
        title: `Singularity Card Test - ${cardId}`,
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
        },
    });

    Menu.setApplicationMenu(null);
    win.once('ready-to-show', () => win.show());

    win.webContents.on('before-input-event', (event, input) => {
        if (input.type !== 'keyDown' || input.isAutoRepeat) return;

        if (input.key === 'F11'){
            win.setFullScreen(!win.isFullScreen());
            event.preventDefault();
        }
        else if (input.key === 'F12'){
            win.webContents.toggleDevTools();
            event.preventDefault();
        }
        else if (input.key === 'Escape'){
            win.close();
            event.preventDefault();
        }
    });

    // The page's beat log and any errors, echoed to this terminal.
    win.webContents.on('console-message', (event, ...legacy) => {
        const message = event.message ?? legacy[1];
        const level   = event.level ?? legacy[0];
        if (String(message).startsWith('[SCTest]') || level === 'error' || level === 3) console.log(message);
    });

    win.loadFile(path.join(__dirname, 'scAnimationTest', 'index.html'), { query: { card: cardId } });
}

app.whenReady().then(createTestWindow);
app.on('window-all-closed', () => app.quit());
