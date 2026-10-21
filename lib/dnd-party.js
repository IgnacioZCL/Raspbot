const db = require('./db');
const { getCharacter, getCharacterById, adjustHp, addXp } = require('./dnd-characters');
const { getMonster, rollDamage } = require('./dnd-monsters');
const {
  d20Roll, abilityModifier,
  calculateEncounterLevel, calculatePartyLevel, estimateDifficulty,
} = require('./dnd-rules');

function getActiveParty(guildId, userId) {
  return db.prepare(`
    SELECT p.* FROM dnd_parties p
    JOIN dnd_party_members pm ON p.id = pm.party_id
    WHERE p.guild_id = ? AND p.status = 'active' AND pm.user_id = ?
  `).get(guildId, userId);
}

function getPartyById(partyId) {
  return db.prepare('SELECT * FROM dnd_parties WHERE id = ?').get(partyId);
}

function getPartyMembers(partyId) {
  return db.prepare('SELECT user_id FROM dnd_party_members WHERE party_id = ?').all(partyId);
}

function createParty(guildId, name, leaderUserId) {
  const existing = db.prepare(
    'SELECT id FROM dnd_parties WHERE guild_id = ? AND status = ? AND name = ?'
  ).get(guildId, 'active', name);
  if (existing) {
    throw new Error(`An active party named "${name}" already exists.`);
  }

  const leaderChar = getCharacter(guildId, leaderUserId);
  if (!leaderChar) {
    throw new Error('You need an active character to create a party.');
  }

  const result = db.prepare(
    'INSERT INTO dnd_parties (guild_id, name, leader_user_id) VALUES (?, ?, ?)'
  ).run(guildId, name, leaderUserId);
  const partyId = result.lastInsertRowid;

  db.prepare('INSERT INTO dnd_party_members (party_id, user_id) VALUES (?, ?)').run(
    partyId,
    leaderUserId
  );

  return getPartyById(partyId);
}

function joinParty(partyId, userId) {
  const party = getPartyById(partyId);
  if (!party || party.status !== 'active') {
    throw new Error('Party not found or inactive.');
  }

  const character = getCharacter(party.guild_id, userId);
  if (!character) {
    throw new Error('You need an active character in this server to join a party.');
  }

  const insert = db.prepare(
    'INSERT INTO dnd_party_members (party_id, user_id) VALUES (?, ?)'
  );
  try {
    insert.run(partyId, userId);
  } catch (error) {
    if (error.message.includes('UNIQUE constraint failed')) {
      throw new Error('You are already in this party.');
    }
    throw error;
  }

  return party;
}

function leaveParty(guildId, userId) {
  const party = getActiveParty(guildId, userId);
  if (!party) {
    throw new Error('You are not in an active party.');
  }

  db.prepare('DELETE FROM dnd_party_members WHERE party_id = ? AND user_id = ?').run(
    party.id,
    userId
  );

  const remaining = getPartyMembers(party.id);
  if (remaining.length === 0) {
    db.prepare("UPDATE dnd_parties SET status = 'disbanded' WHERE id = ?").run(party.id);
  }

  return party;
}

function disbandParty(guildId, userId) {
  const party = getActiveParty(guildId, userId);
  if (!party) {
    throw new Error('You are not in an active party.');
  }
  if (party.leader_user_id !== userId) {
    throw new Error('Only the party leader can disband the party.');
  }

  db.prepare("UPDATE dnd_parties SET status = 'disbanded' WHERE id = ?").run(party.id);
  return party;
}

function listParties(guildId) {
  return db.prepare(
    "SELECT * FROM dnd_parties WHERE guild_id = ? AND status = 'active' ORDER BY created_at"
  ).all(guildId);
}

// Encounters
function getActiveEncounter(guildId, channelId) {
  return db.prepare(
    "SELECT * FROM dnd_encounters WHERE guild_id = ? AND channel_id = ? AND status = 'active'"
  ).get(guildId, channelId);
}

function getEncounterMonsters(encounterId, status = null) {
  if (status) {
    return db.prepare(
      "SELECT * FROM dnd_encounter_monsters WHERE encounter_id = ? AND status = ? ORDER BY slot_index"
    ).all(encounterId, status);
  }
  return db.prepare(
    'SELECT * FROM dnd_encounter_monsters WHERE encounter_id = ? ORDER BY slot_index'
  ).all(encounterId);
}

function getAliveEncounterMonsters(encounterId) {
  return getEncounterMonsters(encounterId, 'alive');
}

function formatCr(cr) {
  if (cr == null) return '?';
  return cr < 1 ? `1/${Math.round(1 / cr)}` : cr.toString();
}

