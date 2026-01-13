import BootScene from "../scenes/BootScene.js";
import MainiMenuScene from "../scenes/MainMenuScene.js";
import GameSelectScene from "../scenes/GameSelectScene.js";
import CardSelectScene from "../scenes/CardSelectScene.js";

const config = {
    type: Phaser.AUTO,
    width: 800,
    height: 800,
    scene: [
        // BootScene,
        // MainiMenuScene, 
        // GameSelectScene,
        CardSelectScene,
    ], // Order doesn't matters
}

new Phaser.Game(config); 