const activeGames = new Map();

const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank });
    }
  }
  return deck;
}

function shuffle(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function cardValue(card) {
  if (card.rank === 'A') return 11;
  if (['J', 'Q', 'K'].includes(card.rank)) return 10;
  return parseInt(card.rank, 10);
}

function handValue(hand) {
  let value = 0;
  let aces = 0;
  for (const card of hand) {
    value += cardValue(card);
    if (card.rank === 'A') aces++;
  }
  while (value > 21 && aces > 0) {
    value -= 10;
    aces--;
  }
  return value;
}

function formatHand(hand, hideFirst = false) {
  const cards = hand.map((card, index) => {
    if (hideFirst && index === 0) return '🂠';
    return `${card.rank}${card.suit}`;
  });
  return cards.join(' ');
}

function dealInitial(deck) {
  return {
    player: [deck.pop(), deck.pop()],
    dealer: [deck.pop(), deck.pop()],
    deck,
  };
}

function gameStatus(game) {
  const playerVal = handValue(game.playerHand);
  const dealerVal = handValue(game.dealerHand);

  if (playerVal > 21) return 'dealer';
  if (dealerVal > 21) return 'player';
  if (game.stood) {
    if (playerVal > dealerVal) return 'player';
    if (dealerVal > playerVal) return 'dealer';
    return 'draw';
  }
  return null;
}

async function sendTable(message, game, showDealer = false, footer = '') {
  const dealerValue = showDealer ? handValue(game.dealerHand) : '?';
  const playerValue = handValue(game.playerHand);

  let text = `🃏 **Blackjack**\n`;
  text += `Dealer: ${formatHand(game.dealerHand, !showDealer)} (${dealerValue})\n`;
  text += `You:    ${formatHand(game.playerHand)} (${playerValue})\n`;
  if (footer) text += `\n${footer}`;

  await message.channel.send(text);
}

module.exports = {
  name: 'blackjack',
  description: 'Play a game of blackjack against the bot',
  async execute(message) {
    const gameKey = `${message.guild.id}-${message.channel.id}-${message.author.id}`;

    if (activeGames.has(gameKey)) {
      return message.reply('❌ You already have a blackjack game in progress. Finish it first.');
    }

    const deck = shuffle(createDeck());
    const { player, dealer, deck: remainingDeck } = dealInitial(deck);

    const game = {
      playerHand: player,
      dealerHand: dealer,
      deck: remainingDeck,
      stood: false,
      gameKey,
      message,
    };

    activeGames.set(gameKey, game);

    await sendTable(message, game, false, 'Send `hit` to draw a card or `stand` to hold.');

    const playerValue = handValue(game.playerHand);
    if (playerValue === 21) {
      game.stood = true;
      await finishGame(message, game);
      return;
    }

    const filter = (msg) =>
      msg.author.id === message.author.id &&
      ['hit', 'stand', 'h', 's'].includes(msg.content.trim().toLowerCase());

    const collector = message.channel.createMessageCollector({ filter, time: 10 * 60 * 1000 });

    collector.on('collect', async (msg) => {
      const action = msg.content.trim().toLowerCase();

      if (action === 'hit' || action === 'h') {
        game.playerHand.push(game.deck.pop());
        const value = handValue(game.playerHand);

        if (value > 21) {
          await sendTable(message, game, true, '💥 Bust! You lose.');
          activeGames.delete(gameKey);
          collector.stop();
          return;
        }

        if (value === 21) {
          game.stood = true;
          await finishGame(message, game);
          activeGames.delete(gameKey);
          collector.stop();
          return;
        }

        await sendTable(message, game, false, 'Send `hit` to draw a card or `stand` to hold.');
      } else if (action === 'stand' || action === 's') {
        game.stood = true;
        await finishGame(message, game);
        activeGames.delete(gameKey);
        collector.stop();
      }
    });

    collector.on('end', (_, reason) => {
      if (reason === 'time') {
        message.channel
          .send('⏰ Blackjack game timed out due to inactivity.')
          .catch(() => {});
        activeGames.delete(gameKey);
      }
    });
  },
};

async function finishGame(message, game) {
  while (handValue(game.dealerHand) < 17) {
    game.dealerHand.push(game.deck.pop());
  }

  const status = gameStatus(game);
  let footer;
  if (status === 'player') footer = '🏆 You win!';
  else if (status === 'dealer') footer = '❌ Dealer wins.';
  else footer = '🤝 It\'s a push (draw).';

  await sendTable(message, game, true, footer);
}
