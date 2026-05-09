import BootScene from "../scenes/BootScene.js";
import MainiMenuScene from "../scenes/MainMenuScene.js";
import GameSelectScene from "../scenes/GameSelectScene.js";
import CardSelectScene from "../scenes/CardSelectScene.js";
import GameBattleScene from "../scenes/GameBattleScene.js"; 

const config = {
    type: Phaser.AUTO,
    width: 800,
    height: 800,
    scene: [
        // BootScene,
        // MainiMenuScene, 
        // GameSelectScene,
        CardSelectScene,
        GameBattleScene,
    ], // Order doesn't matters
}

new Phaser.Game(config); 