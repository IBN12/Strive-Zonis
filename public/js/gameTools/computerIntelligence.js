/** |Computer Intelligence|
 * This wil be the precursor for Core Concept Intelligence (CCI).
 * 
 * -- Definitions --
 * CAS => Computer Audit System
 * 
 * -- Reason Function --
 * Note: Previous battle card means it was switched as a guard card after the current card 
 * attacked or made a base move:
 * The computer is trying to reason with the decision on taking an attack stance, attack-defense stance, or
 * strict defensive stance. 
 * 
 */

// AI Phases:

// Utility AI Class: Will handle the computers decision-making based on scoring:
export class UtilityAI{
    constructor(CAS){
        this.CAS = CAS; 
        this.weights = {
            attack: 5,
        }

        this.computerConfidence = {
            esseConfidence: 0,
        }

        // Active Battle Card: 
        this.activePlayerCard = null;
        this.activeCompCard = null;

        // Active Player Battle Card Esse:
        this.activePlayerCardEsse = null;
        this.activeCompCardEsse = null;
        this.esseDifference = null; 

        // Active Player Battle Card Esse Limit:
        this.activePlayerCardEsseLimit = null; 
        this.activeCompCardEsseLimit = null;

        // Active Player Battle Card Category :
        this.activePlayerCardCate = null;
        this.activeCompCardCate = null; 
    };

    test(){
        console.log('CAS - Utility AI: ', this.CAS); // Testing 
    }

    gather(){
        console.log('Active Player Battle Card: ', this.CAS.activePlayerCard); // Testing
        console.log('Active Player Battle Card Cate: ', this.CAS.activePlayerCard.cate); // Testing
        for (const [key, value] of Object.entries(this.CAS.playerCardDeckEsse)){
            if (value['esseCardObj'].name === this.CAS.activePlayerCard.name)
            {
                this.activePlayerCardEsse = value['esseCardObj'].esse;
            }
        }
        console.log('Active Player Battle Card Esse: ', this.activePlayerCardEsse); // Testing 

        console.log('Active Computer Battle Card: ', this.CAS.activeCompCard); // Testing 
        console.log('Active Computer Battle Card Cate: ', this.CAS.activeCompCard.cate); // Testing
        this.activeCompCard = this.CAS.activeCompCard;
        this.activeCompCardCate = this.CAS.activeCompCard.cate; 
        this.CAS.compCardDeckEsse.forEach((eCard) => {
            if (eCard.name === this.CAS.activeCompCard.name)
            {
                this.activeCompCardEsse = eCard.esse;
            }
        }); 
        console.log('Active Computer Battle Care Esse: ', this.activeCompCardEsse); // Testing 

        // -- Gather the players Esse Limit -- 
        this.activePlayerCardEsseLimit = this.CAS.activePlayerCard.esse;
        this.activeCompCardEsseLimit = 100; // Default 100 for now.

        // -- Gather the players Swap Total and Swap Pattern --
        // ...
        
        // -- Gather the player and computer moves --


        // Read gathered data:
        this.read();
    }

    read(){
        // WGO: Lets focus on the swap intelligence:
        if (this.CAS.compMove)
        {
            console.log('THIS IS COMP MOVE...'); // Testing 
        }
        
    }
    
    action(action){

    }

  
    reason(){
        // -- Reason about the current or previous player battle card cate, atk, and def --
        if (this.activePlayerCard.cate === 'Supra')
        {
            this.computerConfidence.cateConfidence += 0.2; 
        }
        else if (this.activePlayerCard.cate === 'Fere')
        {
            this.computerConfidence.cateConfidence += 0.5;
        }
        else if (this.activePlayerCard.cate === 'Bonum')
        {
            this.computerConfidence.cateConfidence += 1; 
        }

        // -- Reason about the current or previous player battle card esse --
        // ----> Determine the metric difference between players and comps battle card esse:
        const esseMetric = 1/10;
        const calculatedPlayerEsseMetric = esseMetric * this.activePlayerCardEsse;
        const calculatedCompEsseMetric = esseMetric * this.activeCompCardEsse;
        const esseDifferenceMetric = Math.ceil(calculatedCompEsseMetric - calculatedPlayerEsseMetric);
        
        // ----> Configuration difference between Player and Comp battle Cards esse:
        // A high positive number - The computers battle card is greatly ahead in esse.
        // --- Current move: Attack
        // ---- (high attack)

        // A low positive number - The computers battle card is slightly ahead in esse.
        // --- Current move: Good chance of attack with a slight chance of defend depending on other battle parameters. 
        // ---- (high attack - low defend)

        // A low negative number - The computers battle card is slightly behind in esse.
        // --- Current move: Low chance of attack with a good chance of defend depending on other battle parameters. 
        // ---- (low attack - high defend) 

        // A high negative number - The computers battle card is greatly behind in esse.
        // --- Current move: Extremely low chance of attack with a great chance of defend depending on other battle parameters. 
        // ---- (very low attack - very high defend)
    }
}

// AIStates: Will produce the state that the AI Will be in:
class AIStates{

}
