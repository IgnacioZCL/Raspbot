const { CLASSES, ABILITY_NAMES, getSpellSlots } = require('./dnd-data');

function rollDie(faces) {
  return Math.floor(Math.random() * faces) + 1;
}

function rollDice(count, faces) {
  const rolls = [];
  for (let i = 0; i < count; i++) {
    rolls.push(rollDie(faces));
  }
  return rolls;
}

function roll4d6DropLowest() {
  const stats = [];
  const allRolls = [];
  for (let i = 0; i < 6; i++) {
    const rolls = rollDice(4, 6);
    allRolls.push(rolls);
    const sorted = [...rolls].sort((a, b) => a - b);
    sorted.shift(); // drop lowest
    stats.push(sorted.reduce((a, b) => a + b, 0));
  }
  return { stats, rolls: allRolls };
}

function abilityModifier(score) {
  return Math.floor((score - 10) / 2);
}

function formatModifier(mod) {
  return mod >= 0 ? `+${mod}` : `${mod}`;
}

// 3.5e point buy table. Costs are cumulative from 8.
const POINT_BUY_COSTS = {
  8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 6, 15: 8, 16: 10, 17: 13, 18: 16,
};

function pointBuyCost(score) {
  if (score < 8 || score > 18) return null;
  return POINT_BUY_COSTS[score];
}

function validatePointBuy25(scores) {
  const values = ABILITY_NAMES.map((a) => scores[a]);
  if (values.some((s) => s < 8 || s > 18)) {
    return { valid: false, error: 'All scores must be between 8 and 18.' };
  }

  const totalCost = values.reduce((sum, s) => sum + pointBuyCost(s), 0);
  if (totalCost > 25) {
    return { valid: false, error: `Point-buy cost is ${totalCost}, maximum is 25.` };
  }
  return { valid: true, cost: totalCost, remaining: 25 - totalCost };
}

function babForLevel(level, progression) {
  if (progression === 'fast') return level;
  if (progression === 'medium') return Math.floor(level * 0.75);
  return Math.floor(level * 0.5);
}

function saveForLevel(level, progression) {
  if (progression === 'good') return 2 + Math.floor(level / 2);
  return Math.floor(level / 3);
}

function hpForLevel(level, hitDie, conMod) {
  // Level 1: max hit die + con mod.
  // Subsequent levels: average rounded up + con mod.
  let total = hitDie + conMod;
  const avg = Math.ceil((hitDie + 1) / 2);
  for (let i = 2; i <= level; i++) {
    total += Math.max(1, avg + conMod);
  }
  return total;
}

function skillPointsForLevel(level, classKey, intMod, isFirstLevel = false) {
  const cls = CLASSES[classKey];
  if (!cls) return 0;
  // 3.5e: (skillPointsPerLevel + intMod) * 4 at first level, then skillPointsPerLevel + intMod.
  const base = Math.max(1, cls.skillPointsPerLevel + intMod);
  if (isFirstLevel) return base * 4;
  return base;
}

function getClassProgression(classKey, level) {
  const cls = CLASSES[classKey];
  if (!cls) return null;
  return {
    bab: babForLevel(level, cls.babProgression),
    fortitude: saveForLevel(level, cls.saveProgression.fortitude),
    reflex: saveForLevel(level, cls.saveProgression.reflex),
    will: saveForLevel(level, cls.saveProgression.will),
    hitDie: cls.hitDie,
    caster: cls.caster,
    castingStat: cls.castingStat,
    classSkills: cls.classSkills,
    spellSlots: getSpellSlots(classKey, level),
  };
}

function getArmorClass(dexMod, armorBonus = 0) {
  return 10 + dexMod + armorBonus;
}

function d20Roll(bonus = 0, label = '') {
  const die = rollDie(20);
  const total = die + bonus;
  return { die, bonus, total, label };
}

function formatD20Roll(roll) {
  const mod = formatModifier(roll.bonus);
  return `d20 (${roll.die}) ${mod}${roll.label ? ` ${roll.label}` : ''} = **${roll.total}**`;
}

module.exports = {
  rollDie,
  rollDice,
  roll4d6DropLowest,
  abilityModifier,
  formatModifier,
  pointBuyCost,
  validatePointBuy25,
  babForLevel,
  saveForLevel,
  hpForLevel,
  skillPointsForLevel,
  getClassProgression,
  getArmorClass,
  d20Roll,
  formatD20Roll,
};
