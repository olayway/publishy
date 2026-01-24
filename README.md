# Publishy - Tamagotchi-style Social Media Reminder Bot 🌸

A Discord bot that helps your team stay consistent with social media posting. It works by monitoring a Discord channel where you share links to your published posts - when you post on Twitter, LinkedIn, etc., drop the link in your team's "socials" channel and Publishy celebrates! If no one posts for a while, it gets sad and reminds you.

**Note:** Publishy doesn't connect to social media platforms directly. It simply watches a Discord channel for links - your team manually shares links after posting on social media (or has it automated).

## Features

- **Tamagotchi-style emotional responses** - The bot gets progressively sadder without social media posts
- **Automatic link detection** - Monitors a Discord channel where your team shares links to their posts
- **Daily posting tracker** - Counts how many times you've posted each day
- **Smart reminders** - Checks multiple times daily and sends mood-appropriate messages
- **Real-time celebrations** - Immediately reacts when you share social media links
- **Weekend sleep mode** - Fed on Friday? Publishy rests through the weekend and wakes up Monday
- **Timezone support** - Configure the bot to work in your team's timezone

## Commands

| Command   | Description                                     |
| --------- | ----------------------------------------------- |
| `/pet`    | Pet Publishy and get a cute response            |
| `/mood`   | Check Publishy's current mood and posting stats |
| `/digest` | See unique posts from the last 7 days by domain |

## Setup

### Prerequisites

- Node.js (v16 or higher)
- A Discord bot token
- A Discord server where you have admin permissions

### Installation

1. Clone this repository
2. Install dependencies:

   ```bash
   npm install
   ```

3. Create a `.env` file in the root directory:

   ```bash
   cp .env.example .env
   ```

4. Configure your `.env` file:
   ```
   DISCORD_TOKEN=your_bot_token_here
   CHANNEL_ID=your_channel_id_here
   TIMEZONE=America/New_York  # optional, defaults to UTC
   ```

### Discord Bot Setup

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application or select your existing bot
3. Go to **Bot** section:
   - Copy your bot token and add it to `.env`
   - Enable **MESSAGE CONTENT INTENT** under Privileged Gateway Intents
4. Go to **OAuth2 → URL Generator**:
   - Select scope: `bot`
   - Select permissions: `View Channels`, `Send Messages`, `Read Message History`
   - Copy the generated URL and use it to invite the bot to your server
5. Get your channel ID:
   - Enable Developer Mode in Discord (Settings → Advanced → Developer Mode)
   - Right-click your "socials" channel → Copy Channel ID
   - Add it to `.env`

### Running the Bot

```bash
npm start
```

The bot will connect to Discord and start monitoring your configured channel.

## How It Works

### The Basic Flow

1. Someone on your team posts content on a social media platform (Twitter, LinkedIn, etc.)
2. They share the link in your designated Discord channel (e.g., `#socials`)
3. Publishy detects the link, gets happy, and celebrates
4. If no one shares links for a while, Publishy gets progressively sadder and sends reminders

### Tamagotchi Mood System

The bot has 4 emotional states based on posting frequency:

| Mood          | Time Since Last Post | Behavior                                    |
| ------------- | -------------------- | ------------------------------------------- |
| **Happy** 😊  | < 12 hours           | Celebrates when you post social media links |
| **Hungry** 🥺 | 12-18 hours          | Gentle reminders about posting              |
| **Sad** 😢    | 18-24 hours          | More urgent pleas for content               |
| **Dying** 💀  | > 24 hours           | Dramatic death scenes without posts         |
| **Sleepy** 😴 | Weekend (fed Friday) | Resting after Friday feeding                |

**Weekend Sleep Mode**: If you feed Publishy on Friday, it will "sleep" through the weekend and skip all checks. It wakes up on Monday ready for a new week!

### Scheduled Checks

The bot checks your posting status 4 times per day (in your configured timezone):

- **10:00 AM** - Morning check
- **2:00 PM** - Afternoon check
- **6:00 PM** - Evening check
- **9:00 PM** - Night check

