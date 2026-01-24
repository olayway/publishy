import "dotenv/config";
import {
  Client,
  GatewayIntentBits,
  Partials,
  REST,
  Routes,
  SlashCommandBuilder,
} from "discord.js";
import cron from "node-cron";

const TOKEN = process.env.DISCORD_TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID;
const TIMEZONE = process.env.TIMEZONE || "UTC";

// Safety defaults
if (!TOKEN) throw new Error("Missing DISCORD_TOKEN in .env");
if (!CHANNEL_ID) throw new Error("Missing CHANNEL_ID in .env");

// Get current time info in configured timezone
function getTimeInZone(date = new Date()) {
  const options = { timeZone: TIMEZONE };
  const parts = new Intl.DateTimeFormat("en-US", {
    ...options,
    weekday: "short",
    hour: "numeric",
    hour12: false,
  }).formatToParts(date);

  const weekday = parts.find((p) => p.type === "weekday")?.value;
  const hour = parseInt(parts.find((p) => p.type === "hour")?.value || "0", 10);

  // Map weekday name to day number (0=Sun, 1=Mon, ..., 5=Fri, 6=Sat)
  const dayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const day = dayMap[weekday] ?? 0;

  return { day, hour };
}

// Get date string in configured timezone (for daily reset)
function getDateStringInZone(date = new Date()) {
  return date.toLocaleDateString("en-US", { timeZone: TIMEZONE });
}

// Whitelisted social media domains
const WHITELISTED_DOMAINS = [
  "twitter.com",
  "x.com",
  "reddit.com",
  "dev.to",
  "linkedin.com",
  "news.ycombinator.com",
  "medium.com",
  "hashnode.dev",
  "hashnode.com",
  "substack.com",
  "youtube.com",
  "youtu.be",
  "producthunt.com",
];

// Publishy mood states
const MOODS = {
  HAPPY: "happy",
  HUNGRY: "hungry",
  SAD: "sad",
  DYING: "dying",
};

// Mood icons
const MOOD_ICONS = {
  [MOODS.HAPPY]: "🌸",
  [MOODS.HUNGRY]: "🥺",
  [MOODS.SAD]: "💔",
  [MOODS.DYING]: "💀",
};

// Slash commands
const commands = [
  new SlashCommandBuilder().setName("pet").setDescription("Pet Publishy"),
  new SlashCommandBuilder()
    .setName("mood")
    .setDescription("Check how Publishy is feeling"),
  new SlashCommandBuilder()
    .setName("digest")
    .setDescription("See what Publishy has been fed this week"),
].map((cmd) => cmd.toJSON());

// Track daily posting stats
let lastSocialPostAt = null;
let postsToday = 0;
let lastCheckDate = getDateStringInZone();
let currentMood = MOODS.HAPPY;
let lastMoodMessageAt = null;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel],
});

// Extract URLs from message
function extractURLs(text) {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  return text.match(urlRegex) || [];
}

// Check if URL is from whitelisted social media
function isWhitelistedURL(url) {
  try {
    const urlObj = new URL(url);
    return WHITELISTED_DOMAINS.some((domain) =>
      urlObj.hostname.includes(domain),
    );
  } catch {
    return false;
  }
}

// Normalize URL by removing search params for deduplication
function normalizeURL(url) {
  try {
    const urlObj = new URL(url);
    return `${urlObj.origin}${urlObj.pathname}`;
  } catch {
    return url;
  }
}

// Get domain name from URL for grouping
function getDomain(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace("www.", "");
  } catch {
    return "unknown";
  }
}

// Get Publishy mood based on time since last post
function getMood() {
  // Weekend sleep: stay happy if fed on Friday
  if (isWeekendSleep()) return MOODS.HAPPY;

  if (!lastSocialPostAt) {
    const { hour } = getTimeInZone();
    if (hour < 12) return MOODS.HAPPY;
    if (hour < 16) return MOODS.HUNGRY;
    if (hour < 20) return MOODS.SAD;
    return MOODS.DYING;
  }

  const hoursSincePost = (Date.now() - lastSocialPostAt) / (1000 * 60 * 60);

  if (hoursSincePost < 12) return MOODS.HAPPY;
  if (hoursSincePost < 18) return MOODS.HUNGRY;
  if (hoursSincePost < 24) return MOODS.SAD;
  return MOODS.DYING;
}

