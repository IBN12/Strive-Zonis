export default class MainiMenuScene extends Phaser.Scene {
    constructor(){
        super('MainMenuScene'); 
    }

    preload(){
        this.load.image('mainMenuBg', 'assets/backgroundImages/mainMenuBg1.png'); 
    }

    create(){
        // Smooth fade in:
        this.cameras.main.fadeIn(2000, 0, 0, 0); 

        // Add the background image: 
        let image = this.add.image(400, 400, 'mainMenuBg');
        image.scale = 0.8;

        // Center Variables:
        const centerX = this.sys.game.config.width / 2;
        const centerY = this.sys.game.config.height / 2;

        // Title Text: 
        this.add.text(centerX, centerY, 'Strive: We Are Zonis', {
            fontSize: '48px', 
            fill: '#fff', 
        }).setOrigin(0.5, 6); 

        // Play game button:
        const playGameButton = this.add.text(centerX, centerY, 'Play Game', {
            fontSize: '32px',
            fill: '#fff',
            stroke: '#dc2626',
            strokeThickness: 2,
        }).setOrigin(0.5, 4).setInteractive({ useHandCursor: true });  
        playGameButton.on('pointerover', () => playGameButton.setStyle({ fill: 'red' })); 
        playGameButton.on('pointerout', () => playGameButton.setStyle({ fill: '#fff' }));

        // Settings button: 
        const settingsButton = this.add.text(centerX, centerY, 'Settings', {
            fontSize: '32px',
            fill: '#fff',
            stroke: '#dc2626',
            strokeThickness: 2,
        }).setOrigin(0.5, 2).setInteractive({ userHandCursor: true }); 
        settingsButton.on('pointerover', () => settingsButton.setStyle({ fill: 'red' }));
        settingsButton.on('pointerout', () => settingsButton.setStyle({ fill: '#fff' }));  


        // |User 'pointerdown' Events|
        // PlaygameButton 'pointerdown' events: 
        playGameButton.on('pointerdown', () => {
            // smooth scenes fadeout with delay scene transition:
            this.cameras.main.fadeOut(2000, 0, 0, 0); // Smooth fadeout

            // Remove Interactive events after the user clicks on button. 
            playGameButton.removeInteractive(); 
            settingsButton.removeInteractive(); 

            this.time.delayedCall(3000, () => this.scene.start('GameSelectScene')); // Wait 1 second before scene transition. 
        });
    }
}