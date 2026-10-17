export default class BootScene extends Phaser.Scene{
    constructor(){
        super('BootScene'); // Calls the Phaser Scene constructor: key used to start this scene. 
    }

    preload(){

    }
    
    create(){
        // Center variables: 
        const centerX = this.sys.game.config.width / 2;
        const centerY = this.sys.game.config.height / 2; 

        // Will review and provide the correct session for the multiplayer:
        this._sessionProcedure();

        // Enter game button:
        const playButton = this.add.text(centerX, centerY, 'Enter Game', {
            fontSize: '32px',
            color: 'white', 
            fontFamily: 'Times New Roman',
        }).setOrigin(0.5).setInteractive({ cursor: 'pointer' }).setLetterSpacing(10); 

        // Player will enter the game when clicking on the 'Enter Game' button:
        playButton.on('pointerdown', () => {
            this.cameras.main.fadeOut(2000, 0, 0, 0); 
            playButton.removeInteractive();  
            this.time.delayedCall(3000, () => this.scene.start('MainMenuScene')); 
        }); 

        // Hover effect:
        playButton.on('pointerover', () => playButton.setStyle({
            fill: '#f12711',
        }));
        playButton.on('pointerout', () => playButton.setStyle({
            fill: 'white',
        }));
    }

    // _sessionProcedure(): Review and provides the session procedure for the user.
    _sessionProcedure(){
        // Will add session restore on boot here - Now that sessionss are real, check
        // for one when the game starts. 
    }
}