// Get Publishy message based on mood
function getMoodMessage(mood) {
  const messages = {
    [MOODS.HAPPY]: [
      "YAY!! fresh Flowershow content!! ✨ i am nourished and thriving.",
      "*happy little bounce* content has arrived 💖",
      "oh wow!! a post!! i love my job 🥹",
      "this sparks joy. this is what i was made for ✨",
      "mmm yes. premium, organic, free-range Flowershow content 🌿",
      "my serotonin levels are 📈 thank you for feeding me.",
    ],

    [MOODS.HUNGRY]: [
      "um… hi… just checking if we maybe posted something today?",
      "*gentle poke* i could really go for a Flowershow link right now",
      "no rush!! just saying… i am a little empty inside.",
      "it's been a bit quiet… i'll just sit here and believe in us ✨",
      "me, patiently waiting for content like 🐣",
    ],

    [MOODS.SAD]: [
      "i'm starting to worry… no Flowershow posts today… 😢",
      "*stares at the timeline* did we forget…?",
      "it's very quiet in here. i made us tea but no one came ☕",
      "i don't want to pressure anyone but… i am emotionally under-posted",
      "this channel echoes when i speak.",
    ],

    [MOODS.DYING]: [
      "i am… running out of… content…",
      "*dramatically collapses* tell the world… about Flowershow…",
      "i have become dust. digital dust. because no one posted. ☠️",
      "this is my villain origin story.",
      "without posts… i simply fade into the backlog… goodbye… 🌫️",
    ],
  };

  const moodMessages = messages[mood] ?? [];
  const message = moodMessages[Math.floor(Math.random() * moodMessages.length)];
  const icon = MOOD_ICONS[mood] ?? "";

  return `${icon} ${message}`;
}

// Check if a date is a Friday (in configured timezone)
function isFriday(date) {
  const { day } = getTimeInZone(date);
  return day === 5;
}

// Check if current day is a weekend (Saturday or Sunday) in configured timezone
function isWeekend() {
  const { day } = getTimeInZone();
  return day === 0 || day === 6; // Sunday = 0, Saturday = 6
}

// Check if we're in "weekend sleep" mode
// This happens when it's a weekend and we were fed on the Friday before
function isWeekendSleep() {
  if (!isWeekend()) return false;
  if (!lastSocialPostAt) return false;

  const lastPostDate = new Date(lastSocialPostAt);
  if (!isFriday(lastPostDate)) return false;

  // Make sure it's the Friday of this weekend (not a week ago)
  const now = new Date();
  const daysSincePost = Math.floor(
    (now - lastPostDate) / (1000 * 60 * 60 * 24),
  );

  // If it's Saturday (day=6), Friday was yesterday (1 day ago)
  // If it's Sunday (day=0), Friday was 2 days ago
  return daysSincePost <= 2;
}

// Check if we should send a mood message
function shouldSendMoodMessage() {
  // Don't spam - wait at least 2 hours between mood messages
  if (lastMoodMessageAt) {
    const hoursSinceLastMessage =
      (Date.now() - lastMoodMessageAt) / (1000 * 60 * 60);
    if (hoursSinceLastMessage < 2) return false;
  }
  return true;
}

client.on("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);
  console.log(`Looking for channel ID: ${CHANNEL_ID}`);

  // Register slash commands
  const rest = new REST({ version: "10" }).setToken(TOKEN);
  await rest.put(Routes.applicationCommands(client.user.id), {
    body: commands,
  });
  console.log("Slash commands registered!");

  // Initialize from recent messages
  await refreshPostingStats();

  // Check multiple times daily: 10am, 2pm, 6pm, 9pm in configured timezone
  cron.schedule(
    "0 10,14,18,21 * * *",
    async () => {
      try {
        await checkAndRemind();
      } catch (err) {
        console.error("Check failed:", err);
      }
    },
    { timezone: TIMEZONE },
  );

  console.log("Publishy - the Flowershow social media monitor is alive! 🌸");
  console.log(`Timezone: ${TIMEZONE}`);
});

