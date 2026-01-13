export default class CardSelectScene extends Phaser.Scene{
    constructor(){
        super('CardSelectScene'); 
    }

    init(){
        this.selectedCards = { 
            supra: null,
            fere: null,
            bonum1: null,
            bonum2: null, 
        }; 

        // this.availableCards = this.generatedCardPool();
    }

    preload(){

    }

    create(){
        // Central variables
        const centerX = this.sys.game.config.width / 2;
        const centerY = this.sys.game.config.height / 2; 

        // Smooth fade in camera transition:
        this.cameras.main.fadeIn(2000, 0, 0, 0);  

        // Settings the scene background color:
        // this.cameras.main.setBackgroundColor('#dc2626'); 

        // The width and height of the entire scene:
        const {width, height } = this.cameras.main;

        // Scene title text: 
        // this.add.text(centerX, centerY, 'Select Initiators', {
        //     fontSize: '40px',
        //     fill: '#fff', 
        // }).setOrigin(0.5, 10); 

        // Dark gradient background:
        this.createGradientBackground(); 

        // Create title with glow effect:
        this.createTitle(); 

        // Main glass container:
        this.createGlassContainer();

        // Selection slots (where selected cards go):
        this.createSelectionSlots();

        // Card pool sections: 
        this.createCardPoolSections();
    }

    // createGradientBackground(): Will create a dark gradient background:
    createGradientBackground(){
        const { width, height } = this.cameras.main; 

        // Create gradient effect with overlapping rectangles:
        const bg1 = this.add.rectangle(0, 0, width, height, 0x0f0f1e).setOrigin(0);
        // const bg2 = this.add.rectangle(0, 0, width, height / 2, 0x1a1a3e, 0.5).setOrigin(0); 
        // const bg3 = this.add.rectangle(0, height / 2, width, height / 2, 0x16213e, 0.3).setOrigin(0); 

        // Animated particles for atmosphere:
        this.createFloatingParticles();
    }

    // createFloatingParticles(): Will create animated particles:
    // Note: Study this section to understand everything:
    // Study: Phaser.Math.Between and tweens
    createFloatingParticles(){
        const { width, height } = this.cameras.main;

        for (let i = 0; i < 20; i++){
            const x = Phaser.Math.Between(0, width);
            const y = Phaser.Math.Between(0, height);
            const size = Phaser.Math.Between(2, 4); 

            const particle = this.add.circle(x, y, size, 0x4ecdc4, 0.3); 

            this.tweens.add({
                targets: particle,
                y: y - Phaser.Math.Between(100, 300), 
                alpha: 0, 
                duration: Phaser.Math.Between(3000, 6000),
                repeat: -1, 
                delay: Phaser.Math.Between(0, 2000)
            }); 
        }
    } 

    // createTitle(): Will create a title with a glow effect:
    createTitle(){
        const { width } = this.cameras.main;

        // Scene title: 
        const title = this.add.text(width / 2, 60, 'SELECT YOUR BATTLE DECK', {
            fontSize: '42px',
            fontStlye: 'bold', 
            color: '#00ffff',
            stroke: '#000000',
            strokeThickness: 4,
        }).setOrigin(0.5); 

        // Glow effect:
        const glow = this.add.text(width / 2, 60, 'SELECT YOUR BATTLE DECK', {
            fontSize: '42px',
            fontStyle: 'bold',
            color: '#00ffff',
            stroke: '#00ffff',
            strokeThickness: 8, 
        }).setOrigin(0.5).setAlpha(0.3); 

        // Pulse animation:
        this.tweens.add({
            targets: glow,
            alpha: 0.6,
            duration: 1500,
            yoyo: true,
            repeat: -1, 
        }); 
    }

    // createGlassContainer(): Will create the main glass container:
    createGlassContainer(){
        const { width, height } = this.cameras.main;

        // Main glass panel: 
        const glassWidth = width - 100;
        const glassHeight = height - 180; 

        // Glass background with blue effect simulation: 
        const glass = this.add.rectangle(width / 2, height / 2 + 20, glassWidth, glassHeight, 0x1a1a2e, 0.4);
        glass.setStrokeStyle(2, 0x4ecdc4, 0.6); 

        // Inner border for depth:
        const innerGlass = this.add.rectangle(width / 2, height / 2 + 20, glassWidth - 10, glassHeight - 10, 0x000000, 0.1); 
        innerGlass.setStrokeStyle(1, 0xffffff, 0.2); 

        // Corner accents function: 
        this.createCornerAccents(width / 2 - glassWidth / 2, height / 2 + 20 - glassHeight / 2, glassWidth, glassHeight); 
    }

    // createCornerAccents(): Will create corner accents for the main glass container:
    createCornerAccents(x, y, width, height){
        const accentLength = 30;
        const accentColor = 0x00ffff;
        const accentAlpha = 0.8; 

        // Top-left:
        this.add.rectangle(x, y + accentLength / 2, 2, accentLength, accentColor,  accentAlpha).setOrigin(0.5); 
        this.add.rectangle(x + accentLength / 2, y, accentLength, 2, accentColor, accentAlpha).setOrigin(0.5); 

        // Top-right: 
        this.add.rectangle(x + width, y + accentLength / 2, 2, accentLength, accentColor, accentAlpha).setOrigin(0.5); 
        this.add.rectangle(x + width - accentLength / 2, y, accentLength, 2, accentColor, accentAlpha).setOrigin(0.5);
        
        // Bottom-left:
        this.add.rectangle(x, y + height - accentLength / 2, 2, accentLength, accentColor, accentAlpha).setOrigin(0.5); 
        this.add.rectangle(x + accentLength / 2, y + height, accentLength, 2, accentColor, accentAlpha).setOrigin(0.5); 

        // Bottom-right:
        this.add.rectangle(x + width, y + height - accentLength / 2, 2, accentLength, accentColor, accentAlpha).setOrigin(0.5);
        this.add.rectangle(x + width - accentLength / 2, y + height, accentLength, 2, accentColor, accentAlpha).setOrigin(0.5); 
    }

    // createSelectionSlots(): Will create the initiator card selector slots:
    createSelectionSlots(){
        const { width, height } = this.cameras.main; 
        const slotY = 230;
        const slotSpacing = 160;
        const startX = width / 2 - (slotSpacing * 1.5);

        // create 4 slots for selected cards:
        const slots = [
            { key: 'supra', label: 'SUPRA', x: startX, color: 0xff6b6b },
            { key: 'fere', label: 'FERE', x: startX + slotSpacing, color: 0xffd93d },
            { key: 'bonum1', label: 'BONUM 1', x: startX + slotSpacing * 2, color: 0x4ecdc4 },
            { key: 'bonum2', label: 'BONUM 2', x: startX + slotSpacing * 3, color: 0x4ecdc4 },
        ];

        this.selectionSlots = {}; 

        slots.forEach(slot => { 
            // Glass slot background: 
            const slotBg = this.add.rectangle(slot.x, slotY, 120, 150, 0x2a2a4a, 0.3);
            slotBg.setStrokeStyle(2, slot.color, 0.6); 

            // Label:
            const label = this.add.text(slot.x, slotY - 90, slot.label, {
                fontSize: '14px',
                color: '#ffffff', 
                fontStyle: 'bold',
            }).setOrigin(0.5); 

            // Empty state text: 
            const emptyText = this.add.text(slot.x, slotY, 'EMPTY', {
                fontSize: '16px',
                color: '#666666', 
                fontStyle: 'bold', 
            }).setOrigin(0.5); 

            this.selectionSlots[slot.key] = {
                bg: slotBg,
                label: label,
                emptyText: emptyText,
                cardSprite: null,
                color: slot.color,
            };
        }); 

        console.log(this.selectionSlots); // Testing 
    }

    // createCardPoolSections(): Will create the card pool sections:
    createCardPoolSections(){
        const { width, height } = this.cameras.main;

        const startY = 350;

        // Section headers and card pools:
        const sections = [
            { category: "Supra",  label: "SUPRA CARDS", y: startY, color: 0xff6b6b },
            { category: "Fere", label: "FERE CARDS", y: startY + 200, color: 0xffd93d },
            { category: "Bonum", label: "BONUM CARDS", y: startY + 300, color: 0x4ecdc4 },
        ]; 

        this.cardPoolSprites = []; 

        sections.forEach(section => {
            // Section header with glass background:
            const headerBg = this.add.rectangle(160, section.y - 15, 120 , 25, 0x1a1a2e, 0.6);
            headerBg.setStrokeStyle(1, section.color, 0.8); 

            const header = this.add.text(160, section.y - 15, section.label, {
                fontSize: '16px', 
                color: '#ffffff',
                fontStyle: 'bold', 
            }).setOrigin(0.5); 

            // Get cards for this category:

        });
    }

}