At each check, if you haven't posted today and it's been at least 2 hours since the last mood message, the bot will send a reminder based on its current mood.

During **weekend sleep mode** (Saturday/Sunday after a Friday feeding), all checks are skipped.

### Link Detection

When someone posts a message in the monitored Discord channel, the bot:

1. Scans the message for URLs
2. Checks if any URLs are from whitelisted social media platforms
3. If found, updates the daily counter and celebrates immediately
4. Resets mood to Happy

This means your workflow is: **post on social media → share link in Discord → Publishy is fed!**

### Whitelisted Platforms

The bot currently recognizes links from:

- X/Twitter (`x.com`, `twitter.com`)
- Reddit (`reddit.com`)
- YouTube (`youtube.com`, `youtu.be`)
- LinkedIn (`linkedin.com`)
- Hacker News (`news.ycombinator.com`)
- Medium (`medium.com`)
- dev.to (`dev.to`)
- Hashnode (`hashnode.dev`, `hashnode.com`)
- Substack (`substack.com`)
- Product Hunt (`producthunt.com`)

## Configuration

### Environment Variables

| Variable        | Required | Description                                                             |
| --------------- | -------- | ----------------------------------------------------------------------- |
| `DISCORD_TOKEN` | Yes      | Your Discord bot token from the Developer Portal                        |
| `CHANNEL_ID`    | Yes      | The ID of the Discord channel to monitor (e.g., your "socials" channel) |
| `TIMEZONE`      | No       | IANA timezone name (default: `UTC`). Examples: `America/New_York`, `Europe/London`, `Asia/Tokyo`. [Full list](https://en.wikipedia.org/wiki/List_of_tz_database_time_zones) |

### Customizing the Bot

You can customize the following in [index.js](index.js):

**Whitelisted domains**:

```javascript
const WHITELISTED_DOMAINS = [
  "twitter.com",
  "x.com",
  // Add more domains here
];
```

**Check schedule**:

```javascript
// Current: 10am, 2pm, 6pm, 9pm
cron.schedule("0 10,14,18,21 * * *", ...)
// Cron format: "minute hour * * *"
```

**Mood timing**:

```javascript
if (hoursSincePost < 12) return MOODS.HAPPY; // 0-12 hours
if (hoursSincePost < 18) return MOODS.HUNGRY; // 12-18 hours
if (hoursSincePost < 24) return MOODS.SAD; // 18-24 hours
return MOODS.DYING; // 24+ hours
```

**Message frequency**:

```javascript
// Wait at least 2 hours between messages
if (hoursSinceLastMessage < 2) return false;
```

**Custom messages**:
Edit the message arrays for each mood to customize the bot's personality.

## Bot Behavior Examples

### When you post a social media link:

```
User: Check out our latest post! https://twitter.com/myproject/status/123
Bot: 🌸 YAY!! fresh content!! ✨ i am nourished and thriving.
```

### Morning check with no posts yet:

```
Bot: 🥺 um… hi… just checking if we maybe posted something today?
```

### Evening check still with no posts:

```
Bot: 💔 i'm starting to worry… no posts today… 😢
```

### Late night with no posts:

```
Bot: 💀 i am… running out of… content…
```

### Weekend sleep mode:

```
Bot: 😴 Mood: **sleepy**
🛏️ shhh... i ate well on friday... now i rest...
*snores in social media*
```

## Troubleshooting

**Bot won't start - "Used disallowed intents"**

- Enable MESSAGE CONTENT INTENT in Discord Developer Portal → Bot → Privileged Gateway Intents

**Bot won't start - "Missing Access"**

- Make sure the bot is invited to your server
- Check that the bot has View Channel, Send Messages, and Read Message History permissions
- If the channel is private, explicitly add the bot to the channel permissions

**Bot doesn't respond to links**

- Verify the links are from whitelisted domains
- Check that the bot is monitoring the correct channel (check console output for channel ID)
- Make sure MESSAGE CONTENT INTENT is enabled

## License

ISC