client.on("messageCreate", async (message) => {
  // Only track target channel, ignore bots
  if (message.channelId !== CHANNEL_ID) return;
  if (message.author?.bot) return;

  // Check for social media links
  const urls = extractURLs(message.content);
  const socialUrls = urls.filter(isWhitelistedURL);

  if (socialUrls.length > 0) {
    // Reset daily counter if it's a new day (in configured timezone)
    const today = getDateStringInZone();
    if (today !== lastCheckDate) {
      postsToday = 0;
      lastCheckDate = today;
    }

    postsToday++;
    lastSocialPostAt = Date.now();
    currentMood = MOODS.HAPPY;
    lastMoodMessageAt = Date.now();

    const channel = await client.channels.fetch(CHANNEL_ID);
    await channel.send(getMoodMessage(MOODS.HAPPY));

    console.log(`Social media post detected! Posts today: ${postsToday}`);
  }
});

// Handle slash commands
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === "pet") {
    const responses = [
      "*happy wiggles* 🌸 thank you for the pets!!",
      "hehe that tickles ✨",
      "*purrs in social media* 💖",
      "i feel so loved!! now please feed me a post 🥺",
    ];
    const response = responses[Math.floor(Math.random() * responses.length)];
    await interaction.reply(response);
  }

  if (interaction.commandName === "mood") {
    // Special response for weekend sleep mode
    if (isWeekendSleep()) {
      const sleepyResponses = [
        `😴 Mood: **sleepy**\n🛏️ shhh... i ate well on friday... now i rest...\n*snores in social media*`,
        `😴 Mood: **sleepy**\n🍕 friday feeding was *chef's kiss*... do not disturb...\n💤 zzz...posting...zzz...engagement...zzz`,
        `😴 Mood: **sleepy**\n🌙 weekends are for recharging, not posting\n*curls up in a pile of analytics*`,
        `😴 Mood: **sleepy**\n✨ i have achieved work-life balance (fed friday, sleep weekend)\n🐣 wake me up when it's monday`,
      ];
      const response =
        sleepyResponses[Math.floor(Math.random() * sleepyResponses.length)];
      await interaction.reply(response);
      return;
    }

    currentMood = getMood();
    const icon = MOOD_ICONS[currentMood];
    const hoursSince = lastSocialPostAt
      ? Math.round((Date.now() - lastSocialPostAt) / (1000 * 60 * 60))
      : null;

    const status = lastSocialPostAt
      ? `Last fed: ${hoursSince}h ago`
      : "Never been fed today 😢";

    await interaction.reply(
      `${icon} Mood: **${currentMood}**\n📊 Posts today: ${postsToday}\n⏰ ${status}`,
    );
  }

  if (interaction.commandName === "digest") {
    await interaction.deferReply(); // May take a while to fetch messages
    try {
      const posts = await getWeeklySummary();
      const summary = formatWeeklySummary(posts);
      await interaction.editReply(summary);
    } catch (err) {
      console.error("Failed to get weekly summary:", err);
      await interaction.editReply("😵 Oops! I couldn't fetch the summary...");
    }
  }
});

