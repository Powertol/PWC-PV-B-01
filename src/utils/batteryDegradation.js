// Definición de ciclos de vida por fabricante, DoD y C-rate
const degradationProfiles = {
    tesla: {
        baseCycles: {
            100: 3000,  // 100% DoD: 3000 ciclos hasta 80% capacidad
            80: 4000,   // 80% DoD: 4000 ciclos hasta 80% capacidad
            60: 5500,   // 60% DoD: 5500 ciclos hasta 80% capacidad
            40: 7500,   // 40% DoD: 7500 ciclos hasta 80% capacidad
            20: 10000   // 20% DoD: 10000 ciclos hasta 80% capacidad
        },
        warrantyYears: 10,
        // Factores de degradación por C-rate
        cRateFactors: {
            0.25: 1.2,  // 20% más ciclos de vida a C-rate bajo
            0.5: 1.0,   // Factor base
            1.0: 0.8,   // 20% menos ciclos de vida
            2.0: 0.6    // 40% menos ciclos de vida
        }
    },
    catl: {
        baseCycles: {
            100: 4500,  // 100% DoD: 4500 ciclos hasta 80% capacidad
            80: 6000,   // 80% DoD: 6000 ciclos hasta 80% capacidad
            60: 8000,   // 60% DoD: 8000 ciclos hasta 80% capacidad
            40: 12000,  // 40% DoD: 12000 ciclos hasta 80% capacidad
            20: 15000   // 20% DoD: 15000 ciclos hasta 80% capacidad
        },
        warrantyYears: 12,
        cRateFactors: {
            0.25: 1.25, // 25% más ciclos de vida
            0.5: 1.0,   // Factor base
            1.0: 0.85,  // 15% menos ciclos de vida
            2.0: 0.7    // 30% menos ciclos de vida
        }
    },
    byd: {
        baseCycles: {
            100: 3500,  // 100% DoD: 3500 ciclos hasta 80% capacidad
            80: 5000,   // 80% DoD: 5000 ciclos hasta 80% capacidad
            60: 7000,   // 60% DoD: 7000 ciclos hasta 80% capacidad
            40: 10000,  // 40% DoD: 10000 ciclos hasta 80% capacidad
            20: 13000   // 20% DoD: 13000 ciclos hasta 80% capacidad
        },
        warrantyYears: 10,
        cRateFactors: {
            0.25: 1.15, // 15% más ciclos de vida
            0.5: 1.0,   // Factor base
            1.0: 0.9,   // 10% menos ciclos de vida
            2.0: 0.75   // 25% menos ciclos de vida
        }
    }
};

function getCRateFactor(manufacturer, cRate) {
    const factors = degradationProfiles[manufacturer].cRateFactors;
    const rates = Object.keys(factors).map(Number).sort((a, b) => a - b);
    
    // Si el C-rate coincide exactamente con un valor definido
    if (factors[cRate]) return factors[cRate];
    
    // Encontrar los valores de C-rate más cercanos para interpolar
    let lowerRate = rates[0];
    let upperRate = rates[rates.length - 1];
    
    for (let i = 0; i < rates.length - 1; i++) {
        if (cRate > rates[i] && cRate < rates[i + 1]) {
            lowerRate = rates[i];
            upperRate = rates[i + 1];
            break;
        }
    }
    
    // Interpolar linealmente entre los dos factores más cercanos
    const lowerFactor = factors[lowerRate];
    const upperFactor = factors[upperRate];
    
    return lowerFactor + (upperFactor - lowerFactor) *
           (cRate - lowerRate) / (upperRate - lowerRate);
}

function calculateCyclesForDoD(manufacturer, dod, cRate) {
    const profile = degradationProfiles[manufacturer].baseCycles;
    const dodValues = Object.keys(profile).map(Number).sort((a, b) => a - b);
    
    // Si el DoD coincide exactamente con un valor en el perfil
    if (profile[dod]) return profile[dod];
    
    // Encontrar los valores de DoD más cercanos para interpolar
    let lowerDoD = dodValues[0];
    let upperDoD = dodValues[dodValues.length - 1];
    
    for (let i = 0; i < dodValues.length - 1; i++) {
        if (dod > dodValues[i] && dod < dodValues[i + 1]) {
            lowerDoD = dodValues[i];
            upperDoD = dodValues[i + 1];
            break;
        }
    }
    
    // Interpolar linealmente entre los dos valores más cercanos
    const lowerCycles = profile[lowerDoD];
    const upperCycles = profile[upperDoD];
    
    const baseCycles = lowerCycles + (upperCycles - lowerCycles) *
                      (dod - lowerDoD) / (upperDoD - lowerDoD);
                      
    // Aplicar factor de C-rate
    return baseCycles * getCRateFactor(manufacturer, cRate);
}

function calculateDegradation(manufacturer, totalCycles, dod, cRate, years) {
    const cyclesUntil80 = calculateCyclesForDoD(manufacturer, dod * 100, cRate);
    
    // Degradación por ciclos (llega al 80% al completar cyclesUntil80)
    const cyclesDegradation = Math.max(0.8, 1 - (0.2 * totalCycles / cyclesUntil80));
    
    // Degradación natural (1% adicional por año)
    const naturalDegradation = Math.max(0, 1 - (0.01 * years));
    
    // Degradación total: aplicamos primero la degradación por ciclos
    // y luego aplicamos la degradación natural como pérdida adicional
    let remainingCapacity = cyclesDegradation - ((1 - naturalDegradation) * cyclesDegradation);
    
    // Aseguramos que no baje del 80%
    remainingCapacity = Math.max(0.8, remainingCapacity);
    
    return {
        remainingCapacity,
        cyclesUntil80,
        degradationPercentage: (1 - remainingCapacity) * 100,
        cyclesDegradationPercentage: (1 - cyclesDegradation) * 100,
        naturalDegradationPercentage: (1 - naturalDegradation) * 100,
        totalDegradation: (1 - remainingCapacity) * 100
    };
}

function calculateExpectedLifespan(manufacturer, dailyCycles, dod, cRate) {
    const cyclesUntil80 = calculateCyclesForDoD(manufacturer, dod * 100, cRate);
    const yearsFromCycles = cyclesUntil80 / (dailyCycles * 365);
    
    // Calcular años considerando también la degradación natural del 1% anual
    // La degradación natural por sí sola llevaría al 80% en 20 años
    const yearsFromNatural = 20;
    
    // Tomar el valor más restrictivo
    return Math.min(yearsFromCycles, yearsFromNatural);
}

function calculateAnnualDegradation(manufacturer, dod, cRate, dailyCycles) {
    const cyclesUntil80 = calculateCyclesForDoD(manufacturer, dod * 100, cRate);
    
    // Degradación por ciclos anual
    const cyclesDegradationPerYear = (0.2 * (dailyCycles * 365) / cyclesUntil80) * 100;
    
    // Degradación natural anual (1% adicional)
    const naturalDegradationPerYear = 1;
    
    return {
        total: cyclesDegradationPerYear + naturalDegradationPerYear,
        byCycles: cyclesDegradationPerYear,
        natural: naturalDegradationPerYear
    };
}

module.exports = {
    calculateDegradation,
    calculateExpectedLifespan,
    calculateAnnualDegradation,
    calculateCyclesForDoD,
    degradationProfiles
};