function startEncounter(guildId, channelId, partyId, monsterKey, monsterCount = 1) {
  const monster = getMonster(monsterKey);
  if (!monster) {
    throw new Error(`Unknown monster: ${monsterKey}.`);
  }
  if (monsterCount < 1 || monsterCount > 20) {
    throw new Error('Monster count must be between 1 and 20.');
  }

  const existing = getActiveEncounter(guildId, channelId);
  if (existing) {
    throw new Error('There is already an active encounter in this channel.');
  }

  // Compute encounter difficulty relative to the starting party if available.
  const partyLevels = [];
  if (partyId) {
    const members = getPartyMembers(partyId);
    for (const member of members) {
      const char = getCharacter(guildId, member.user_id);
      if (char) partyLevels.push(char.level);
    }
  }
  const partyLevel = calculatePartyLevel(partyLevels);
  const crValues = Array(monsterCount).fill(monster.cr);
  const encounterLevel = calculateEncounterLevel(crValues);
  const difficultyLabel = estimateDifficulty(encounterLevel, partyLevel);

  const totalXp = monster.xp * monsterCount;
  const totalMaxHp = monster.hp * monsterCount;

  const result = db.prepare(`
    INSERT INTO dnd_encounters (
      guild_id, channel_id, party_id, monster_key, monster_name,
      monster_count, monster_hp, monster_max_hp, monster_ac, monster_bab, monster_damage, monster_xp,
      monster_cr, encounter_level
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    guildId,
    channelId,
    partyId || null,
    monsterKey,
    monsterCount === 1 ? monster.name : `${monsterCount}x ${monster.name}`,
    monsterCount,
    totalMaxHp,
    totalMaxHp,
    monster.ac,
    monster.bab,
    monster.damage,
    totalXp,
    monster.cr,
    encounterLevel
  );

  const encounterId = result.lastInsertRowid;

  const insertMonster = db.prepare(`
    INSERT INTO dnd_encounter_monsters (
      encounter_id, slot_index, monster_name, monster_hp, monster_max_hp, monster_ac,
      monster_bab, monster_damage, monster_xp, monster_cr
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (let i = 0; i < monsterCount; i++) {
    insertMonster.run(
      encounterId,
      i,
      monster.name,
      monster.hp,
      monster.hp,
      monster.ac,
      monster.bab,
      monster.damage,
      monster.xp,
      monster.cr
    );
  }

  return {
    encounter: getActiveEncounter(guildId, channelId),
    partyLevel,
    encounterLevel,
    difficultyLabel,
  };
}

function getEncounterParticipants(encounterId) {
  return db.prepare(
    'SELECT * FROM dnd_encounter_participants WHERE encounter_id = ? ORDER BY damage_dealt DESC'
  ).all(encounterId);
}

function addParticipant(encounterId, userId, characterId) {
  const insert = db.prepare(
    'INSERT INTO dnd_encounter_participants (encounter_id, user_id, character_id) VALUES (?, ?, ?)'
  );
  try {
    insert.run(encounterId, userId, characterId);
  } catch (error) {
    if (error.message.includes('UNIQUE constraint failed')) {
      // Already a participant, ignore.
      return;
    }
    throw error;
  }
}

function recordDamageToMonster(encounterId, userId, characterId, damage) {
  addParticipant(encounterId, userId, characterId);
  db.prepare(
    'UPDATE dnd_encounter_participants SET damage_dealt = damage_dealt + ? WHERE encounter_id = ? AND user_id = ?'
  ).run(damage, encounterId, userId);
}

function updateEncounterTotalHp(encounterId) {
  const alive = getAliveEncounterMonsters(encounterId);
  const totalHp = alive.reduce((sum, m) => sum + m.monster_hp, 0);
  const totalMaxHp = alive.reduce((sum, m) => sum + m.monster_max_hp, 0);
  db.prepare(
    'UPDATE dnd_encounters SET monster_hp = ?, monster_max_hp = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
  ).run(totalHp, totalMaxHp, encounterId);
}

function updateMonsterSlotHp(slotId, newHp) {
  const status = newHp <= 0 ? 'dead' : 'alive';
  db.prepare(
    "UPDATE dnd_encounter_monsters SET monster_hp = ?, status = ? WHERE id = ?"
  ).run(Math.max(0, newHp), status, slotId);
}

function endEncounter(encounterId, status = 'defeated') {
  db.prepare(
    "UPDATE dnd_encounters SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
  ).run(status, encounterId);
}

function attackMonster(guildId, channelId, userId) {
  const encounter = getActiveEncounter(guildId, channelId);
  if (!encounter) {
    return { error: 'There is no active encounter in this channel.' };
  }

  const character = getCharacter(guildId, userId);
  if (!character) {
    return { error: 'You need an active character to attack.' };
  }

  addParticipant(encounter.id, userId, character.id);

  const aliveMonsters = getAliveEncounterMonsters(encounter.id);
  if (aliveMonsters.length === 0) {
    return { error: 'No monsters remain in this encounter.' };
  }

  // Target the front monster (lowest slot_index) by default.
  const targetMonster = aliveMonsters[0];

  const attackStat = character.dex > character.str ? 'dex' : 'str';
  const statMod = abilityModifier(character[attackStat]);
  const attackRoll = d20Roll(character.bab + statMod, 'attack');

  if (attackRoll.total < targetMonster.monster_ac) {
    updateEncounterTotalHp(encounter.id);
    return {
      hit: false,
      attackRoll,
      attacker: character.name,
      monsterName: targetMonster.monster_name,
      slotIndex: targetMonster.slot_index,
      totalSlots: encounter.monster_count,
      monsterHp: encounter.monster_hp,
      monsterMaxHp: encounter.monster_max_hp,
    };
  }

  // Simplified player damage: weapon die based on class, plus STR mod.
  const weaponDie = character.class.toLowerCase().includes('wizard') ||
    character.class.toLowerCase().includes('sorcerer') ? '1d4' : '1d8';
  const damage = rollDamage(weaponDie, abilityModifier(character.str));

  const newSlotHp = Math.max(0, targetMonster.monster_hp - damage);
  const slotDefeated = newSlotHp === 0;
  updateMonsterSlotHp(targetMonster.id, newSlotHp);
  updateEncounterTotalHp(encounter.id);
  recordDamageToMonster(encounter.id, userId, character.id, damage);

  const refreshedEncounter = getActiveEncounter(guildId, channelId);
  const allDead = getAliveEncounterMonsters(encounter.id).length === 0;

  const result = {
    hit: true,
    attackRoll,
    damage,
    attacker: character.name,
    monsterName: targetMonster.monster_name,
    slotIndex: targetMonster.slot_index,
    totalSlots: encounter.monster_count,
    monsterHp: refreshedEncounter.monster_hp,
    monsterMaxHp: refreshedEncounter.monster_max_hp,
    slotDefeated,
    defeated: allDead,
  };

  if (allDead) {
    endEncounter(encounter.id, 'defeated');
    result.awarded = awardEncounterXp(encounter);
  }

  return result;
}

function monsterAttack(guildId, channelId, targetUserId) {
  const encounter = getActiveEncounter(guildId, channelId);
  if (!encounter) {
    return { error: 'There is no active encounter in this channel.' };
  }

  const aliveMonsters = getAliveEncounterMonsters(encounter.id);
  if (aliveMonsters.length === 0) {
    return { error: 'No monsters remain in this encounter.' };
  }

  const attacker = aliveMonsters[0];
  const target = getCharacter(guildId, targetUserId);
  if (!target) {
    return { error: 'Target player has no active character.' };
  }

  const monster = getMonster(encounter.monster_key);
  const statScore = monster.attackStat === 'dex' ? attacker.monster_bab * 2 + 10 : attacker.monster_bab * 2 + 10;
  const attackMod = abilityModifier(statScore);
  const attackRoll = d20Roll(attacker.monster_bab + attackMod, 'monster attack');

  if (attackRoll.total < target.ac) {
    return {
      hit: false,
      attackRoll,
      attacker: attacker.monster_name,
      target: target.name,
    };
  }

  const damage = rollDamage(attacker.monster_damage, monster ? monster.damageBonus : 0);
  const newHp = Math.max(0, target.hp - damage);
  adjustHp(target.id, -damage);

  return {
    hit: true,
    attackRoll,
    damage,
    attacker: attacker.monster_name,
    target: target.name,
    targetHp: newHp,
    targetMaxHp: target.max_hp,
    defeated: newHp === 0,
  };
}

function awardEncounterXp(encounter) {
  const participants = getEncounterParticipants(encounter.id);
  if (participants.length === 0) return [];

  // A group of players earns a 15% party bonus on top of the split.
  // Solo kills keep the full monster XP with no bonus.
  const playerCount = participants.length;
  const baseXpEach = encounter.monster_xp / playerCount;
  const partyBonus = playerCount > 1 ? encounter.monster_xp * 0.15 : 0;
  const xpEach = Math.floor(baseXpEach + partyBonus);
  const awarded = [];

  for (const p of participants) {
    const character = getCharacterById(p.character_id);
    if (!character) continue;
    const newXp = addXp(character.id, xpEach);
    awarded.push({ name: character.name, xp: xpEach, totalXp: newXp });
  }

  return awarded;
}

module.exports = {
  getActiveParty,
  getPartyById,
  getPartyMembers,
  createParty,
  joinParty,
  leaveParty,
  disbandParty,
  listParties,
  getActiveEncounter,
  getEncounterMonsters,
  getAliveEncounterMonsters,
  startEncounter,
  getEncounterParticipants,
  attackMonster,
  monsterAttack,
};
