// import BootScene from "../scenes/BootScene.js";
// import MainiMenuScene from "../scenes/MainMenuScene.js";
// import GameSelectScene from "../scenes/GameSelectScene.js";
import CardSelectScene from "../scenes/CardSelectScene.js";
import GameBattleScene from "../scenes/GameBattleScene.js"; 

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
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: 800,
        height: 800,
        min:{
            width: 320,
            height: 320,
        },
        max:{
            width: 1600,
            height: 1600, 
        },
    },

    scene: [
        // BootScene,
        // MainiMenuScene, 
        // GameSelectScene,
        CardSelectScene,
        GameBattleScene,
    ], // Order doesn't matters
}

new Phaser.Game(config); 