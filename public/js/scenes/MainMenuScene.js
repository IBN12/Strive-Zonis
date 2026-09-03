export default class MainiMenuScene extends Phaser.Scene {
    constructor(){
        super('MainMenuScene'); 
    }

    preload(){
        this.load.image('mainMenuBg', 'assets/backgroundImages/mainMenuBg1.png'); 
    }

    create(){
        // Width and height of screen:
        const width = this.scale.width;
        const height = this.scale.height; 

        // Smooth fade in:
        this.cameras.main.fadeIn(2000, 0, 0, 0); 

        // Add the background image: 
        let image = this.add.image(width / 2, height / 2, 'mainMenuBg');
        const scaleX = (width / image.width);
        const scaleY = (height / image.height);
        const scale = Math.max(scaleX, scaleY);

        image.setScale(scale).setScrollFactor(0); 
        // image.scale = 1.8;

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

        // Multiplayer button:
        const multiplayerButton = this.add.text(centerX, centerY, 'Multiplayer', {
            fontSize: '32px',
            fill: '#fff', 
            stroke: '#dc2626',
            strokeThickness: 2, 
        }).setOrigin(0.5, 2).setInteractive({ useHandCursor: true }); 
        multiplayerButton.on('pointerover', () => multiplayerButton.setStyle({ fill: 'red' }));
        multiplayerButton.on('pointerout', () => multiplayerButton.setStyle({ fill: '#fff' })); 

        // Settings button: 
        const settingsButton = this.add.text(centerX, centerY, 'Settings', {
            fontSize: '32px',
            fill: '#fff',
            stroke: '#dc2626',
            strokeThickness: 2,
        }).setOrigin(0.5, 0).setInteractive({ userHandCursor: true }); 
        settingsButton.on('pointerover', () => settingsButton.setStyle({ fill: 'red' }));
        settingsButton.on('pointerout', () => settingsButton.setStyle({ fill: '#fff' }));  

        // |User 'pointerdown' Events|
        // PlaygameButton 'pointerdown' events: 
        playGameButton.on('pointerdown', () => {
            // smooth scenes fadeout with delay scene transition:
            this.cameras.main.fadeOut(2000, 0, 0, 0); // Smooth fadeout

            // Remove Interactive events after the user clicks on button. 
            playGameButton.removeInteractive(); 
            multiplayerButton.removeInteractive();
            settingsButton.removeInteractive(); 

            this.time.delayedCall(3000, () => this.scene.start('GameSelectScene')); // Wait 1 second before scene transition. 
        });

        // MultiplayerButton 'pointerdown' events: 
        multiplayerButton.on('pointerdown', () => {
            this.cameras.main.fadeOut(2000, 0, 0, 0);

            playGameButton.removeInteractive(); 
            multiplayerButton.removeInteractive();
            settingsButton.removeInteractive();

            this.time.delayedCall(3000, () => this.scene.start('MultiplayerScene'));  
        });
    }
}