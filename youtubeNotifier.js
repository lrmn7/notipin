const { Client, Intents, TextChannel } = require('discord.js');
const Parser = require('rss-parser');
const fs = require('fs');
require('dotenv').config();

const parser = new Parser();
const client = new Client({
  intents: [
    Intents.FLAGS.GUILDS,
    Intents.FLAGS.GUILD_MESSAGES,
  ],
});

const PREFIX = '!';

let serverChannelData = {};

try {
  const data = fs.readFileSync('serverChannelData.json', 'utf8');
  serverChannelData = JSON.parse(data);
} catch (err) {
  console.error('Error reading file:', err);
}

let lastNotifiedLivestreams = {};

try {
  const data = fs.readFileSync('lastNotifiedLivestreams.json', 'utf8');
  lastNotifiedLivestreams = JSON.parse(data);
} catch (err) {
  console.error('Error reading file:', err);
}

client.once('ready', () => {
  console.log('Bot is ready');
  client.user.setActivity(process.env.ACTIVITY, { type: 'WATCHING' });
});

client.on('guildCreate', async (guild) => {
  console.log(`Bot diundang ke server: ${guild.name} (ID: ${guild.id})`);

  const welcomeChannel = client.channels.cache.get(process.env.WELCOME_CHANNEL_ID);
  if (welcomeChannel) {
    welcomeChannel.send(`Bot telah diundang ke server ${guild.name}!`);
  }

  const targetChannel = guild.channels.cache.find(channel => channel.type === 'GUILD_TEXT' && channel.permissionsFor(guild.members.me).has('SEND_MESSAGES'));
  if (targetChannel) {
    try {
      await targetChannel.send(`Terima kasih telah mengundang aku ke server ini. Aku siap melayani dalam hal Notifikasi Youtube!\n\`${PREFIX}notipin <channelYoutubeID>\` atau \`${PREFIX}hapusin <channelYoutubeID>\` sebagai perintah.\nHave fun and enjoys!`);
      console.log(`Sent welcome message to ${targetChannel.name} in server ${guild.name}`);
    } catch (error) {
      console.error('Error sending message:', error);
    }
  }
});

