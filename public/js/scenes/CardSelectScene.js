import { initiatorCards } from "../models/initiatorCards.js";

export default class CardSelectScene extends Phaser.Scene{
    constructor(){
        super('CardSelectScene'); 
    }

    init(){
        this.selectedCards = { 
            Supra: null,
            Fere: null,
            Bonum1: null,
            Bonum2: null, 
        }; 

        this.bonumSelectedCount = 0;
        this.numOfCardsSelected = 0;

        this.battleCardsSelected = [
            {
                category: "Supra",
                name: null,
                selected: false,
            },
            {
                category: "Fere", 
                name: null,
                selected: false
            },
            {
                category: "Bonum1",
                name: null,
                selected: false, 
            },
            {
                category: "Bonum2", 
                name: null, 
                selected: false, 
            }
        ];

        // Note: Prevent shallow copy with initiator cards:
        this.availableCards = JSON.parse(JSON.stringify(initiatorCards)); 
    }

    preload(){
        // Supra Characters: 
        this.load.image('Tobo The Fighter', 'assets/characterImages/tobo_the_fighter_con_1_Re.png'); 
        this.load.image('Spunky With The Funky Draco', 'assets/characterImages/spunky_with_the_funky_draco_con_1_Re.png'); 

        // Fere Characters:
        this.load.image('Allybelle', 'assets/characterImages/allybelle_con_1_Re.png');

        // Bonum Characters: 

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

        // Card stat section:
        // this.createStatContainer() 

        // Start Game Button: 
        this.createStartGameButton();
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
        const title = this.add.text(width / 2, 30, 'SELECT YOUR BATTLE DECK', {
            fontSize: '40px',
            fontStlye: 'bold', 
            color: '#00ffff',
            stroke: '#000000',
            strokeThickness: 4,
        }).setOrigin(0.5); 

        // Glow effect:
        const glow = this.add.text(width / 2, 30, 'SELECT YOUR BATTLE DECK', {
            fontSize: '40px',
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
        const glassWidth = width - 30;
        const glassHeight = height - 80; 

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
        console.log("The card slots are being created"); // Testing
        console.log('\n'); // Testing 

        const { width, height } = this.cameras.main; 
        const slotY = 150;
        const slotSpacing = 180;
        // const startX = width / 2 - 320;
        const startX = width / 2 - 270; 

        // create 4 slots for selected cards:
        const slots = [
            { key: 'supra', label: 'SUPRA', x: startX, color: 0xff6b6b },
            { key: 'fere', label: 'FERE', x: startX + slotSpacing, color: 0xffd93d },
            { key: 'bonum1', label: 'BONUM 1', x: startX + slotSpacing * 2, color: 0x4ecdc4 },
            { key: 'bonum2', label: 'BONUM 2', x: startX + slotSpacing * 3, color: 0x4ecdc4 },
        ];

        this.selectionSlots = {}; 

        slots.forEach(slot => { 
            // Glass slot background: (Note: We want to find a way to add the image to this rectangles position)
            const slotBg = this.add.rectangle(slot.x, slotY, 120, 120, 0x2a2a4a, 0.3).setDepth(10);
            slotBg.setStrokeStyle(2, slot.color, 0.6);

            // Label:
            const label = this.add.text(slot.x, slotY - 70, slot.label, {
                fontSize: '14px',
                color: '#ffffff',
                fontStyle: 'bold',
            }).setOrigin(0.5).setDepth(10);

            // Empty state text:
            const emptyText = this.add.text(slot.x, slotY, 'EMPTY', {
                fontSize: '16px',
                color: '#666666',
                fontStyle: 'bold',
            }).setOrigin(0.5).setDepth(10);

            this.selectionSlots[slot.key] = {
                bg: slotBg,
                label: label,
                emptyText: emptyText,
                cardSprite: null,
                color: slot.color,
                cardImage: null, 
                noImageText: null, 
            };
        }); 

        console.log("The Default Selection Slots: ", this.selectionSlots); // Testing 
        console.log("\n"); // Testing 
    }

    // createCardPoolSections(): Will create the card pool sections:
    createCardPoolSections(){
        const { width, height } = this.cameras.main;

        const startY = 250;

        // Section headers and card pools:
        const sections = [
            { category: "Supra",  label: "SUPRA CARDS", y: startY, color: 0xff6b6b },
            { category: "Fere", label: "FERE CARDS", y: startY + 145, color: 0xffd93d },
            { category: "Bonum", label: "BONUM CARDS", y: startY + 285, color: 0x4ecdc4 },
        ]; 

        this.cardPoolSprites = []; 

        sections.forEach(section => {

            // Section header with glass background:
            const headerBg = this.add.rectangle(90, section.y - 15, 120, 25, 0x1a1a2e, 0.6);
            headerBg.setStrokeStyle(1, section.color, 0.8); 

            const header = this.add.text(90, section.y - 15, section.label, {
                fontSize: '16px', 
                color: '#ffffff',
                fontStyle: 'bold', 
            }).setOrigin(0.5); 

            // Get cards for this category:
            const categoryCards = this.availableCards.filter(card => card.cate === section.category);
            console.log('\n'); // Testing 
            console.log("Category Cards: ", categoryCards); // Testing 

            // Display cards horizontally:
            categoryCards.forEach((card, index) => {
                // const cardX = 90 + (index * 110);
                const cardX = 75 + (index * 100);  
                const cardY = section.y + 55;

                this.createSelectableCard(card, cardX, cardY, section.category); 
            }); 

        });
    }

    // createSelectableCard(): The Selectable cards will be created here: 
    createSelectableCard(card, x, y, category){ 
        console.log("Card: ", card); // Testing 

        // Central Variables:
        const centerX = this.sys.game.config.width / 2;
        const centerY = this.sys.game.config.height / 2;

        // Card Height and Width:
        // Note: Using 1:1 Aspect ratio for now.
        const cardWidth = 90;
        const cardHeight = 90;

        // Container for card and shadow:
        // TODO: Practice with containers more. 
        const container = this.add.container(x, y); 

        // Shadow (appears below card):
        const shadow = this.add.ellipse(0, cardHeight / 2 + 10, cardWidth * 0.8, 20, 0x000000, 0.5);
        shadow.setVisible(false); 
        
        // Card background with glass effect:
        // TODO: Learn about setStrokeStyle();
        // Understanding Rectangle => var rect = this.add.rectangle(x, y, width, height, fillColor, fillAlpha);
        const cardBg = this.add.rectangle(0, 0, cardWidth, cardHeight, 0x2a2a4a, 0.8);
        cardBg.setStrokeStyle(3, 0xffffff, 0.6); 

        // Inner glow:
        const innerGlow = this.add.rectangle(0, 0, cardWidth - 4, cardHeight - 4, 0x000000, 0);
        innerGlow.setStrokeStyle(2, 0xef4444, 0.4);
        // Original innerGlow.setStrokeStlye() below - Use this after creating the function getCategoryColor(): 
        // innerGlow.setStrokesStyle(2, this.getCategoryColor(category), 0.4);

        // Card Image:
        let cardImage = this.add.image(0, 0, `${card.name}`);
        cardImage.setDisplaySize(90, 90); 

        // Short name for card image:
        const shortNameText = this.add.text(0, 0, `${card.shortName}`, {
            color: '#fff', 
        }).setOrigin(0.5); 

        // TODO: Add evidens later.
        // const evidensText = this.add.text(0, 50, `Evi T`)
        
        // TODO: Add evidens later.
        // const evidensName = this.add.text(0, 70, card.evidens.name, {}); 

        // Add game properties to the container based on the 'Card Image':
        // Note: That the 'container' will become the 'cardSprite': 
        if (cardImage.texture.key !== '__MISSING')
        {
            container.add([cardBg, innerGlow, cardImage, shortNameText]); 
        }
        else
        {
            const noImageText = this.add.text(0, 0, 'No Image').setOrigin(0.5);
            cardImage.setVisible(false); 
            container.add([cardBg, innerGlow, cardImage, noImageText]);
        }

        // Make interactive: 
        cardBg.setInteractive({ useHandCursor: true }); 

        // Hover effects:
        cardBg.on('pointerover', () => {
            shadow.setVisible(false); 
            container.setScale(1.05); 

            // cardBg.setStrokeStyle(3, this.getCategoryColor(category), 1);

            if (card.selected)
            {
                cardBg.setStrokeStyle(4, 0x16a34a, 0.6);
            }
            else
            {
                cardBg.setStrokeStyle(3, this.getCategoryColor(category), 1);
            }
            // cardBg.setStrokeStyle(4, 0x16a34a, 0.6); 

            // Will display the 'card stat container':
            this.cardStatContainer(card, 'over'); 

            this.tweens.add({
                targets: container,
                y: y - 5,
                duration: 200,
                ease: 'Power2',
            });
        });

        cardBg.on('pointerout', () => {
            shadow.setVisible(false);
            container.setScale(1);

            // cardBg.setStrokeStyle(3, 0xffffff, 0.6); 
            if (card.selected)
            {
                cardBg.setStrokeStyle(4, 0x16a34a, 0.6);
            }
            else
            {
                cardBg.setStrokeStyle(3, 0xffffff, 0.6); 
            }

            this.cardStatContainer(card, 'out'); 

            this.tweens.add({
                targets: container,
                y: y,
                duration: 200,
                ease: 'Power2', 
            }); 
        });

        // Card clicked on (pointerdown): 
        cardBg.on('pointerdown', () => {
            // CODE: If a Bonum card was selected:
            if (category === "Supra")
            {
                if (this.selectedCards.Supra !== null && this.selectedCards.Supra.name === card.name)
                {
                    console.log("You've already selected this card for Supra..."); // Testing
                    return;
                }
            }
            else if (category === "Fere")
            {
                if (this.selectedCards.Fere !== null && this.selectedCards.Fere.name === card.name)
                {
                    console.log("You've already selected this card for Fere..."); // Testing 
                    return;
                }
            }
            else if (category === "Bonum")
            {
                if (this.selectedCards.Bonum1 !== null && this.selectedCards.Bonum1.name === card.name)
                {
                    console.log ("You've already selected this card for Bonum1..."); // Testing 
                    return; 
                }
                
                if (this.selectedCards.Bonum2 !== null && this.selectedCards.Bonum2.name === card.name)
                {
                    console.log("You've already selected this card for Bonum2..."); // Testing 
                    return;
                }

                this.bonumSelectedCount++; 

                if (this.bonumSelectedCount > 2)
                {
                    this.bonumSelectedCount = 1;  
                }
                console.log("The Bonum Select Count: ", this.bonumSelectedCount); // Testing 
            }

            if (this.selectedCards[category] !== null && category !== "Bonum")
            {
                console.log('Previous Selected Card: ', this.selectedCards[category]); // Testing 
                console.log('Card Sprite: ', this.selectedCards[category].cardSprite); // Testing 
                console.log('Card Sprite: ', this.selectedCards[category].cardSprite.list[0]); // Testing 
                const containerChild = this.selectedCards[category].cardSprite.list[0];

                console.log('Card Sprite[0] Tween: ', this.tweens.getTweensOf(containerChild)); // Testing
                // containerChild.scene.tweens.paused = true;
                this.tweens.killTweensOf(containerChild);
                containerChild.setScale(1);

                containerChild.setStrokeStyle(3, 0xffffff, 0.6);

                // Code: Test if the category is 'Supra' or 'Fere' to destroy the recent image in memory:
                if (category === "Supra")
                {
                    this.selectionSlots['supra'].cardImage.destroy(); 
                }
                else if (category === "Fere")
                {
                    this.selectionSlots['fere'].cardImage.destroy(); 
                }
            }
            else if (this.selectedCards[`Bonum${this.bonumSelectedCount}`] !== null && category === "Bonum")
            {
                const containerChild = this.selectedCards[`Bonum${this.bonumSelectedCount}`].cardSprite.list[0];

                this.tweens.killTweensOf(containerChild);
                containerChild.setScale(1);

                containerChild.setStrokeStyle(3, 0xffffff, 0.6);

                // Code: Test if the category is 'Bonum1' or 'Bonum2' to destroy the recent image in memory:
                if (this.bonumSelectedCount === 1)
                {
                    this.selectionSlots[`bonum${this.bonumSelectedCount}`].cardImage.destroy(); 
                }
                else
                {
                    this.selectionSlots[`bonum${this.bonumSelectedCount}`].cardImage.destroy();
                } 
            }

            cardBg.setStrokeStyle(4, 0x16a34a, 0.6);
            this.tweens.killTweensOf(cardBg);
            cardBg.setScale(1);

            // Tween: Will scale the card when selected by the user:
            this.tweens.add({
                targets: cardBg, 
                scaleX: 1.05,
                scaleY: 1.05,
                duration: 600, 
                yoyo: true,
                repeat: -1, 
                ease: 'Sine.easeInOut', 
            });

            this.selectCardForDeck(card, container, category);
        }); 
    }

    // selectCardForDeck(): Will allow the player to select the card for the deck: 
    selectCardForDeck(card, container, category){
        let slotKey = null; 
        console.log("Card Bg: ", container.list[0]); // Testing 
        console.log("Card Image: ", container.list[2]); // Testing
        console.log("\n"); // Testing

        if (category === "Supra") // Supra Selection
        {
            if (this.selectedCards.Supra === null)
            {
                card.selected = true; 
                card.cardSprite = container; 
                this.selectedCards.Supra = card;

                slotKey = "supra";
            }
            else if (this.selectedCards.Supra.name !== card.name)
            {
                card.selected = true;
                card.cardSprite = container; 

                this.selectedCards.Supra.selected = false; 
                this.selectedCards.Supra = card; 
                slotKey = "supra"; 
            }
        }
        else if (category === "Fere") // Fere Selection
        {
            if (this.selectedCards.Fere === null)
            {
                card.selected = true; 
                card.cardSprite = container; 
                this.selectedCards.Fere = card;
                slotKey = "fere"; 
            }
            else if (this.selectedCards.Fere.name !== card.name)
            {
                card.selected = true;
                card.cardSprite = container;

                this.selectedCards.Fere.selected = false;
                this.selectedCards.Fere = card; 
                slotKey = "fere"; 
            }
        }
        else if (category === "Bonum") // Bonum Selection 
        {
            console.log("Card Category: ", category); // Testing 

            if (this.selectedCards.Bonum1 === null)
            {
                card.selected = true;
                card.cardSprite = container; 
                this.selectedCards.Bonum1 = card;
                slotKey = "bonum1"; 
            }
            else if (this.selectedCards.Bonum1 !== null && this.selectedCards.Bonum2 === null)
            {
                card.selected = true; 
                card.cardSprite = container; 
                this.selectedCards.Bonum2 = card;
                slotKey = "bonum2"; 
            }
            else if (this.selectedCards.Bonum1.name !== card.name && this.bonumSelectedCount === 1)
            {
                card.selected = true;
                card.cardSprite = container;

                this.selectedCards.Bonum1.selected = false;
                this.selectedCards.Bonum1 = card;
                slotKey = "bonum1"; 

            }
            else if (this.selectedCards.Bonum2.name !== card.name && this.bonumSelectedCount === 2)
            {
                card.selected = true;
                card.cardSprite = container; 

                this.selectedCards.Bonum2.selected = false;
                this.selectedCards.Bonum2 = card;
                slotKey = "bonum2"; 
            }
        }
        console.log("\n"); // Testing 
        
        // Use selectionSlots:
        const slot = this.selectionSlots[slotKey];
        console.log('SLOT: ', slot); // Testing 
        slot.cardSprite = card.cardSprite;
        console.log('Slot Card Sprite: ', slot.cardSprite); // Testing
        
        const selectionSlotImage = this.add.image(slot.bg.x, slot.bg.y, `${card.cardSprite.list[2].texture.key}`);
        selectionSlotImage.setDisplaySize(120, 120).setDepth(10);
        slot.cardImage = selectionSlotImage;

        // If: Test if this card has an image present in the system.
        if (selectionSlotImage.texture.key === '__MISSING')
        {
            selectionSlotImage.destroy();
            if (slot.noImageText !== null) slot.noImageText.destroy();
            slot.noImageText = this.add.text(slot.bg.x, slot.bg.y, 'No Image').setOrigin(0.5).setDepth(10);
        }

        // Hide empty text:
        slot.emptyText.setVisible(false);
        const slotCard = this.createSlotCardSprite(card, slot.bg.x, slot.bg.y, category); 
    }

    createSlotCardSprite(card, x, y, category){
        console.log("card: ", card); // Testing
        console.log("Pos X: ", x); // Testing
        console.log("Pos Y: ", y); // Testing
        console.log("Category: ", category); // Testing
    }

    // cardStatContainer(): Will display all the card stats when the user hovers over the card selections. 
    cardStatContainer(card, action){
        // Containers dimensions:
        const width = 300; 
        const height = 200;

        // Action logic: 
        if (action === "over")
        {
            // Creating the main container for the stats box and stats: 
            const container = this.add.container(500, 400);
            
            // Name the container: statContainer:
            container.setName('statContainer'); 

            // Creating a rectangle for the stat box: 
            const statBox = this.add.rectangle(100, -15, width, height , 0x2a2a4a, 0.5); 
            statBox.setStrokeStyle(3, 0xef4444, 0.3);
            const statBoxWidth = statBox.width;
            const statBoxHeight = statBox.height;

            // Create Card Image:
            let statCardImage = this.add.image(150, -10, `${card.name}`); 
            statCardImage.setDisplaySize(120, 120); 
            const cardImageBg = this.add.rectangle(150, -10, 120, 120, 0xfb923c, 0.2); 
            cardImageBg.setStrokeStyle(3, 0xffffff, 0.8);

            /** 
             * |Card Stats| 
            */
            // Card Name:
            const cardName = this.add.text(statBoxWidth/2 - 50 , statBoxHeight/2 - 190, card.name, {
                fontSize: '15px',
            }).setOrigin(0.5);

            // Card Attack Stats:
            const cardAtk = this.add.text(5, statBoxHeight/2 - 150, `Atk: ${card.atk}`, {
                fontSize: '14px',
            }).setOrigin(0.5);

            // Card Defense Stats:  
            const cardDef = this.add.text(5, statBoxHeight/2 - 130, `Def: ${card.def}`, {
                fontSize: '14px', 
            }).setOrigin(0.5); 

            const cardEsse = this.add.text(5, statBoxHeight/2 - 110, `Esse: ${card.esse}`, {
                fontSize: '14px', 
            }).setOrigin(0.5); 

            // Add game properties to the container: 
            if (statCardImage.texture.key !== '__MISSING')
            {
                container.add([statBox, cardName, cardAtk, cardDef, cardEsse, cardImageBg, statCardImage]); 
            }
            else
            {
                const noImageText = this.add.text(150, -10, 'No Image').setOrigin(0.5); 
                statCardImage.setVisible(false); 
                container.add([statBox, cardName, cardAtk, cardDef, cardEsse, cardImageBg, statCardImage, noImageText]);
            }
        }
        else if (action === "out")
        {
            const container = this.children.getByName('statContainer'); 
            container.destroy(); 
        }
    }

    // createStartGameButton(): Will create the start game button and allow user to start the game.
    createStartGameButton(){
        const { width, height } = this.cameras.main;
        const btnX = width / 2;
        const btnY = height - 40;
        const btnWidth = 240;
        const btnHeight = 58;
        const halfW = btnWidth / 2;
        const halfH = btnHeight / 2;

        const btnContainer = this.add.container(btnX, btnY);

        // Soft outer glow ring:
        const outerGlow = this.add.rectangle(0, 0, btnWidth + 24, btnHeight + 24, 0x00ffff, 0);
        outerGlow.setStrokeStyle(4, 0x00ffff, 0.15);

        // Glass button body:
        const btnBg = this.add.rectangle(0, 0, btnWidth, btnHeight, 0x061d2e, 1);
        btnBg.setStrokeStyle(2, 0x00ffff, 0.9);

        // Subtle top-highlight sheen:
        const sheen = this.add.rectangle(0, -halfH * 0.45, btnWidth - 10, btnHeight * 0.35, 0xffffff, 0.06);

        // Corner accent lines (matching scene style):
        const accentLen = 14;
        const ac = 0x00ffff;
        const corners = [
            this.add.rectangle(-halfW,      -halfH + accentLen / 2, 2, accentLen, ac, 1).setOrigin(0.5),
            this.add.rectangle(-halfW + accentLen / 2, -halfH,      accentLen, 2, ac, 1).setOrigin(0.5),
            this.add.rectangle( halfW,      -halfH + accentLen / 2, 2, accentLen, ac, 1).setOrigin(0.5),
            this.add.rectangle( halfW - accentLen / 2, -halfH,      accentLen, 2, ac, 1).setOrigin(0.5),
            this.add.rectangle(-halfW,       halfH - accentLen / 2, 2, accentLen, ac, 1).setOrigin(0.5),
            this.add.rectangle(-halfW + accentLen / 2,  halfH,      accentLen, 2, ac, 1).setOrigin(0.5),
            this.add.rectangle( halfW,       halfH - accentLen / 2, 2, accentLen, ac, 1).setOrigin(0.5),
            this.add.rectangle( halfW - accentLen / 2,  halfH,      accentLen, 2, ac, 1).setOrigin(0.5),
        ];

        // Glow text layer (bloom effect):
        const glowText = this.add.text(0, 0, 'START GAME', {
            fontSize: '24px',
            fontStyle: 'bold',
            color: '#00ffff',
            stroke: '#00ffff',
            strokeThickness: 10,
        }).setOrigin(0.5).setAlpha(0.25);

        // Main label:
        const btnText = this.add.text(0, 0, 'START GAME', {
            fontSize: '24px',
            fontStyle: 'bold',
            color: '#ffffff',
            stroke: '#004455',
            strokeThickness: 3,
        }).setOrigin(0.5);

        btnContainer.add([outerGlow, btnBg, sheen, ...corners, glowText, btnText]);

        // Idle glow pulse:
        this.tweens.add({
            targets: glowText,
            alpha: 0.55,
            duration: 1400,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
        });

        // Idle outer ring breathe:
        this.tweens.add({
            targets: outerGlow,
            alpha: 0.5,
            duration: 1800,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
        });

        btnBg.setInteractive({ useHandCursor: true });

        btnBg.on('pointerover', () => {
            this.tweens.add({
                targets: btnContainer,
                scaleX: 1.06,
                scaleY: 1.06,
                duration: 150,
                ease: 'Power2',
            });
            btnBg.setFillStyle(0x0d3550, 1);
            btnBg.setStrokeStyle(2, 0x00ffff, 1);
            glowText.setAlpha(0.75);
            outerGlow.setStrokeStyle(4, 0x00ffff, 0.5);
        });

        btnBg.on('pointerout', () => {
            this.tweens.add({
                targets: btnContainer,
                scaleX: 1,
                scaleY: 1,
                duration: 150,
                ease: 'Power2',
            });
            btnBg.setFillStyle(0x061d2e, 1);
            btnBg.setStrokeStyle(2, 0x00ffff, 0.9);
            outerGlow.setStrokeStyle(4, 0x00ffff, 0.15);
        });

        btnBg.on('pointerdown', () => {
            this.numOfCardsSelected = 0; 
            // Note: Test to see how many cards were select. User must select 4.
            for (const key in this.selectedCards){
                if(this.selectedCards[key] === null)
                {
                    console.log(`You need a ${key} card: ${this.selectedCards[key]}`); // Testing

                }
                else
                {
                    this.numOfCardsSelected++; 
                }
            }
            
            // Tween: Targets the 'Start Game' button and begins the game logic.
            this.tweens.add({
                targets: btnContainer,
                scaleX: 0.94,
                scaleY: 0.94,
                duration: 90,
                yoyo: true,
                ease: 'Power2',
                onComplete: () => {
                    // TODO: this.scene.start('BattleScene');
                    if (this.numOfCardsSelected === 4)
                    {
                        const { height, width } = this.cameras.main;
                        const centerY = height / 2;
                        const slotY = 150;
                        const deltaY = centerY - slotY;

                        const newSlotSpacing = 190;  
                        const startX = 100;

                        btnBg.disableInteractive();

                        // Build a set of every scene object that belongs to the selection slots
                        const slotObjects = new Set();
                        for (const key in this.selectionSlots) {
                            const slot = this.selectionSlots[key];

                            slotObjects.add(slot.bg);
                            slotObjects.add(slot.label);
                            slotObjects.add(slot.emptyText);
                            if (slot.cardImage && slot.cardImage.active) slotObjects.add(slot.cardImage);
                            if (slot.noImageText && slot.noImageText.active) slotObjects.add(slot.noImageText);
                        }

                        // Everything that is NOT a slot object gets swept off screen
                        const toHide = this.children.list.filter(obj => !slotObjects.has(obj));

                        // Kill any ongoing tweens on those objects (including their container children)
                        toHide.forEach(obj => {
                            this.tweens.killTweensOf(obj);
                            if (obj.list) obj.list.forEach(child => this.tweens.killTweensOf(child));
                        });

                        // Fade out all non-slot scene elements
                        this.tweens.add({
                            targets: toHide,
                            alpha: 0,
                            duration: 600,
                            ease: 'Power2.easeIn',
                        });

                        // Slide each slot's objects to their new spaced x position and down to vertical center.
                        // getEnd's signature is (target, key, value) — there is no index param,
                        // so we tween each slot independently to avoid NaN x positions.
                        Object.keys(this.selectionSlots).forEach((key, slotIndex) => {
                            const slot = this.selectionSlots[key];
                            let newX = null;

                            if (slotIndex === 0)
                            {
                                newX = startX;
                            }
                            else if (slotIndex === 1)
                            {
                                newX = startX + newSlotSpacing;
                            }
                            else if (slotIndex === 2)
                            {
                                newX = startX + newSlotSpacing * 2; 
                            }
                            else if (slotIndex === 3)
                            {
                                newX = startX + newSlotSpacing * 3; 
                            }

                            const targets = [slot.bg, slot.label, slot.emptyText];
                            if (slot.cardImage && slot.cardImage.active) targets.push(slot.cardImage);
                            if (slot.noImageText && slot.noImageText.active) targets.push(slot.noImageText);

                            this.tweens.add({
                                targets,
                                y: `+=${deltaY}`,
                                x: newX,
                                duration: 1000,
                                delay: 250,
                                ease: 'Back.easeOut',
                            });
                        });

                        // Scale up slot backgrounds and card images for the showcase emphasis
                        const emphasisTargets = [];
                        for (const key in this.selectionSlots) {
                            const slot = this.selectionSlots[key];

                            console.log("Official Slot: ", slot); // Testing 
                            console.log("Card Image Width: ", slot.cardImage.width); // testing
                            console.log("Card Image Height: ", slot.cardImage.height); // Testing
                            console.log("Card BG Width: ", slot.bg.width); // Testing
                            console.log("Card BG Height: ", slot.bg.height); // Testing 
                            console.log("\n"); // Testing 

                            // slot.cardImage.setDisplaySize(120, 120); 

                            emphasisTargets.push(slot.bg);
                            if (slot.cardImage && slot.cardImage.active) emphasisTargets.push(slot.cardImage);
                            if (slot.noImageText && slot.noImageText.active) emphasisTargets.push(slot.noImageText);
                        }
                        this.tweens.add({
                            targets: emphasisTargets,
                            scaleX: .18,
                            scaleY: .18,
                            duration: 1000,
                            delay: 250,
                            ease: 'Back.easeOut',
                        });

                        // After cards finish sliding (~1250ms) launch the gold electric background,
                        // hold it for 2.8s, then fade the entire scene to black.
                        this.time.delayedCall(1350, () => {
                            const electric = this.createGoldElectricBackground();
                            this.time.delayedCall(2800, () => {
                                electric.stop();
                                electric.timer.remove(false);
                                this.cameras.main.fadeOut(1200, 0, 0, 0);
                                this.cameras.main.once('camerafadeoutcomplete', () => {
                                    this.scene.start('GameBattleScene', { selectedCards: this.selectedCards });
                                });
                            });
                        });
                    }
                },
            });

            // Flash the glow on click:
            this.tweens.add({
                targets: glowText,
                alpha: 1,
                duration: 80,
                yoyo: true,
                ease: 'Power2',
            });
        });
    }

    // createGoldElectricBackground(): Gold electric energy animation shown after all four cards
    // are centered on screen. Runs until the scene fades to black.
    createGoldElectricBackground(){
        const { width, height } = this.cameras.main;
        const cx = width / 2;
        const cy = height / 2;
        const BASE_DEPTH = 5; // Renders behind slot elements (depth 10) but above faded scene objects

        // Dark warm overlay
        const bgOverlay = this.add.rectangle(cx, cy, width, height, 0x0d0500)
            .setAlpha(0).setDepth(BASE_DEPTH);
        this.tweens.add({ targets: bgOverlay, alpha: 0.9, duration: 600, ease: 'Power2' });

        // Layered radial glow — innermost is bright gold, outermost is deep amber
        const glowConfigs = [
            { scale: 1.2, color: 0x3d1200, peak: 0.55 },
            { scale: 0.80, color: 0x8a3200, peak: 0.40 },
            { scale: 0.50, color: 0xcc6000, peak: 0.25 },
            { scale: 0.28, color: 0xffaa00, peak: 0.18 },
            { scale: 0.14, color: 0xffd700, peak: 0.14 },
        ];
        glowConfigs.forEach(({ scale, color, peak }, i) => {
            const g = this.add.ellipse(cx, cy, width * scale, height * scale, color)
                .setAlpha(0).setDepth(BASE_DEPTH);
            this.tweens.add({
                targets: g, alpha: peak,
                duration: 700, delay: i * 110, ease: 'Power2.easeOut',
                onComplete: () => {
                    this.tweens.add({
                        targets: g, alpha: peak * 0.45,
                        duration: 750 + i * 120, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
                    });
                },
            });
        });

        // Expanding shockwave rings fired in sequence from the center
        for (let r = 0; r < 3; r++) {
            const ringGfx = this.add.graphics().setDepth(BASE_DEPTH + 1);
            const state = { radius: 5 };
            const maxR = Math.max(width, height) * 0.6;
            this.time.delayedCall(r * 320, () => {
                this.tweens.add({
                    targets: state, radius: maxR,
                    duration: 1000, ease: 'Cubic.easeOut',
                    onUpdate: () => {
                        const a = Math.max(0, (1 - state.radius / maxR) * 0.9);
                        ringGfx.clear();
                        ringGfx.lineStyle(3, 0xffd700, a);
                        ringGfx.strokeCircle(cx, cy, state.radius);
                    },
                    onComplete: () => ringGfx.destroy(),
                });
            });
        }

        // Crackling lightning system — redrawn every 55 ms
        const lightGfx = this.add.graphics().setDepth(BASE_DEPTH + 1);
        const palette = [0xffd700, 0xffcc00, 0xffaa00, 0xffeedd, 0xffffff, 0xff8c00];

        const drawZigzag = (x0, y0, x1, y1, segs, jitter) => {
            lightGfx.moveTo(x0, y0);
            for (let s = 1; s < segs; s++) {
                const t = s / segs;
                lightGfx.lineTo(
                    x0 + (x1 - x0) * t + Phaser.Math.Between(-jitter, jitter),
                    y0 + (y1 - y0) * t + Phaser.Math.Between(-jitter, jitter),
                );
            }
            lightGfx.lineTo(x1, y1);
        };

        const getEdgePoint = () => {
            const edge = Phaser.Math.Between(0, 3);
            if (edge === 0) return { x: Phaser.Math.Between(0, width), y: 0 };
            if (edge === 1) return { x: width, y: Phaser.Math.Between(0, height) };
            if (edge === 2) return { x: Phaser.Math.Between(0, width), y: height };
            return { x: 0, y: Phaser.Math.Between(0, height) };
        };

        let lightActive = true;
        const lightTimer = this.time.addEvent({
            delay: 55,
            loop: true,
            callback: () => {
                if (!lightActive) return;
                lightGfx.clear();
                const numBolts = Phaser.Math.Between(3, 6);
                for (let i = 0; i < numBolts; i++) {
                    const { x: sx, y: sy } = getEdgePoint();
                    const ex = cx + Phaser.Math.Between(-130, 130);
                    const ey = cy + Phaser.Math.Between(-90, 90);
                    const color = Phaser.Math.RND.pick(palette);

                    // Main bolt
                    lightGfx.lineStyle(Phaser.Math.Between(1, 3), color, Phaser.Math.FloatBetween(0.5, 1.0));
                    lightGfx.beginPath();
                    drawZigzag(sx, sy, ex, ey, Phaser.Math.Between(7, 13), 36);
                    lightGfx.strokePath();

                    // Branch bolt off the main bolt
                    if (Math.random() > 0.4) {
                        const bt = Phaser.Math.FloatBetween(0.3, 0.65);
                        const bsx = sx + (ex - sx) * bt;
                        const bsy = sy + (ey - sy) * bt;
                        lightGfx.lineStyle(1, color, Phaser.Math.FloatBetween(0.3, 0.7));
                        lightGfx.beginPath();
                        drawZigzag(
                            bsx, bsy,
                            bsx + Phaser.Math.Between(-100, 100),
                            bsy + Phaser.Math.Between(-100, 100),
                            Phaser.Math.Between(3, 6), 22,
                        );
                        lightGfx.strokePath();
                    }
                }
            },
        });

        // Spark particles scattered across the scene, repositioned each yoyo cycle
        const hw = Math.floor(width * 0.45);
        const hh = Math.floor(height * 0.45);
        const sparks = Array.from({ length: 50 }, () =>
            this.add.circle(
                cx + Phaser.Math.Between(-hw, hw),
                cy + Phaser.Math.Between(-hh, hh),
                Phaser.Math.FloatBetween(1, 3.5),
                Phaser.Math.RND.pick([0xffd700, 0xffcc00, 0xffffff, 0xffaa55, 0xffee88]),
            ).setAlpha(0).setDepth(BASE_DEPTH + 2)
        );
        sparks.forEach(spark => {
            this.tweens.add({
                targets: spark,
                alpha: Phaser.Math.FloatBetween(0.4, 1.0),
                duration: Phaser.Math.Between(100, 350),
                delay: Phaser.Math.Between(0, 700),
                yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
                onYoyo: () => {
                    spark.x = cx + Phaser.Math.Between(-hw, hw);
                    spark.y = cy + Phaser.Math.Between(-hh, hh);
                },
            });
        });

        return {
            stop: () => { lightActive = false; lightGfx.clear(); },
            timer: lightTimer,
        };
    }

    // getCategoryColor(): Will return the category colors when the user hovers over each card.
    getCategoryColor(category){
        switch(category){
            case 'Supra': return '0xff6b6b';
            case 'Fere': return '0xffd93d';
            case 'Bonum': return '0x4ecdc4';
            default: return '#ffffff'; 
        }
    }


}