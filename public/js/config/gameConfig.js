// import BootScene from "../scenes/BootScene.js";
import MainiMenuScene from "../scenes/MainMenuScene.js";
import GameSelectScene from "../scenes/GameSelectScene.js";
import CardSelectScene from "../scenes/CardSelectScene.js";
import GameBattleScene from "../scenes/GameBattleScene.js";
import MultiplayerScene from "../scenes/MultiplayerScene.js";
import ProfileAuthScene from "../scenes/ProfileAuthScene.js";


/** |Notes|
 * => FIT: FIT keeps your 800x800 design intact and adds bars (letterbox/pillarbox) where the screen
 * is a different aspect ratio. Thiss is the simplest path and workss great for card games since
 * layoutss stay predictable. The Alternatives: 
 * -> RESIZE: Canvas fills the screen and you repositino elements per resolution. Most 
 * flexible, most work.
 * -> ENVELOP: Fills the screen by cropping the edges. Risky for UI-heavy games.
 * 
 * For a card game, stick with 'FIT'. 
 */

const config = {
    type: Phaser.AUTO,
    parent: 'game-container',
    backgroundColor: '#1a1a1a',

    // For the authorization form:
    // Note: Creates a DOM container over the canvas:
    dom: {
        createContainer: true,
    },

    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: 1920,
        height: 1080,
        min:{
            width: 640,
            height: 360,
        },
        max:{
            width: 3840,
            height: 2160, 
        },
    },

    render:{
        pixelArt: false,
        antialias: true, 
        roundPixels: true,
    },
    
    physics:{
        default: 'arcade',
        arcade: {
            gravity: { x: 0, y: 0, },
            debug: false, 
        }
    }, 

    scene: [
        // BootScene,
        MainiMenuScene, 
        GameSelectScene,
        CardSelectScene,
        GameBattleScene,
        MultiplayerScene,
        ProfileAuthScene, 
    ], // Order doesn't matters
}

new Phaser.Game(config); 