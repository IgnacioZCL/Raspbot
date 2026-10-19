const activeGames = new Map();

const COLUMNS = ['A', 'B', 'C'];
const ROWS = ['1', '2', '3'];

function createEmptyGrid() {
  return [
    [null, null, null],
    [null, null, null],
    [null, null, null],
  ];
}

function parseMove(input) {
  if (!input || input.length !== 2) return null;
  const col = input[0].toUpperCase();
  const row = input[1];
  const colIndex = COLUMNS.indexOf(col);
  const rowIndex = ROWS.indexOf(row);
  if (colIndex === -1 || rowIndex === -1) return null;
  return { col: colIndex, row: rowIndex };
}

function formatGrid(grid) {
  let text = '```\n   A   B   C\n';
  for (let r = 0; r < 3; r++) {
    text += `${ROWS[r]}  `;
    for (let c = 0; c < 3; c++) {
      const cell = grid[r][c];
      text += cell ? ` ${cell} ` : '   ';
      if (c < 2) text += '|';
    }
    text += '\n';
    if (r < 2) text += '  ---+---+---\n';
  }
  text += '```';
  return text;
}

function checkWinner(grid) {
  const lines = [
    // rows
    [[0, 0], [0, 1], [0, 2]],
    [[1, 0], [1, 1], [1, 2]],
    [[2, 0], [2, 1], [2, 2]],
    // columns
    [[0, 0], [1, 0], [2, 0]],
    [[0, 1], [1, 1], [2, 1]],
    [[0, 2], [1, 2], [2, 2]],
    // diagonals
    [[0, 0], [1, 1], [2, 2]],
    [[0, 2], [1, 1], [2, 0]],
  ];

  for (const line of lines) {
    const [a, b, c] = line;
    const val = grid[a[0]][a[1]];
    if (val && val === grid[b[0]][b[1]] && val === grid[c[0]][c[1]]) {
      return val;
    }
  }

  if (grid.every(row => row.every(cell => cell !== null))) {
    return 'draw';
  }

  return null;
}

function findBotMove(grid) {
  // Try to win or block, otherwise pick center, then random.
  const botSymbol = 'O';
  const playerSymbol = 'X';

  function wouldWin(symbol, r, c) {
    const copy = grid.map(row => [...row]);
    copy[r][c] = symbol;
    return checkWinner(copy) === symbol;
  }

  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      if (grid[r][c]) continue;
      if (wouldWin(botSymbol, r, c)) return { r, c };
    }
  }

  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      if (grid[r][c]) continue;
      if (wouldWin(playerSymbol, r, c)) return { r, c };
    }
  }

  if (!grid[1][1]) return { r: 1, c: 1 };

  const corners = [[0, 0], [0, 2], [2, 0], [2, 2]];
  const available = [];
  for (const [r, c] of corners) {
    if (!grid[r][c]) available.push({ r, c });
  }

  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      if (!grid[r][c]) available.push({ r, c });
    }
  }

  return available[0] || null;
}

module.exports = {
  name: 'tictactoe',
  description: 'Play a game of tic-tac-toe against another user or the bot',
  async execute(message, args, player) {
    const guildId = message.guild.id;
    const channelId = message.channel.id;
    const gameKey = `${guildId}-${channelId}`;

    if (activeGames.has(gameKey)) {
      return message.reply('❌ A game is already in progress in this channel. Finish it first or start in another channel.');
    }

    const challenger = message.author;
    const mentionedUser = message.mentions.users.first();
    const opponent = mentionedUser || null;

    const game = {
      grid: createEmptyGrid(),
      challenger: { id: challenger.id, tag: challenger.tag, symbol: 'X' },
      opponent: opponent
        ? { id: opponent.id, tag: opponent.tag, symbol: 'O' }
        : { id: message.client.user.id, tag: message.client.user.tag, symbol: 'O', isBot: true },
      currentTurn: 'X',
      channel: message.channel,
      gameKey,
    };

    activeGames.set(gameKey, game);

    let intro = `🎮 **Tic-Tac-Toe started!**\n${challenger} is **X**`;
    if (opponent) {
      intro += ` and ${opponent} is **O**.\n${challenger}, it's your turn. Send coordinates like \`A1\`, \`B2\`, etc.`;
    } else {
      intro += ` and I am **O**.\n${challenger}, it's your turn. Send coordinates like \`A1\`, \`B2\`, etc.`;
    }

    await message.channel.send(intro);
    await message.channel.send(formatGrid(game.grid));

    const filter = msg => {
      if (msg.author.bot && !game.opponent.isBot) return false;
      const currentPlayer = game.currentTurn === 'X' ? game.challenger : game.opponent;
      if (msg.author.id !== currentPlayer.id) return false;
      const move = parseMove(msg.content.trim());
      return move !== null;
    };

    const collector = message.channel.createMessageCollector({ filter, time: 10 * 60 * 1000 });

    collector.on('collect', async msg => {
      const move = parseMove(msg.content.trim());
      if (game.grid[move.row][move.col]) {
        await msg.reply('❌ That cell is already taken. Choose another one.');
        return;
      }

      const currentPlayer = game.currentTurn === 'X' ? game.challenger : game.opponent;
      game.grid[move.row][move.col] = currentPlayer.symbol;
      game.currentTurn = game.currentTurn === 'X' ? 'O' : 'X';

      const winner = checkWinner(game.grid);
      if (winner) {
        await message.channel.send(formatGrid(game.grid));
        if (winner === 'draw') {
          await message.channel.send('🤝 It\'s a draw!');
        } else {
          const winnerPlayer = game.challenger.symbol === winner ? game.challenger : game.opponent;
          await message.channel.send(`🏆 ${winnerPlayer.tag} wins!`);
        }
        activeGames.delete(gameKey);
        collector.stop();
        return;
      }

      await message.channel.send(formatGrid(game.grid));

      if (game.opponent.isBot && game.currentTurn === 'O') {
        const botMove = findBotMove(game.grid);
        if (botMove) {
          game.grid[botMove.r][botMove.c] = 'O';
          game.currentTurn = 'X';

          const botWinner = checkWinner(game.grid);
          if (botWinner) {
            await message.channel.send(formatGrid(game.grid));
            if (botWinner === 'draw') {
              await message.channel.send('🤝 It\'s a draw!');
            } else {
              await message.channel.send('🏆 I win! Better luck next time.');
            }
            activeGames.delete(gameKey);
            collector.stop();
            return;
          }

          await message.channel.send(formatGrid(game.grid));
        }
      }
    });

    collector.on('end', (_, reason) => {
      if (reason === 'time') {
        message.channel.send('⏰ Tic-Tac-Toe game timed out due to inactivity.').catch(() => {});
        activeGames.delete(gameKey);
      }
    });
  },
};