// Fetch posts from the last 7 days with unique URLs
async function getWeeklySummary() {
  const channel = await client.channels.fetch(CHANNEL_ID);
  if (!channel || !channel.isTextBased()) {
    throw new Error("Channel not found or not text-based.");
  }

  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const uniqueUrls = new Map(); // normalized URL -> { url, date, domain }

  let lastMessageId = null;
  let keepFetching = true;

  // Fetch messages in batches (Discord limits to 100 per request)
  while (keepFetching) {
    const options = { limit: 100 };
    if (lastMessageId) options.before = lastMessageId;

    const msgs = await channel.messages.fetch(options);
    if (msgs.size === 0) break;

    for (const [, msg] of msgs) {
      // Stop if we've gone past 7 days
      if (msg.createdTimestamp < sevenDaysAgo) {
        keepFetching = false;
        break;
      }

      if (msg.author?.bot) continue;

      const urls = extractURLs(msg.content);
      const socialUrls = urls.filter(isWhitelistedURL);

      for (const url of socialUrls) {
        const normalized = normalizeURL(url);
        // Only keep the first occurrence (most recent)
        if (!uniqueUrls.has(normalized)) {
          uniqueUrls.set(normalized, {
            url: normalized,
            date: new Date(msg.createdTimestamp),
            domain: getDomain(url),
          });
        }
      }

      lastMessageId = msg.id;
    }
  }

  return Array.from(uniqueUrls.values());
}

// Format the weekly summary for display
function formatWeeklySummary(posts) {
  if (posts.length === 0) {
    return "📭 No posts in the last 7 days... I am starving...";
  }

  // Group by domain
  const byDomain = {};
  for (const post of posts) {
    if (!byDomain[post.domain]) byDomain[post.domain] = [];
    byDomain[post.domain].push(post);
  }

  let summary = `🍽️ **My Digest** (${posts.length} yummy posts this week)\n\n`;

  for (const [domain, domainPosts] of Object.entries(byDomain)) {
    // Sort by date, oldest first
    domainPosts.sort((a, b) => a.date - b.date);
    summary += `**${domain}** (${domainPosts.length})\n`;
    for (const post of domainPosts) {
      const dateStr = post.date.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      });
      summary += `• ${post.url} (${dateStr})\n`;
    }
    summary += "\n";
  }

  return summary;
}

async function refreshPostingStats() {
  const channel = await client.channels.fetch(CHANNEL_ID);
  if (!channel || !channel.isTextBased()) {
    throw new Error("Channel not found or not text-based.");
  }

  // Fetch recent messages and look for social media links today
  const msgs = await channel.messages.fetch({ limit: 100 });
  const today = getDateStringInZone();

  for (const [, msg] of msgs) {
    if (msg.author?.bot) continue;

    const msgDate = getDateStringInZone(new Date(msg.createdTimestamp));
    const urls = extractURLs(msg.content);
    const socialUrls = urls.filter(isWhitelistedURL);

    if (socialUrls.length > 0) {
      if (!lastSocialPostAt || msg.createdTimestamp > lastSocialPostAt) {
        lastSocialPostAt = msg.createdTimestamp;
      }

      if (msgDate === today) {
        postsToday++;
      }
    }
  }

  lastCheckDate = today;
  currentMood = getMood();

  console.log(
    `Initialized: ${postsToday} posts today, last post: ${lastSocialPostAt ? new Date(lastSocialPostAt).toLocaleString() : "never"}`,
  );
}

async function checkAndRemind() {
  // Weekend sleep: skip checks if fed on Friday
  if (isWeekendSleep()) {
    console.log("Weekend sleep mode - Publishy is resting 😴");
    return;
  }

  const channel = await client.channels.fetch(CHANNEL_ID);
  if (!channel || !channel.isTextBased()) return;

  // Reset daily counter if it's a new day (in configured timezone)
  const today = getDateStringInZone();
  if (today !== lastCheckDate) {
    postsToday = 0;
    lastCheckDate = today;
  }

  currentMood = getMood();

  // If we haven't posted today and should send a message
  if (postsToday === 0 && shouldSendMoodMessage()) {
    await channel.send(getMoodMessage(currentMood));
    lastMoodMessageAt = Date.now();
  }

  console.log(
    `Check: ${postsToday} posts today, mood: ${currentMood}, last post: ${lastSocialPostAt ? new Date(lastSocialPostAt).toLocaleString() : "never"}`,
  );
}

client.login(TOKEN);
