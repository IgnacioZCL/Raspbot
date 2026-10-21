const db = require('./db');
const { getCharacter, getCharacterById, adjustHp, addXp } = require('./dnd-characters');
const { getMonster, rollDamage } = require('./dnd-monsters');
const { d20Roll, abilityModifier } = require('./dnd-rules');

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

function startEncounter(guildId, channelId, partyId, monsterKey) {
  const monster = getMonster(monsterKey);
  if (!monster) {
    throw new Error(`Unknown monster: ${monsterKey}.`);
  }

  const existing = getActiveEncounter(guildId, channelId);
  if (existing) {
    throw new Error('There is already an active encounter in this channel.');
  }

  const result = db.prepare(`
    INSERT INTO dnd_encounters (
      guild_id, channel_id, party_id, monster_key, monster_name,
      monster_hp, monster_max_hp, monster_ac, monster_bab, monster_damage, monster_xp
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    guildId,
    channelId,
    partyId || null,
    monsterKey,
    monster.name,
    monster.hp,
    monster.hp,
    monster.ac,
    monster.bab,
    monster.damage,
    monster.xp
  );

  return getActiveEncounter(guildId, channelId);
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

function updateMonsterHp(encounterId, newHp) {
  db.prepare(
    "UPDATE dnd_encounters SET monster_hp = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
  ).run(newHp, encounterId);
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

  const attackStat = character.dex > character.str ? 'dex' : 'str';
  const statMod = abilityModifier(character[attackStat]);
  const attackRoll = d20Roll(character.bab + statMod, 'attack');

  if (attackRoll.total < encounter.monster_ac) {
    return {
      hit: false,
      attackRoll,
      attacker: character.name,
      monsterName: encounter.monster_name,
      monsterHp: encounter.monster_hp,
      monsterMaxHp: encounter.monster_max_hp,
    };
  }

  // Simplified player damage: weapon die based on class, plus STR mod.
  const weaponDie = character.class.toLowerCase().includes('wizard') ||
    character.class.toLowerCase().includes('sorcerer') ? '1d4' : '1d8';
  const damage = rollDamage(weaponDie, abilityModifier(character.str));

  const newHp = Math.max(0, encounter.monster_hp - damage);
  updateMonsterHp(encounter.id, newHp);
  recordDamageToMonster(encounter.id, userId, character.id, damage);

  const result = {
    hit: true,
    attackRoll,
    damage,
    attacker: character.name,
    monsterName: encounter.monster_name,
    monsterHp: newHp,
    monsterMaxHp: encounter.monster_max_hp,
    defeated: newHp === 0,
  };

  if (result.defeated) {
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

  const monster = getMonster(encounter.monster_key);
  const target = getCharacter(guildId, targetUserId);
  if (!target) {
    return { error: 'Target player has no active character.' };
  }

  const attackMod = abilityModifier({ str: monster.bab * 2 + 10, dex: monster.bab * 2 + 10 }[monster.attackStat] || 10);
  const attackRoll = d20Roll(monster.bab + attackMod, 'monster attack');

  if (attackRoll.total < target.ac) {
    return {
      hit: false,
      attackRoll,
      attacker: encounter.monster_name,
      target: target.name,
    };
  }

  const damage = rollDamage(monster.damage, monster.damageBonus);
  const newHp = Math.max(0, target.hp - damage);
  adjustHp(target.id, -damage);

  return {
    hit: true,
    attackRoll,
    damage,
    attacker: encounter.monster_name,
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
  startEncounter,
  getEncounterParticipants,
  attackMonster,
  monsterAttack,
};