client.on('guildDelete', guild => {
  console.log(`Bot di-kick dari server: ${guild.name} (ID: ${guild.id})`);

  const welcomeChannel = client.channels.cache.get(process.env.WELCOME_CHANNEL_ID);
  if (welcomeChannel) {
    welcomeChannel.send(`Bot telah di-kick dari server ${guild.name}.`);
  }
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  console.log(`Received message: "${message.content}" from ${message.author.tag}`);

  if (!message.content.startsWith(PREFIX)) return;
  console.log(`Command received: "${message.content}"`);

  const args = message.content.slice(PREFIX.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  if (command === 'notipin') {
    if (args.length < 1) {
      message.channel.send(`Format perintah yang kamu masukan salah.\nGunakan: \`${PREFIX}notipin <channelYoutubeID>\``);
      return;
    }

    const youtubeChannel = args[0];
    const serverId = message.guild.id;

    if (!serverChannelData[serverId]) {
      serverChannelData[serverId] = {};
    }

    const discordChannel = await client.channels.fetch(message.channel.id);
    const channelName = discordChannel instanceof TextChannel ? discordChannel.name : 'unknown';

    if (serverChannelData[serverId][youtubeChannel]) {
      message.channel.send(`Oops! Channel YouTube tersebut sudah terdaftar.\nGunakan perintah \`${PREFIX}hapusin <ChannelYoutubeID>\` untuk menghapus.`);
    } else {
      serverChannelData[serverId][youtubeChannel] = discordChannel.id;

      fs.writeFile('serverChannelData.json', JSON.stringify(serverChannelData), (err) => {
        if (err) console.error('Error writing file:', err);
      });

      message.channel.send(`Channel Youtube kamu berhasil didaftarkan, siap menerima notifikasi!\nGunakan perintah \`${PREFIX}hapusin ${youtubeChannel}\` bila tidak ingin menerima notifikasi lagi.`);
      console.log(`Added YouTube channel ${youtubeChannel} to ${channelName} in server ${message.guild.name}`);
    }
  } else if (command === 'remove' || command === 'hapusin') {
    const youtubeChannel = args[0];
    const serverId = message.guild.id;

    if (serverChannelData[serverId] && serverChannelData[serverId][youtubeChannel]) {
      delete serverChannelData[serverId][youtubeChannel];

      fs.writeFile('serverChannelData.json', JSON.stringify(serverChannelData), (err) => {
        if (err) console.error('Error writing file:', err);
      });

      message.channel.send(`Channel YouTube kamu berhasil dihapus dari daftar notifikasi.`);
      console.log(`Removed YouTube channel ${youtubeChannel} from notifications in server ${message.guild.name}`);
    } else {
      message.channel.send(`Maaf, Channel YouTube tersebut tidak ditemukan dalam daftar notifikasi.`);
    }
  } else {
    // Respond to invalid command
    message.channel.send(`Perintah yang kamu masukkan tidak dikenali. Contoh penggunaan: \n\`${PREFIX}notipin <channelIDYoutube>\` atau \`${PREFIX}hapusin <channelIDYoutube>\``);
  }
});



async function sendNotification(channelId, videoTitle, videoLink) {
  const channel = await client.channels.fetch(channelId);
  if (channel && channel.isText()) {
    const messageContent = `🔴 NOTIPIN ALERT: Hey @everyone ulah poho di like, comment n subscribe!\n\n${videoTitle}\n${videoLink}`;

    channel.send(messageContent)
      .catch(error => {
        console.error('Error sending notification:', error);
      });
    console.log(`Sent notification to ${channel.name} in server ${channel.guild.name}`);
  }
}

function cleanOldData() {
  const currentTime = Date.now();
  const twentyFourHoursAgo = currentTime - 24 * 60 * 60 * 1000;

  for (const channel in lastNotifiedLivestreams) {
    lastNotifiedLivestreams[channel] = lastNotifiedLivestreams[channel].filter(linkTime => linkTime.timestamp >= twentyFourHoursAgo);
  }

  fs.writeFile('lastNotifiedLivestreams.json', JSON.stringify(lastNotifiedLivestreams), (err) => {
    if (err) console.error('Error writing file:', err);
  });
}

async function checkLiveStreams() {
  console.log('Checking livestreams...');
  cleanOldData();

  for (const serverId in serverChannelData) {
    const channels = serverChannelData[serverId];

    for (const youtubeChannel in channels) {
      const discordChannel = channels[youtubeChannel];

      try {
        const feed = await parser.parseURL(`https://www.youtube.com/feeds/videos.xml?channel_id=${youtubeChannel}`);
        
        if (feed.items && feed.items.length > 0) {
          const latestItem = feed.items[0];
          const videoTitle = latestItem.title;
          const videoLink = latestItem.link;
          const isLive = latestItem.hasOwnProperty('yt$liveBroadcast'); // Check for live status

          if (!lastNotifiedLivestreams[discordChannel]) {
            lastNotifiedLivestreams[discordChannel] = [];
          }

          if (!lastNotifiedLivestreams[discordChannel].find(linkTime => linkTime.link === videoLink)) {
            sendNotification(discordChannel, videoTitle, videoLink);
            lastNotifiedLivestreams[discordChannel].push({ link: videoLink, timestamp: Date.now() });

            fs.writeFile('lastNotifiedLivestreams.json', JSON.stringify(lastNotifiedLivestreams), (err) => {
              if (err) console.error('Error writing file:', err);
            });
          }
        } else {
          console.error(`No items found in RSS feed for channel ${youtubeChannel}`);
          delete channels[youtubeChannel];
          fs.writeFile('serverChannelData.json', JSON.stringify(serverChannelData), (err) => {
            if (err) console.error('Error writing file:', err);
          });
        }
      } catch (error) {
        console.error(`Error fetching or parsing RSS feed for channel ${youtubeChannel}:`, error);
        delete channels[youtubeChannel];
        fs.writeFile('serverChannelData.json', JSON.stringify(serverChannelData), (err) => {
          if (err) console.error('Error writing file:', err);
        });
      }
    }
  }
}


setInterval(checkLiveStreams, 5 * 60 * 1000);

client.login(process.env.DISCORD_TOKEN);
