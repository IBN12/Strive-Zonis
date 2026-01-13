export default class GameSelectScene extends Phaser.Scene {
    constructor(){
        super('GameSelectScene');
    }

    preload(){
        this.load.image('gameSelectMenuBg', ' assets/backgroundImages/gameSelectMenuBg1.png'); 
    }

    create(){
        // Center variables:
        const centerX = this.sys.game.config.width / 2; 
        const centerY = this.sys.game.config.height / 2;

        // Add the background image:
        let bgImage = this.add.image(400, 400, 'gameSelectMenuBg');
        bgImage.scale = 0.8;
        
        // Smooth camera fade in: 
        this.cameras.main.fadeIn('2000', 0, 0, 0); 

        // Select mode text:
        this.add.text(centerX, centerY, 'Select Mode', {
            fontSize: '48px',
            fill: '#fff', 
        }).setOrigin(0.5, 4); 

        // createUIButton(): Arrow function will set our UI button layout:
        const createdUIButton = (y, label, onClick) => {
            // dimensions:
            const width = 300;
            const height = 60; 
            const corner = 15; 

            // Draw the border Phaser graphics: 
            const border = this.add.graphics();
            border.lineStyle(3, 0xffffff, 0.7); 
            border.strokeRoundedRect(-width/2, -height/2, width, height, corner);

            // Transparent "glass" background:
            border.fillStyle(0xffffff, 0.05);
            border.fillRoundedRect(-width/2, -height/2, width, height, corner);

            // Text label:
            const text = this.add.text(0, 0, label, {
                fontSize: '28px',
                fill: '#fff',
            }).setOrigin(0.5); 

            // Combine into a container for easy interaction: 
            const container = this.add.container(centerX, y, [border, text])
                .setSize(width, height)
                .setInteractive({ useHandCursor: true });
            
            // Hover effect: 
            container.on('pointerover', () => {
                border.clear();
                border.lineStyle(3, 0xffffff, 1);
                border.strokeRoundedRect(-width/2, -height/2, width, height, corner);
                border.fillStyle(0xffffff, 0.1); 
                border.fillRoundedRect(-width/2, -height/2, width, height, corner); 
            });

            container.on('pointerout', () => {
                border.clear(); 
                border.lineStyle(3, 0xffffff, 0.7);
                border.strokeRoundedRect(-width/2, -height/2, width, height, corner);
                border.fillStyle(0xffffff, 0.05);
                border.fillRoundedRect(-width/2, -height/2, width, height, corner); 
            });

            container.on('pointerdown', () => {
                this.cameras.main.fadeOut(2000, 0, 0, 0); 
                this.time.delayedCall(3000, onClick); 
            });
        }

        // Create each button:
        createdUIButton(centerY - 80, 'Exhibition Game', () => { this.scene.start('CardSelectScene') }); // Quick Game Mode
    }
}