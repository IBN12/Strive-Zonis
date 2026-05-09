export const singularityPointStore = {
    /** |Basic Attack Multiplier|
     * 0: miss => 0 SP
     * 1: 0.50 => 20 SP
     * 2: 0.67 => 30 SP
     * 3: 0.75 => 40 SP
     * 4: 1 (Critical Hit) => 50 SP  
     */
    attkMultiplierConversion: {
        0: 0,
        1: 20,
        2: 30, 
        3: 40,
        4: 50,
    } 
}