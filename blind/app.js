// i18n + cycleLang + updateLangCycleBtn are loaded from lang.js

// ==================== Theme system ====================
let currentThemeMode = localStorage.getItem('bs-theme') || 'light';
let currentAccent = localStorage.getItem('bs-accent') || 'sunset';

function initTheme() {
  setTheme(currentThemeMode, true);
  setAccent(currentAccent, true);
}

function toggleTheme() {
  setTheme(currentThemeMode === 'dark' ? 'light' : 'dark');
}

function setTheme(mode, silent) {
  currentThemeMode = mode;
  document.documentElement.setAttribute('data-theme', mode);
  localStorage.setItem('bs-theme', mode);
  document.querySelectorAll('.theme-mode-btn').forEach(b => b.classList.remove('active'));
  const btn = document.getElementById('modeBtn-' + mode);
  if (btn) btn.classList.add('active');
}

function setAccent(name, silent) {
  currentAccent = name;
  document.documentElement.setAttribute('data-accent', name);
  localStorage.setItem('bs-accent', name);
  document.querySelectorAll('.accent-swatch').forEach(s => {
    s.classList.toggle('active', s.dataset.accent === name);
  });
}

function toggleSettings() {
  const panel = document.getElementById('settingsPanel');
  const backdrop = document.getElementById('settingsBackdrop');
  const isOpen = panel.classList.contains('open');
  panel.classList.toggle('open', !isOpen);
  backdrop.classList.toggle('open', !isOpen);
}

initTheme();
i18n.init();

// ==================== API MODULE ====================
const API_URL = 'https://api.rome.markets';

const blindApi = {
  _userId() { return localStorage.getItem('bs-user-id') || ''; },

  async _fetch(path, options = {}) {
    const res = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': this._userId(),
        ...options.headers
      }
    });
    return res.json();
  },

  auth(username) {
    return this._fetch('/api/blind/auth', {
      method: 'POST',
      body: JSON.stringify({ username })
    });
  },

  createSession(pack_key, lang) {
    return this._fetch('/api/blind/sessions', {
      method: 'POST',
      body: JSON.stringify({ pack_key, lang })
    });
  },

  getSession(code) {
    return this._fetch(`/api/blind/sessions/${code}`);
  },

  joinSession(code) {
    return this._fetch(`/api/blind/sessions/${code}/join`, { method: 'POST' });
  },

  submitAnswers(code, answers) {
    return this._fetch(`/api/blind/sessions/${code}/answers`, {
      method: 'POST',
      body: JSON.stringify({ answers })
    });
  },

  getResults(code) {
    return this._fetch(`/api/blind/sessions/${code}/results`);
  },

  getUserSessions() {
    return this._fetch('/api/blind/sessions/user');
  }
};

// ==================== STATE ====================
let currentScreen = 'splash';
let currentQuestion = 0;
let selectedAnswers = {};
let selectedPackKey = 'couples';
let currentUser = JSON.parse(localStorage.getItem('bs-user') || 'null');
let currentSession = null;
let pollTimer = null;
let afterAuthTarget = 'home';
let joinCode = null; // set when joining via URL

// Pack definitions — language-independent metadata
const packDefs = [
  { key: '36questions', emoji: '❤️‍🔥', nameKey: 'pack_36questions', countKey: 'pack_count_36questions', wide: true, cat: 'love', badge: 'trending', plays: '24.1k', featured: true, featuredBadge: 'trending', descKey: 'pack_desc_36questions' },
  { key: 'couples',     emoji: '💕', nameKey: 'pack_couples',      countKey: 'pack_count_couples',      cat: 'love', badge: 'hot', plays: '18.3k' },
  { key: 'bestfriends', emoji: '👯', nameKey: 'pack_bestfriends',  countKey: 'pack_count_bestfriends',  cat: 'friends', badge: 'popular', plays: '12.7k' },
  { key: 'deeptalk',    emoji: '🌊', nameKey: 'pack_deeptalk',     countKey: 'pack_count_deeptalk',     cat: 'deep', plays: '9.4k' },
  { key: 'coworkers',   emoji: '💼', nameKey: 'pack_coworkers',    countKey: 'pack_count_coworkers',    cat: 'work', plays: '5.2k' },
  { key: 'hottakes',    emoji: '🌶️', nameKey: 'pack_hottakes',    countKey: 'pack_count_hottakes',    cat: 'spicy', badge: 'hot', plays: '21.5k', featured: true, featuredBadge: 'viral', descKey: 'pack_desc_hottakes' },
  { key: 'redflags',    emoji: '🚩', nameKey: 'pack_redflags',    countKey: 'pack_count_redflags',    cat: 'spicy', badge: 'new', plays: '15.8k', featured: true, featuredBadge: 'new-badge', descKey: 'pack_desc_redflags' },
  { key: 'chaotic',     emoji: '🎲', nameKey: 'pack_chaotic',     countKey: 'pack_count_chaotic',     cat: 'spicy', badge: 'new', plays: '11.2k' },
  { key: 'fungames',   emoji: '🎉', nameKey: 'pack_fungames',   countKey: 'pack_count_fungames',   cat: 'friends', badge: 'new', plays: '8.9k', featured: true, featuredBadge: 'new-badge', descKey: 'pack_desc_fungames' },
  { key: 'worldtaste', emoji: '🌍', nameKey: 'pack_worldtaste', countKey: 'pack_count_worldtaste', cat: 'culture', badge: 'trending', plays: '14.2k', featured: true, featuredBadge: 'trending', descKey: 'pack_desc_worldtaste' },
  { key: 'ethics',     emoji: '⚖️', nameKey: 'pack_ethics',     countKey: 'pack_count_ethics',     cat: 'deep', plays: '7.6k' },
  { key: 'situations', emoji: '😱', nameKey: 'pack_situations', countKey: 'pack_count_situations', cat: 'spicy', badge: 'hot', plays: '16.1k', featured: true, featuredBadge: 'viral', descKey: 'pack_desc_situations' },
  { key: 'livingtogether', emoji: '🏠', nameKey: 'pack_livingtogether', countKey: 'pack_count_livingtogether', cat: 'lifestyle', plays: '6.3k' },
  { key: 'soulspirit', emoji: '🕊️', nameKey: 'pack_soulspirit', countKey: 'pack_count_soulspirit', cat: 'culture', plays: '9.8k' },
];

// Category definitions for filter pills
const packCategories = [
  { key: 'all',     labelKey: 'cat_all',     icon: '' },
  { key: 'love',    labelKey: 'cat_love',    icon: '' },
  { key: 'friends', labelKey: 'cat_friends', icon: '' },
  { key: 'spicy',   labelKey: 'cat_spicy',   icon: '' },
  { key: 'deep',    labelKey: 'cat_deep',    icon: '' },
  { key: 'work',    labelKey: 'cat_work',    icon: '' },
  { key: 'culture',   labelKey: 'cat_culture',   icon: '' },
  { key: 'lifestyle', labelKey: 'cat_lifestyle', icon: '' },
];
let activePackFilter = 'all';

// Question packs per language — partnerAnswerIndex stores index so it works across languages
const questionPacks = {
  en: {
    couples: [
      { q: "What's the first thing you noticed about the other person?", options: ["Their smile", "Their energy", "Their style", "Their humor"], pi: 1 },
      { q: "If you two had a song, what genre would it be?", options: ["R&B / Soul", "Pop", "Indie", "Lo-fi beats"], pi: 2 },
      { q: "What do you secretly admire most about them?", options: ["Their confidence", "Their kindness", "Their creativity", "Their resilience"], pi: 1 },
      { q: "Pick a vibe for your ideal hangout:", options: ["Rooftop sunset", "Late night drive", "Cozy movie night", "Spontaneous adventure"], pi: 1 },
      { q: "One word to describe your bond:", options: ["Chaotic", "Electric", "Comfort", "Unmatched"], pi: 1 },
    ],
    bestfriends: [
      { q: "What's your go-to comfort food?", options: ["Pizza", "Ramen", "Tacos", "Ice cream"], pi: 1 },
      { q: "Pick a weekend plan:", options: ["Brunch + thrifting", "Netflix marathon", "Road trip", "Do absolutely nothing"], pi: 2 },
      { q: "What's the best quality in a friend?", options: ["Loyalty", "Humor", "Honesty", "Spontaneity"], pi: 1 },
      { q: "Your friendship anthem genre:", options: ["Pop bangers", "Throwback hits", "Indie vibes", "Hip-hop"], pi: 1 },
      { q: "How do you cheer each other up?", options: ["Memes", "Food delivery", "Show up unannounced", "Long voice notes"], pi: 0 },
    ],
    deeptalk: [
      { q: "What matters most to you in life?", options: ["Freedom", "Connection", "Growth", "Security"], pi: 1 },
      { q: "Your biggest fear:", options: ["Being forgotten", "Being alone", "Wasting time", "Losing myself"], pi: 2 },
      { q: "What does love look like to you?", options: ["Small daily acts", "Grand gestures", "Just being there", "Words of affirmation"], pi: 0 },
      { q: "If you could change one thing about the world:", options: ["More empathy", "More honesty", "More equality", "More curiosity"], pi: 0 },
      { q: "What's your emotional superpower?", options: ["Reading the room", "Staying calm", "Making people laugh", "Deep listening"], pi: 3 },
    ],
    coworkers: [
      { q: "Morning person or night owl?", options: ["Up at 6am", "Night owl 100%", "Depends on the day", "Permanently tired"], pi: 3 },
      { q: "Ideal work setup:", options: ["Coffee shop", "Home office", "Open plan", "Library silence"], pi: 1 },
      { q: "Your meeting style:", options: ["Camera on, engaged", "Camera off, multitask", "This could be an email", "Love a whiteboard"], pi: 2 },
      { q: "Slack message style:", options: ["One long paragraph", "20 short messages", "Voice note", "Just emojis"], pi: 3 },
      { q: "Lunch break move:", options: ["Desk lunch", "Walk outside", "Group lunch", "Power nap"], pi: 1 },
    ],
    hottakes: [
      { q: "Pineapple on pizza?", options: ["Elite tier", "Absolutely not", "Depends on the mood", "Never tried it"], pi: 0 },
      { q: "Double texting is:", options: ["Brave and iconic", "A cry for help", "Totally normal", "Depends who it is"], pi: 2 },
      { q: "Crying in public:", options: ["Powerful", "Mortifying", "Depends on the cry", "I've done it today"], pi: 0 },
      { q: "The best era of music:", options: ["Right now", "2000s nostalgia", "90s forever", "70s/80s classics"], pi: 1 },
      { q: "Astrology is:", options: ["Scarily accurate", "Fun but fake", "Total nonsense", "I don't know my sign"], pi: 1 },
      { q: "Situationships are:", options: ["The worst invention", "Kinda valid", "Just vibing", "A red flag factory"], pi: 1 },
      { q: "Reply time matters?", options: ["Yes 100%", "Nah I forget too", "Only at the start", "If you care you reply"], pi: 3 },
      { q: "The ick is:", options: ["Real and valid", "Overused", "Just an excuse", "I'm the ick"], pi: 0 },
      { q: "AI taking over:", options: ["Already happened", "Kinda scared", "Bring it on", "I for one welcome it"], pi: 1 },
      { q: "Ghosting someone:", options: ["Sometimes necessary", "Always wrong", "Depends on context", "I've been the ghost"], pi: 2 },
    ],
    redflags: [
      { q: "They take 3 days to reply:", options: ["Red flag", "Maybe they're busy", "I do that too", "Depends how good the text is"], pi: 0 },
      { q: "They don't like dogs:", options: ["Instant dealbreaker", "Cats > dogs anyway", "Not everyone's thing", "Suspicious but ok"], pi: 3 },
      { q: "They post everything on social:", options: ["Love the confidence", "Major red flag", "As long as I'm in it", "I do the same lol"], pi: 1 },
      { q: "They're still friends with their ex:", options: ["Mature king/queen", "Absolutely not", "Case by case", "I need more info"], pi: 2 },
      { q: "They eat cereal with water:", options: ["Call the police", "I'm leaving", "Curiosity respected", "I pretend I didn't see"], pi: 0 },
      { q: "They never initiate plans:", options: ["Red flag", "Maybe they're shy", "I'm the planner anyway", "We'd never hang out"], pi: 0 },
      { q: "They have zero social media:", options: ["Green flag honestly", "What are they hiding", "Mysterious vibes", "Same tbh"], pi: 0 },
      { q: "They fall asleep during movies:", options: ["Adorable", "Disrespectful", "Only if it's boring", "Wake them up dramatically"], pi: 0 },
      { q: "They order for you at restaurants:", options: ["Romantic", "Controlling energy", "Only if they know me", "Bold move"], pi: 2 },
      { q: "They say 'I'm fine' when they're not:", options: ["I'll dig deeper", "Give them space", "Same I do that", "Red flag if always"], pi: 0 },
    ],
    chaotic: [
      { q: "Last thing you'd grab in a fire:", options: ["Phone charger", "Snacks", "My dignity", "I'd just stand there"], pi: 2 },
      { q: "Your Roman Empire:", options: ["That one embarrassing memory", "Unrequited love", "Alternate timelines", "Dinosaurs honestly"], pi: 0 },
      { q: "You're a villain. Your weapon:", options: ["Passive aggressive texts", "Weaponized silence", "Chaotic playlists", "Spoiling show endings"], pi: 3 },
      { q: "Survival skill you actually have:", options: ["Can nap anywhere", "Eating questionable leftovers", "Parallel parking", "Crying on command"], pi: 0 },
      { q: "Pick a fake job title:", options: ["Chief Overthinker", "Professional Yapper", "Vibe Consultant", "Nap Architect"], pi: 1 },
      { q: "Your FBI agent thinks you're:", options: ["Unhinged", "Boring honestly", "Concerning", "Their favorite assignment"], pi: 3 },
      { q: "3am thought:", options: ["What if gravity stops", "I should text my ex", "Am I real", "I need cheese"], pi: 3 },
      { q: "Your catchphrase:", options: ["It is what it is", "No thoughts head empty", "Anyways—", "That's crazy"], pi: 0 },
      { q: "In a horror movie you'd:", options: ["Die first", "Be the final survivor", "Be the killer", "Trip and fall immediately"], pi: 3 },
      { q: "Your toxic trait:", options: ["Main character syndrome", "Overthinking everything", "Laughing at the wrong time", "Saying 'we should hang' and never following up"], pi: 1 },
    ],
    '36questions': [
      { q: "Given the choice of anyone in the world, whom would you want as a dinner guest?", options: ["A childhood hero", "A historical figure", "Someone I've lost touch with", "A celebrity I admire"], pi: 1 },
      { q: "Would you like to be famous? In what way?", options: ["Yes — for my talent", "Yes — for making a difference", "Maybe — just a little known", "No — I prefer privacy"], pi: 1 },
      { q: "Before making a phone call, do you ever rehearse what you're going to say?", options: ["Every single time", "Only for important calls", "Rarely", "Never — I just wing it"], pi: 1 },
      { q: "What would constitute a perfect day for you?", options: ["Slow morning, no plans", "Adventure from dawn to dusk", "Quality time with people I love", "Creating something meaningful"], pi: 0 },
      { q: "When did you last sing to yourself? To someone else?", options: ["Today — I'm always singing", "This week, in the shower", "Can't remember honestly", "I hum, does that count?"], pi: 0 },
      { q: "If you could live to 90 and keep either the mind or body of a 30-year-old, which would you want?", options: ["The mind, 100%", "The body, no question", "Mind — my thoughts are me", "Body — I'd figure the rest out"], pi: 0 },
    ],
    fungames: [
      { q: "Would you rather have unlimited pizza or unlimited sushi for life?", options: ["Pizza forever", "Sushi no doubt", "Depends on my mood", "Can't choose, I'd cry"], pi: 0 },
      { q: "You can only listen to one genre forever:", options: ["Pop", "Hip-hop", "Throwback classics", "Lo-fi / chill"], pi: 2 },
      { q: "Truth or dare?", options: ["Truth — always", "Dare — I live dangerously", "Depends who's asking", "Neither, I'm watching"], pi: 1 },
      { q: "You're on a deserted island. One item:", options: ["Phone (no signal lol)", "Unlimited snacks", "A knife", "A good book"], pi: 1 },
      { q: "Worst superpower to have:", options: ["Reading minds 24/7", "Invisibility but always cold", "Flying but only 2 feet high", "Super speed but you trip a lot"], pi: 2 },
      { q: "You switch lives with someone for a day:", options: ["A celebrity", "Your pet", "Your boss", "Your younger self"], pi: 3 },
      { q: "Most embarrassing thing you'd do for $1 million:", options: ["Sing karaoke sober", "Text your ex 'I miss you'", "Wear a costume to work", "Post your search history"], pi: 0 },
      { q: "Your dream game show:", options: ["Survivor", "The Floor Is Lava", "Love Island", "Are You Smarter Than a 5th Grader"], pi: 0 },
      { q: "Two truths and a lie — which do people guess wrong?", options: ["The wild one", "The boring one", "They always guess right", "I'm a terrible liar"], pi: 1 },
      { q: "You're hosting a dinner party. Vibe check:", options: ["Fancy dress, wine, jazz", "Casual, pizza, board games", "Potluck chaos", "Just us, takeout, real talk"], pi: 3 },
    ],
    worldtaste: [
      { q: "Dream travel destination:", options: ["Tokyo, Japan", "Marrakech, Morocco", "Santorini, Greece", "Medellín, Colombia"], pi: 0 },
      { q: "Best street food in the world:", options: ["Tacos from Mexico", "Pad Thai from Thailand", "Kebab from Turkey", "Dumplings from China"], pi: 1 },
      { q: "A tradition you'd adopt from another culture:", options: ["Siesta (Spain)", "Hygge (Denmark)", "Hanami (Japan)", "Fika (Sweden)"], pi: 2 },
      { q: "Language you'd love to speak fluently:", options: ["Japanese", "French", "Arabic", "Korean"], pi: 0 },
      { q: "Pick a world festival to attend:", options: ["Carnival (Brazil)", "Holi (India)", "Día de los Muertos (Mexico)", "Lantern Festival (Thailand)"], pi: 1 },
      { q: "Best comfort drink worldwide:", options: ["Chai (India)", "Matcha (Japan)", "Turkish coffee", "Horchata (Mexico)"], pi: 2 },
      { q: "Music that moves your soul:", options: ["Afrobeats", "K-Pop", "Latin reggaeton", "Arabic oud music"], pi: 0 },
      { q: "Cultural value you respect most:", options: ["Hospitality (Middle East)", "Respect for elders (Asia)", "Community spirit (Africa)", "Work-life balance (Nordic)"], pi: 3 },
      { q: "If you lived abroad for a year:", options: ["Italy — food and vibes", "South Korea — culture wave", "Brazil — energy and warmth", "New Zealand — nature and peace"], pi: 0 },
      { q: "Best dessert tradition:", options: ["French pastries", "Turkish baklava", "Japanese mochi", "Indian gulab jamun"], pi: 1 },
    ],
    ethics: [
      { q: "You find a wallet with $500 and an ID. You:", options: ["Return it all", "Keep the cash, return wallet", "Try to find the owner", "Depends how broke I am"], pi: 0 },
      { q: "Is it ever okay to lie to protect someone?", options: ["Yes, always", "Only in extreme cases", "Never — truth matters", "Depends on what you're protecting"], pi: 3 },
      { q: "A friend cheats on their partner. You:", options: ["Tell the partner", "Mind my own business", "Confront the friend first", "It's complicated"], pi: 2 },
      { q: "Would you report a coworker for stealing small things?", options: ["Yes, rules are rules", "No, it's not my problem", "Talk to them first", "Depends what they're taking"], pi: 2 },
      { q: "Is cancel culture justified?", options: ["Yes — accountability matters", "Sometimes, not always", "No — people deserve second chances", "It's more complex than that"], pi: 3 },
      { q: "You can save 5 strangers or 1 person you love:", options: ["5 strangers", "1 person I love", "I can't choose", "Refuse the scenario entirely"], pi: 1 },
      { q: "Privacy vs. security — what wins?", options: ["Privacy always", "Security always", "A balance of both", "Depends on the situation"], pi: 2 },
      { q: "Is it okay to ghost someone after one bad date?", options: ["Yes, no obligation", "At least send a text", "Never, be respectful", "Depends how bad it was"], pi: 1 },
      { q: "Rich people should be taxed more:", options: ["100% agree", "Somewhat agree", "Disagree", "It's not that simple"], pi: 3 },
      { q: "Your best friend asks you to lie for them:", options: ["I'd do it, no question", "Depends on the lie", "Never — can't compromise my integrity", "I'd find a workaround"], pi: 3 },
    ],
    situations: [
      { q: "Your reaction when the food arrives: 🍕", options: ["😍 pure joy", "📸 photo first", "🤤 already eating", "😐 it looks different from the menu"], pi: 0 },
      { q: "Group chat is blowing up at 3am:", options: ["😴 muted since day one", "👀 reading everything", "🔥 adding fuel", "😤 who are these people"], pi: 1 },
      { q: "You accidentally like a 3-year-old photo:", options: ["😱 panic unlike", "💀 my social life is over", "🤷 own it", "😂 laugh and move on"], pi: 0 },
      { q: "Someone says 'we need to talk':", options: ["😰 instant anxiety", "🙄 here we go", "🧘 I'm calm", "🏃 time to run"], pi: 0 },
      { q: "You see your ex in public:", options: ["👻 become invisible", "😎 act unbothered", "👋 say hi like a normal person", "📱 pretend to be on the phone"], pi: 3 },
      { q: "Plot twist in the movie you're watching:", options: ["😮 jaw dropped", "🤓 called it", "😭 emotional wreck", "😴 wait what happened"], pi: 0 },
      { q: "Your best friend cancels plans last minute:", options: ["😤 never forgiving this", "😌 lowkey relieved", "🥺 sad but understanding", "📱 already rescheduling"], pi: 1 },
      { q: "WiFi goes down during an important moment:", options: ["🤯 existential crisis", "📖 guess I'll read", "🕯️ candle time, it's a vibe", "😡 calling the provider NOW"], pi: 0 },
      { q: "Someone gives you a compliment:", options: ["😊 melting inside", "🤨 what do they want", "😅 awkward deflect", "💅 I know"], pi: 0 },
      { q: "Monday morning energy:", options: ["☕ don't talk to me yet", "🏃 let's get this bread", "😩 already counting to Friday", "🎵 vibing, surprisingly"], pi: 0 },
    ],
    livingtogether: [
      { q: "Who's cooking tonight?", options: ["I'll cook", "You cook, I clean", "Let's order in", "Whoever's less tired"], pi: 3 },
      { q: "The thermostat debate:", options: ["Always cold, blanket person", "Always hot, window open", "We compromise somehow", "Whoever touches it last wins"], pi: 2 },
      { q: "Ideal sleeping arrangement:", options: ["Same bed, cuddling", "Same bed, separate blankets", "Same room, separate beds", "I need my own space sometimes"], pi: 1 },
      { q: "How do you handle chores?", options: ["Strict schedule", "Whoever sees it does it", "Trade off week by week", "Argue about it every time"], pi: 1 },
      { q: "Groceries philosophy:", options: ["Meal plan and list", "Wander the aisles", "Online delivery only", "Buy snacks, figure out meals later"], pi: 3 },
      { q: "The bathroom situation:", options: ["I need at least 45 minutes", "In and out, 10 minutes", "We can share, it's fine", "Do not talk to me in there"], pi: 3 },
      { q: "TV remote control:", options: ["I choose, you agree", "We take turns", "Scroll for 30 min, watch nothing", "Separate screens honestly"], pi: 2 },
      { q: "When guests come over:", options: ["Deep clean everything", "Quick tidy is fine", "Our home, our mess", "I need 3 days notice minimum"], pi: 3 },
      { q: "Morning routine compatibility:", options: ["We wake up together", "One of us is a zombie", "Completely different schedules", "Silent coexistence until coffee"], pi: 3 },
      { q: "Money talk in the household:", options: ["Split everything 50/50", "One account, shared everything", "Each pays their strengths", "We don't talk about it enough"], pi: 0 },
    ],
    soulspirit: [
      { q: "Do you believe in something bigger than us?", options: ["Yes, deeply", "I'm spiritual, not religious", "I'm not sure yet", "No, I trust science"], pi: 1 },
      { q: "Where do you find peace?", options: ["Nature", "Prayer or meditation", "Music", "Being with loved ones"], pi: 0 },
      { q: "Fate vs. free will:", options: ["Everything happens for a reason", "We create our own path", "A mix of both", "I go back and forth honestly"], pi: 2 },
      { q: "What happens after we die?", options: ["Something beautiful", "Nothing — and that's okay", "I prefer not to think about it", "Reincarnation maybe?"], pi: 0 },
      { q: "A ritual or practice that grounds you:", options: ["Journaling", "Prayer", "Meditation or breathwork", "Long walks alone"], pi: 2 },
      { q: "Can people truly change?", options: ["Yes, with real effort", "Only if they want to", "Core personality stays the same", "I've seen it happen"], pi: 1 },
      { q: "Forgiveness — easy or hard for you?", options: ["I forgive quickly", "Takes time but I get there", "I forgive but never forget", "Depends on what they did"], pi: 3 },
      { q: "Your relationship with gratitude:", options: ["I practice it daily", "I try but forget", "I feel it but don't express it", "Working on it"], pi: 0 },
      { q: "What gives life meaning?", options: ["Love and relationships", "Purpose and contribution", "Experiences and growth", "I'm still figuring it out"], pi: 2 },
      { q: "Respect for different beliefs:", options: ["I respect all paths", "I'm curious about others", "I stick to my own", "Beliefs shape who we are"], pi: 0 },
    ],
  },
  tr: {
    couples: [
      { q: "Karşındaki kişide ilk fark ettiğin şey neydi?", options: ["Gülümsemesi", "Enerjisi", "Tarzı", "Espri anlayışı"], pi: 1 },
      { q: "İkinizin bir şarkısı olsa türü ne olurdu?", options: ["R&B / Soul", "Pop", "Indie", "Lo-fi"], pi: 2 },
      { q: "Onda gizlice en çok neye hayransın?", options: ["Özgüveni", "Nezaketi", "Yaratıcılığı", "Dayanıklılığı"], pi: 1 },
      { q: "İdeal buluşma vibes'ını seç:", options: ["Çatıda gün batımı", "Gece araba turu", "Film gecesi", "Spontane macera"], pi: 1 },
      { q: "Bağınızı tek kelimeyle tanımlayın:", options: ["Kaotik", "Elektrik", "Huzur", "Eşsiz"], pi: 1 },
    ],
    bestfriends: [
      { q: "Vazgeçemediğin comfort food nedir?", options: ["Pizza", "Ramen", "Taco", "Dondurma"], pi: 1 },
      { q: "Hafta sonu planı seç:", options: ["Brunch + vintage alışveriş", "Netflix maratonu", "Yolculuk", "Hiçbir şey yapma"], pi: 2 },
      { q: "Bir arkadaşta en iyi özellik nedir?", options: ["Sadakat", "Espri", "Dürüstlük", "Spontanlık"], pi: 1 },
      { q: "Arkadaşlık marşınızın türü:", options: ["Pop hit'leri", "Nostalji şarkıları", "Indie", "Hip-hop"], pi: 1 },
      { q: "Birbirinizi nasıl neşelendirirsiniz?", options: ["Meme'ler", "Yemek siparişi", "Habersiz gelme", "Uzun sesli mesajlar"], pi: 0 },
    ],
    deeptalk: [
      { q: "Hayatta senin için en önemli olan ne?", options: ["Özgürlük", "Bağlantı", "Gelişim", "Güvenlik"], pi: 1 },
      { q: "En büyük korkun:", options: ["Unutulmak", "Yalnız kalmak", "Zaman kaybetmek", "Kendimi kaybetmek"], pi: 2 },
      { q: "Sence sevgi nasıl görünür?", options: ["Küçük günlük jestler", "Büyük sürprizler", "Sadece orada olmak", "Sevgi dolu sözler"], pi: 0 },
      { q: "Dünyada bir şeyi değiştirebilsen:", options: ["Daha çok empati", "Daha çok dürüstlük", "Daha çok eşitlik", "Daha çok merak"], pi: 0 },
      { q: "Duygusal süper gücün ne?", options: ["Ortamı okumak", "Sakin kalmak", "İnsanları güldürmek", "Derin dinleme"], pi: 3 },
    ],
    coworkers: [
      { q: "Sabahçı mısın gececi mi?", options: ["6'da kalkarım", "Kesinlikle gececi", "Güne bağlı", "Sürekli yorgun"], pi: 3 },
      { q: "İdeal çalışma ortamı:", options: ["Kafe", "Ev ofisi", "Açık ofis", "Kütüphane sessizliği"], pi: 1 },
      { q: "Toplantı tarzın:", options: ["Kamera açık, ilgili", "Kamera kapalı, multitask", "Bu e-posta olabilirdi", "Beyaz tahta sevdalısı"], pi: 2 },
      { q: "Mesaj tarzın:", options: ["Tek uzun paragraf", "20 kısa mesaj", "Sesli mesaj", "Sadece emoji"], pi: 3 },
      { q: "Öğle arası tercihin:", options: ["Masada yemek", "Dışarıda yürüyüş", "Grup yemeği", "Kısa uyku"], pi: 1 },
    ],
    hottakes: [
      { q: "Pizzaya ananas?", options: ["Efsane", "Kesinlikle hayır", "Ruh haline bağlı", "Hiç denemedim"], pi: 0 },
      { q: "Üst üste mesaj atmak:", options: ["Cesur ve ikonik", "Çaresizlik", "Gayet normal", "Kime attığına bağlı"], pi: 2 },
      { q: "Toplum içinde ağlamak:", options: ["Güçlü", "Utanç verici", "Ağlamaya bağlı", "Bugün yaptım zaten"], pi: 0 },
      { q: "En iyi müzik dönemi:", options: ["Şu an", "2000'ler nostaljisi", "90'lar sonsuza dek", "70/80'ler klasikleri"], pi: 1 },
      { q: "Astroloji:", options: ["Ürkütücü derecede doğru", "Eğlenceli ama sahte", "Tamamen saçmalık", "Burcumu bilmiyorum"], pi: 1 },
      { q: "Belirsiz ilişkiler:", options: ["En kötü icat", "Bi yere kadar ok", "Sadece takılmak", "Red flag fabrikası"], pi: 1 },
      { q: "Cevap süresi önemli mi?", options: ["Evet kesinlikle", "Yok ben de unuturum", "Sadece başlarda", "Önemsiyorsan yazarsın"], pi: 3 },
      { q: "Ick gerçek mi?", options: ["Gerçek ve geçerli", "Çok abartılıyor", "Sadece bir bahane", "Ben ick'in ta kendisiyim"], pi: 0 },
      { q: "Yapay zeka ele geçiriyor:", options: ["Çoktan oldu", "Biraz korkuyorum", "Gelsin", "Hoş geldin diyorum"], pi: 1 },
      { q: "Birini ghostlamak:", options: ["Bazen gerekli", "Her zaman yanlış", "Duruma bağlı", "Ghost olan bendim"], pi: 2 },
    ],
    redflags: [
      { q: "3 gün sonra cevap yazıyor:", options: ["Red flag", "Belki meşguldür", "Ben de yaparım", "Mesaja bağlı"], pi: 0 },
      { q: "Köpekleri sevmiyor:", options: ["Anında biter", "Kediler > köpekler zaten", "Herkesin olayı değil", "Şüpheli ama tamam"], pi: 3 },
      { q: "Her şeyi sosyal medyaya atıyor:", options: ["Özgüvene bak", "Büyük red flag", "Ben de varım yeter", "Ben de aynısını yaparım"], pi: 1 },
      { q: "Eski sevgilisiyle hâlâ arkadaş:", options: ["Olgun hamle", "Kesinlikle olmaz", "Duruma göre", "Daha fazla bilgi lazım"], pi: 2 },
      { q: "Gevreği suyla yiyor:", options: ["Polisi ara", "Gidiyorum", "Merakı saygıyla karşılarım", "Görmedim bile"], pi: 0 },
      { q: "Hiç plan yapmıyor:", options: ["Red flag", "Belki utangaçtır", "Plancı zaten benim", "Hiç buluşamayız"], pi: 0 },
      { q: "Hiç sosyal medyası yok:", options: ["Green flag aslında", "Ne saklıyor", "Gizemli vibes", "Ben de öyle"], pi: 0 },
      { q: "Film izlerken uyuyor:", options: ["Tatlı", "Saygısızlık", "Film sıkıcıysa tamam", "Dramatik uyandır"], pi: 0 },
      { q: "Restoranda senin yerine sipariş veriyor:", options: ["Romantik", "Kontrol manyağı", "Beni tanıyorsa tamam", "Cesur hamle"], pi: 2 },
      { q: "'İyiyim' diyor ama değil:", options: ["Derinleşirim", "Alan bırakırım", "Ben de yaparım aynısını", "Hep yapıyorsa red flag"], pi: 0 },
    ],
    chaotic: [
      { q: "Yangında son alacağın şey:", options: ["Şarj aleti", "Atıştırmalık", "Onurum", "Öylece dururdum"], pi: 2 },
      { q: "Sürekli düşündüğün şey:", options: ["O utanç verici anı", "Karşılıksız aşk", "Alternatif evrenler", "Dinozorlar cidden"], pi: 0 },
      { q: "Kötü karakter olsan silahın:", options: ["Pasif agresif mesajlar", "Silah olarak sessizlik", "Kaotik playlist", "Dizi finalini spoylama"], pi: 3 },
      { q: "Gerçek hayatta kalma becerin:", options: ["Her yerde uyuyabilirim", "Şüpheli yemek yeme", "Paralel park", "İstediğimde ağlarım"], pi: 0 },
      { q: "Sahte iş unvanı seç:", options: ["Baş Overthinker", "Profesyonel Geveze", "Vibe Danışmanı", "Uyku Mimarı"], pi: 1 },
      { q: "FBI ajanın seni nasıl görüyor:", options: ["Çılgın", "Sıkıcı açıkçası", "Endişe verici", "En sevdiği görev"], pi: 3 },
      { q: "Gece 3 düşüncesi:", options: ["Ya yerçekimi durursa", "Eski sevgilime yazmalıyım", "Gerçek miyim", "Peynir lazım"], pi: 3 },
      { q: "Ağız alışkanlığın:", options: ["Olan olmuş", "Kafamda sıfır düşünce", "Neyse—", "Çıldırıyorum"], pi: 0 },
      { q: "Korku filminde sen:", options: ["İlk ölen", "Son hayatta kalan", "Katil", "Hemen düşüp yere seren"], pi: 3 },
      { q: "Toksik özelliğin:", options: ["Ana karakter sendromu", "Her şeyi aşırı düşünmek", "Yanlış anda gülmek", "'Buluşalım' deyip hiç buluşmamak"], pi: 1 },
    ],
    '36questions': [
      { q: "Dünyadaki herhangi biriyle akşam yemeği yiyebilsen, kim olurdu?", options: ["Çocukluk kahramanım", "Tarihi bir figür", "İletişimi kopan biri", "Hayran olduğum bir ünlü"], pi: 1 },
      { q: "Ünlü olmak ister misin? Nasıl?", options: ["Evet — yeteneğimle", "Evet — fark yaratarak", "Belki — biraz tanınan", "Hayır — gizliliği tercih ederim"], pi: 1 },
      { q: "Telefon etmeden önce ne söyleyeceğini prova eder misin?", options: ["Her seferinde", "Sadece önemli aramalarda", "Nadiren", "Asla — doğaçlama yaparım"], pi: 1 },
      { q: "Mükemmel bir gün senin için nasıl olurdu?", options: ["Yavaş sabah, plan yok", "Şafaktan akşama macera", "Sevdiklerimle vakit", "Anlamlı bir şey yaratmak"], pi: 0 },
      { q: "En son ne zaman kendi kendine şarkı söyledin?", options: ["Bugün — hep söylerim", "Bu hafta, duşta", "Hatırlamıyorum", "Mırıldanırım, sayılır mı?"], pi: 0 },
      { q: "90 yaşına kadar yaşayıp 30 yaşındaki aklını mı bedenini mi korumak istersin?", options: ["Aklımı, kesinlikle", "Bedenimi, tartışmasız", "Aklımı — düşüncelerim benim", "Bedenimi — gerisini hallederim"], pi: 0 },
    ],
    fungames: [
      { q: "Ömür boyu sınırsız pizza mı sushi mi?", options: ["Pizza sonsuza dek", "Sushi şüphesiz", "Ruh halime bağlı", "Seçemem, ağlarım"], pi: 0 },
      { q: "Sonsuza dek tek müzik türü:", options: ["Pop", "Hip-hop", "Nostalji klasikleri", "Lo-fi / chill"], pi: 2 },
      { q: "Doğruluk mu cesaret mi?", options: ["Doğruluk — her zaman", "Cesaret — tehlikeli yaşarım", "Kimin sorduğuna bağlı", "İkisi de değil, izliyorum"], pi: 1 },
      { q: "Issız adada tek bir eşya:", options: ["Telefon (sinyal yok lol)", "Sınırsız atıştırmalık", "Bir bıçak", "İyi bir kitap"], pi: 1 },
      { q: "En kötü süper güç:", options: ["7/24 zihin okuma", "Görünmezlik ama hep üşüyorsun", "Uçmak ama 60 cm yükseklikte", "Süper hız ama hep tökezliyorsun"], pi: 2 },
      { q: "Bir günlüğüne biriyle hayat değiştir:", options: ["Bir ünlü", "Evcil hayvanın", "Patronun", "Küçüklükteki sen"], pi: 3 },
      { q: "1 milyon TL için en utanç verici şey:", options: ["Ayık karaoke yapmak", "Eski sevgiliye 'özledim' yazmak", "İşe kostümle gitmek", "Arama geçmişini paylaşmak"], pi: 0 },
      { q: "Rüya yarışma programın:", options: ["Survivor", "Yer Lav Oldu", "Love Island", "Kim 500 Milyar İster"], pi: 0 },
      { q: "İki doğru bir yalan — hangisini yanlış tahmin ederler?", options: ["Çılgın olanı", "Sıkıcı olanı", "Hep doğru tahmin ederler", "Berbat yalancıyım"], pi: 1 },
      { q: "Akşam yemeği partisi veriyorsun. Ortam:", options: ["Şık, şarap, caz", "Rahat, pizza, masa oyunları", "Potluck kaos", "Sadece biz, paket servis, derin sohbet"], pi: 3 },
    ],
    worldtaste: [
      { q: "Hayalindeki seyahat noktası:", options: ["Tokyo, Japonya", "Marakeş, Fas", "Santorini, Yunanistan", "Medellín, Kolombiya"], pi: 0 },
      { q: "Dünyanın en iyi sokak yemeği:", options: ["Meksika takosu", "Tayland pad thai", "Türk kebabı", "Çin mantısı"], pi: 1 },
      { q: "Başka kültürden benimseyeceğin gelenek:", options: ["Siesta (İspanya)", "Hygge (Danimarka)", "Hanami (Japonya)", "Fika (İsveç)"], pi: 2 },
      { q: "Akıcı konuşmak istediğin dil:", options: ["Japonca", "Fransızca", "Arapça", "Korece"], pi: 0 },
      { q: "Gitmek istediğin dünya festivali:", options: ["Karnaval (Brezilya)", "Holi (Hindistan)", "Ölüler Günü (Meksika)", "Fener Festivali (Tayland)"], pi: 1 },
      { q: "Dünyanın en iyi rahatlatıcı içeceği:", options: ["Chai (Hindistan)", "Matcha (Japonya)", "Türk kahvesi", "Horchata (Meksika)"], pi: 2 },
      { q: "Ruhunu hareketlendiren müzik:", options: ["Afrobeats", "K-Pop", "Latin reggaeton", "Arap ud müziği"], pi: 0 },
      { q: "En çok saygı duyduğun kültürel değer:", options: ["Misafirperverlik (Ortadoğu)", "Büyüklere saygı (Asya)", "Topluluk ruhu (Afrika)", "İş-yaşam dengesi (İskandinav)"], pi: 3 },
      { q: "Bir yıl yurt dışında yaşasan:", options: ["İtalya — yemek ve hava", "Güney Kore — kültür dalgası", "Brezilya — enerji ve sıcaklık", "Yeni Zelanda — doğa ve huzur"], pi: 0 },
      { q: "En iyi tatlı geleneği:", options: ["Fransız pastaneleri", "Türk baklavası", "Japon mochisi", "Hint gulab jamunu"], pi: 1 },
    ],
    ethics: [
      { q: "İçinde 500 dolar ve kimlik olan bir cüzdan buldun:", options: ["Hepsini iade ederim", "Parayı alır, cüzdanı iade ederim", "Sahibini bulmaya çalışırım", "Ne kadar parasız olduğuma bağlı"], pi: 0 },
      { q: "Birini korumak için yalan söylemek doğru mu?", options: ["Evet, her zaman", "Sadece aşırı durumlarda", "Asla — doğruluk önemli", "Neyi koruduğuna bağlı"], pi: 3 },
      { q: "Arkadaşın partnerini aldatıyor:", options: ["Partnere söylerim", "Kendi işime bakarım", "Önce arkadaşımla konuşurum", "Karmaşık bir durum"], pi: 2 },
      { q: "İş arkadaşın küçük şeyler çalıyor, ihbar eder misin?", options: ["Evet, kurallar kural", "Hayır, beni ilgilendirmez", "Önce onunla konuşurum", "Ne çaldığına bağlı"], pi: 2 },
      { q: "İptal kültürü haklı mı?", options: ["Evet — hesap verebilirlik önemli", "Bazen, her zaman değil", "Hayır — herkes ikinci şansı hak eder", "Daha karmaşık bir konu"], pi: 3 },
      { q: "5 yabancıyı mı 1 sevdiğini mi kurtarırsın?", options: ["5 yabancı", "1 sevdiğim kişi", "Seçemem", "Senaryoyu tamamen reddederim"], pi: 1 },
      { q: "Gizlilik mi güvenlik mi?", options: ["Her zaman gizlilik", "Her zaman güvenlik", "İkisinin dengesi", "Duruma bağlı"], pi: 2 },
      { q: "Kötü bir buluşmadan sonra ghostlamak doğru mu?", options: ["Evet, zorunluluk yok", "En azından mesaj at", "Asla, saygılı ol", "Ne kadar kötü olduğuna bağlı"], pi: 1 },
      { q: "Zenginler daha çok vergilendirilmeli:", options: ["Kesinlikle katılıyorum", "Kısmen katılıyorum", "Katılmıyorum", "O kadar basit değil"], pi: 3 },
      { q: "En yakın arkadaşın senin yerine yalan söylemeni istiyor:", options: ["Yaparım, sorgusuz", "Yalana bağlı", "Asla — dürüstlüğümden ödün vermem", "Bir çözüm yolu bulurum"], pi: 3 },
    ],
    situations: [
      { q: "Yemek geldiğinde tepkin: 🍕", options: ["😍 saf mutluluk", "📸 önce fotoğraf", "🤤 çoktan yiyorum", "😐 menüden farklı görünüyor"], pi: 0 },
      { q: "Grup sohbeti gece 3'te çılgınca yazıyor:", options: ["😴 ilk günden sessize aldım", "👀 her şeyi okuyorum", "🔥 ateşe odun atıyorum", "😤 bu insanlar kim"], pi: 1 },
      { q: "3 yıllık bir fotoğrafı yanlışlıkla beğendin:", options: ["😱 panik beğeniyi geri al", "💀 sosyal hayatım bitti", "🤷 sahiplen", "😂 gül geç"], pi: 0 },
      { q: "Biri 'konuşmamız lazım' diyor:", options: ["😰 anında kaygı", "🙄 yine mi", "🧘 sakinim", "🏃 kaçma zamanı"], pi: 0 },
      { q: "Eski sevgilini toplum içinde görüyorsun:", options: ["👻 görünmez ol", "😎 umursamaz davran", "👋 normal selamla", "📱 telefonda numarası yap"], pi: 3 },
      { q: "İzlediğin filmde plot twist:", options: ["😮 çene düştü", "🤓 biliyordum", "😭 duygusal enkaz", "😴 ne oldu şimdi"], pi: 0 },
      { q: "Yakın arkadaşın son dakika plan iptal ediyor:", options: ["😤 asla affetmem", "😌 gizliden rahatladım", "🥺 üzgün ama anlıyorum", "📱 zaten yeniden planlıyorum"], pi: 1 },
      { q: "Önemli anda WiFi gidiyor:", options: ["🤯 varoluşsal kriz", "📖 kitap okuruz artık", "🕯️ mum yak, vibe yap", "😡 hemen sağlayıcıyı arıyorum"], pi: 0 },
      { q: "Biri sana iltifat ediyor:", options: ["😊 içten içe eriyorum", "🤨 ne istiyorlar acaba", "😅 garip şekilde geçiştir", "💅 biliyorum"], pi: 0 },
      { q: "Pazartesi sabah enerjisi:", options: ["☕ henüz konuşma benimle", "🏃 haydi kazanalım", "😩 cumayı sayıyorum", "🎵 şaşırtıcı şekilde keyifli"], pi: 0 },
    ],
    livingtogether: [
      { q: "Bu akşam kim yemek yapıyor?", options: ["Ben yaparım", "Sen pişir, ben toplayım", "Sipariş verelim", "Hangimiz daha az yorgunsa"], pi: 3 },
      { q: "Termostat tartışması:", options: ["Hep üşürüm, battaniye insanıyım", "Hep sıcak, pencere açık", "Bir şekilde uzlaşırız", "Son dokunan kazanır"], pi: 2 },
      { q: "İdeal uyku düzeni:", options: ["Aynı yatak, sarılarak", "Aynı yatak, ayrı battaniye", "Aynı oda, ayrı yatak", "Bazen kendi alanım lazım"], pi: 1 },
      { q: "Ev işlerini nasıl hallediyorsun?", options: ["Sıkı program", "Gören yapar", "Haftalık sırayla", "Her seferinde tartışırız"], pi: 1 },
      { q: "Market alışverişi felsefesi:", options: ["Yemek planı ve liste", "Reyonlarda gezin", "Sadece online sipariş", "Atıştırmalık al, yemeği sonra düşün"], pi: 3 },
      { q: "Banyo durumu:", options: ["En az 45 dakika lazım", "Gir çık, 10 dakika", "Paylaşabiliriz, sorun yok", "Orada benimle konuşma"], pi: 3 },
      { q: "TV kumanda kontrolü:", options: ["Ben seçerim, sen kabul et", "Sırayla", "30 dk gezin, hiçbir şey izleme", "Ayrı ekranlar dürüst olmak gerekirse"], pi: 2 },
      { q: "Misafir geldiğinde:", options: ["Her yeri derinlemesine temizle", "Hızlı toparlama yeter", "Evimiz, dağınıklığımız", "En az 3 gün önceden haber lazım"], pi: 3 },
      { q: "Sabah rutini uyumu:", options: ["Birlikte uyanırız", "Birimiz zombi", "Tamamen farklı saatler", "Kahveye kadar sessiz birlikte var olma"], pi: 3 },
      { q: "Evde para konuşması:", options: ["Her şeyi yarı yarıya böl", "Tek hesap, her şey ortak", "Herkes güçlü olduğu yeri öder", "Bu konuyu yeterince konuşmuyoruz"], pi: 0 },
    ],
    soulspirit: [
      { q: "Bizden büyük bir şeye inanıyor musun?", options: ["Evet, derinden", "Manevi biriyim, dindar değil", "Henüz emin değilim", "Hayır, bilime güvenirim"], pi: 1 },
      { q: "Huzuru nerede buluyorsun?", options: ["Doğada", "Dua veya meditasyonda", "Müzikte", "Sevdiklerimle"], pi: 0 },
      { q: "Kader mi özgür irade mi?", options: ["Her şey bir nedenle olur", "Kendi yolumuzu biz yaratırız", "İkisinin karışımı", "Sürekli gidip geliyorum"], pi: 2 },
      { q: "Öldükten sonra ne oluyor?", options: ["Güzel bir şey", "Hiçbir şey — ve sorun yok", "Düşünmemeyi tercih ederim", "Belki reenkarnasyon?"], pi: 0 },
      { q: "Seni topraklayan bir ritüel:", options: ["Günlük tutmak", "Dua", "Meditasyon veya nefes çalışması", "Yalnız uzun yürüyüşler"], pi: 2 },
      { q: "İnsanlar gerçekten değişebilir mi?", options: ["Evet, gerçek çabayla", "Sadece isterlerse", "Temel kişilik aynı kalır", "Olduğunu gördüm"], pi: 1 },
      { q: "Affetmek — senin için kolay mı zor mu?", options: ["Hızlı affederim", "Zaman alır ama oraya varırım", "Affederim ama unutmam", "Ne yaptıklarına bağlı"], pi: 3 },
      { q: "Şükranla ilişkin:", options: ["Her gün pratik yaparım", "Denerim ama unuturum", "Hissederim ama ifade etmem", "Üzerinde çalışıyorum"], pi: 0 },
      { q: "Hayata anlam veren ne?", options: ["Sevgi ve ilişkiler", "Amaç ve katkı", "Deneyimler ve gelişim", "Hâlâ çözmeye çalışıyorum"], pi: 2 },
      { q: "Farklı inançlara saygı:", options: ["Tüm yollara saygı duyarım", "Diğerlerine meraklıyım", "Kendiminkine bağlıyım", "İnançlar bizi şekillendirir"], pi: 0 },
    ],
  },
  es: {
    couples: [
      { q: "¿Qué fue lo primero que notaste de la otra persona?", options: ["Su sonrisa", "Su energía", "Su estilo", "Su humor"], pi: 1 },
      { q: "Si tuvieran una canción juntos, ¿qué género sería?", options: ["R&B / Soul", "Pop", "Indie", "Lo-fi beats"], pi: 2 },
      { q: "¿Qué admiras secretamente más de ellos?", options: ["Su confianza", "Su amabilidad", "Su creatividad", "Su resiliencia"], pi: 1 },
      { q: "Elige un vibe para tu cita ideal:", options: ["Atardecer en azotea", "Paseo nocturno", "Noche de cine", "Aventura espontánea"], pi: 1 },
      { q: "Una palabra para describir su conexión:", options: ["Caótica", "Eléctrica", "Cómoda", "Inigualable"], pi: 1 },
    ],
    bestfriends: [
      { q: "¿Tu comfort food favorita?", options: ["Pizza", "Ramen", "Tacos", "Helado"], pi: 1 },
      { q: "Elige un plan de fin de semana:", options: ["Brunch + tiendas", "Maratón de Netflix", "Viaje por carretera", "No hacer nada"], pi: 2 },
      { q: "¿La mejor cualidad en un amigo?", options: ["Lealtad", "Humor", "Honestidad", "Espontaneidad"], pi: 1 },
      { q: "Género del himno de su amistad:", options: ["Pop bailable", "Éxitos retro", "Indie vibes", "Hip-hop"], pi: 1 },
      { q: "¿Cómo se animan mutuamente?", options: ["Memes", "Delivery de comida", "Aparecer sin avisar", "Notas de voz largas"], pi: 0 },
    ],
    deeptalk: [
      { q: "¿Qué es lo más importante para ti en la vida?", options: ["Libertad", "Conexión", "Crecimiento", "Seguridad"], pi: 1 },
      { q: "Tu mayor miedo:", options: ["Ser olvidado", "Estar solo", "Perder el tiempo", "Perderme a mí mismo"], pi: 2 },
      { q: "¿Cómo se ve el amor para ti?", options: ["Pequeños actos diarios", "Grandes gestos", "Solo estar ahí", "Palabras de afirmación"], pi: 0 },
      { q: "Si pudieras cambiar una cosa del mundo:", options: ["Más empatía", "Más honestidad", "Más igualdad", "Más curiosidad"], pi: 0 },
      { q: "¿Cuál es tu superpoder emocional?", options: ["Leer el ambiente", "Mantener la calma", "Hacer reír", "Escuchar profundo"], pi: 3 },
    ],
    coworkers: [
      { q: "¿Madrugador o noctámbulo?", options: ["Levantado a las 6am", "Noctámbulo 100%", "Depende del día", "Permanentemente cansado"], pi: 3 },
      { q: "Setup de trabajo ideal:", options: ["Cafetería", "Home office", "Planta abierta", "Silencio de biblioteca"], pi: 1 },
      { q: "Tu estilo en reuniones:", options: ["Cámara encendida", "Cámara apagada, multitask", "Esto podía ser un email", "Me encanta la pizarra"], pi: 2 },
      { q: "Estilo de mensajes:", options: ["Un párrafo largo", "20 mensajes cortos", "Nota de voz", "Solo emojis"], pi: 3 },
      { q: "En la hora de almuerzo:", options: ["Como en el escritorio", "Caminar afuera", "Almuerzo grupal", "Siesta rápida"], pi: 1 },
    ],
    hottakes: [
      { q: "¿Piña en la pizza?", options: ["De lo mejor", "Jamás", "Depende del mood", "Nunca la probé"], pi: 0 },
      { q: "Enviar doble mensaje es:", options: ["Valiente e icónico", "Grito de ayuda", "Totalmente normal", "Depende de quién"], pi: 2 },
      { q: "Llorar en público:", options: ["Poderoso", "Mortificante", "Depende del llanto", "Lo hice hoy"], pi: 0 },
      { q: "La mejor era musical:", options: ["Ahora mismo", "Nostalgia 2000s", "Los 90s forever", "Clásicos 70s/80s"], pi: 1 },
      { q: "La astrología es:", options: ["Terroríficamente precisa", "Divertida pero falsa", "Total tontería", "No sé mi signo"], pi: 1 },
      { q: "Los situationships son:", options: ["El peor invento", "Algo válido", "Solo vibing", "Fábrica de red flags"], pi: 1 },
      { q: "¿Importa el tiempo de respuesta?", options: ["Sí 100%", "Nah yo también olvido", "Solo al principio", "Si te importa respondes"], pi: 3 },
      { q: "El ick es:", options: ["Real y válido", "Muy sobreusado", "Solo una excusa", "Yo soy el ick"], pi: 0 },
      { q: "La IA tomando el control:", options: ["Ya pasó", "Me asusta un poco", "Que venga", "Les doy la bienvenida"], pi: 1 },
      { q: "Ghostear a alguien:", options: ["A veces necesario", "Siempre mal", "Depende del contexto", "Yo fui el ghost"], pi: 2 },
    ],
    redflags: [
      { q: "Tarda 3 días en responder:", options: ["Red flag", "Quizás está ocupado", "Yo hago lo mismo", "Depende del mensaje"], pi: 0 },
      { q: "No le gustan los perros:", options: ["Dealbreaker", "Gatos > perros", "No es para todos", "Sospechoso pero ok"], pi: 3 },
      { q: "Publica todo en redes:", options: ["Amo la confianza", "Gran red flag", "Si salgo yo ok", "Yo hago lo mismo jaja"], pi: 1 },
      { q: "Sigue siendo amigo de su ex:", options: ["Madurez total", "Ni de broma", "Caso por caso", "Necesito más info"], pi: 2 },
      { q: "Come cereal con agua:", options: ["Llama a la policía", "Me voy", "Respeto la curiosidad", "Finjo que no vi"], pi: 0 },
      { q: "Nunca propone planes:", options: ["Red flag", "Quizás es tímido", "Yo planeo todo igual", "Nunca saldríamos"], pi: 0 },
      { q: "Cero redes sociales:", options: ["Green flag la verdad", "Qué esconde", "Vibes misteriosas", "Yo tampoco tengo"], pi: 0 },
      { q: "Se duerme viendo pelis:", options: ["Adorable", "Irrespetuoso", "Solo si es aburrida", "Despiértalo dramáticamente"], pi: 0 },
      { q: "Pide por ti en restaurantes:", options: ["Romántico", "Energía controladora", "Solo si me conoce", "Movimiento audaz"], pi: 2 },
      { q: "Dice 'estoy bien' pero no lo está:", options: ["Voy más profundo", "Le doy espacio", "Yo hago lo mismo", "Red flag si es siempre"], pi: 0 },
    ],
    chaotic: [
      { q: "Lo último que agarras en un incendio:", options: ["Cargador del cel", "Snacks", "Mi dignidad", "Me quedo parado"], pi: 2 },
      { q: "Tu Roman Empire:", options: ["Ese recuerdo vergonzoso", "Amor no correspondido", "Líneas de tiempo alternas", "Dinosaurios en serio"], pi: 0 },
      { q: "Eres villano. Tu arma:", options: ["Mensajes pasivo-agresivos", "Silencio como arma", "Playlists caóticas", "Spoilear finales"], pi: 3 },
      { q: "Habilidad de supervivencia real:", options: ["Dormir en cualquier lado", "Comer sobras dudosas", "Estacionar en paralelo", "Llorar cuando quiera"], pi: 0 },
      { q: "Elige un título falso:", options: ["Chief Overthinker", "Profesional del Chisme", "Consultor de Vibes", "Arquitecto de Siestas"], pi: 1 },
      { q: "Tu agente del FBI piensa que eres:", options: ["Desquiciado", "Aburrido la verdad", "Preocupante", "Su asignación favorita"], pi: 3 },
      { q: "Pensamiento de las 3am:", options: ["¿Y si la gravedad para?", "Debería textear a mi ex", "¿Soy real?", "Necesito queso"], pi: 3 },
      { q: "Tu muletilla:", options: ["Es lo que es", "Cero pensamientos", "En fin—", "Qué loco"], pi: 0 },
      { q: "En una peli de terror tú:", options: ["Muero primero", "Sobrevivo al final", "Soy el asesino", "Me tropiezo de inmediato"], pi: 3 },
      { q: "Tu rasgo tóxico:", options: ["Síndrome de protagonista", "Sobrepensar todo", "Reírme en mal momento", "Decir 'hay que vernos' y nunca hacerlo"], pi: 1 },
    ],
    '36questions': [
      { q: "Si pudieras elegir a cualquier persona del mundo, ¿a quién invitarías a cenar?", options: ["Un héroe de infancia", "Una figura histórica", "Alguien con quien perdí contacto", "Una celebridad que admiro"], pi: 1 },
      { q: "¿Te gustaría ser famoso? ¿De qué manera?", options: ["Sí — por mi talento", "Sí — por hacer la diferencia", "Quizás — un poco conocido", "No — prefiero la privacidad"], pi: 1 },
      { q: "¿Ensayas lo que vas a decir antes de llamar?", options: ["Siempre", "Solo para llamadas importantes", "Raramente", "Nunca — improviso"], pi: 1 },
      { q: "¿Cómo sería un día perfecto para ti?", options: ["Mañana lenta, sin planes", "Aventura de sol a sol", "Tiempo con los que amo", "Crear algo significativo"], pi: 0 },
      { q: "¿Cuándo fue la última vez que cantaste?", options: ["Hoy — siempre canto", "Esta semana, en la ducha", "No recuerdo", "Tarareo, ¿cuenta?"], pi: 0 },
      { q: "Si pudieras vivir hasta los 90, ¿conservarías la mente o el cuerpo de los 30?", options: ["La mente, 100%", "El cuerpo, sin duda", "La mente — mis pensamientos soy yo", "El cuerpo — el resto lo resuelvo"], pi: 0 },
    ],
    fungames: [
      { q: "¿Pizza ilimitada o sushi ilimitado de por vida?", options: ["Pizza para siempre", "Sushi sin duda", "Depende de mi humor", "No puedo elegir, lloraría"], pi: 0 },
      { q: "Solo puedes escuchar un género para siempre:", options: ["Pop", "Hip-hop", "Clásicos retro", "Lo-fi / chill"], pi: 2 },
      { q: "¿Verdad o reto?", options: ["Verdad — siempre", "Reto — vivo peligrosamente", "Depende quién pregunte", "Ninguno, estoy mirando"], pi: 1 },
      { q: "Estás en una isla desierta. Un objeto:", options: ["Teléfono (sin señal jaja)", "Snacks ilimitados", "Un cuchillo", "Un buen libro"], pi: 1 },
      { q: "Peor superpoder:", options: ["Leer mentes 24/7", "Invisibilidad pero siempre con frío", "Volar pero solo 60 cm", "Súper velocidad pero tropiezas mucho"], pi: 2 },
      { q: "Cambias vida con alguien por un día:", options: ["Una celebridad", "Tu mascota", "Tu jefe", "Tu yo del pasado"], pi: 3 },
      { q: "Lo más vergonzoso que harías por $1 millón:", options: ["Karaoke sobrio", "Textear a tu ex 'te extraño'", "Ir disfrazado al trabajo", "Publicar tu historial de búsqueda"], pi: 0 },
      { q: "Tu programa de concursos soñado:", options: ["Survivor", "El suelo es lava", "Love Island", "¿Eres más listo que un niño de 10?"], pi: 0 },
      { q: "Dos verdades y una mentira — ¿cuál adivinan mal?", options: ["La loca", "La aburrida", "Siempre aciertan", "Soy pésimo mintiendo"], pi: 1 },
      { q: "Organizas una cena. El vibe:", options: ["Elegante, vino, jazz", "Casual, pizza, juegos de mesa", "Potluck caótico", "Solo nosotros, delivery, charla real"], pi: 3 },
    ],
    worldtaste: [
      { q: "Destino de viaje soñado:", options: ["Tokio, Japón", "Marrakech, Marruecos", "Santorini, Grecia", "Medellín, Colombia"], pi: 0 },
      { q: "Mejor comida callejera del mundo:", options: ["Tacos de México", "Pad Thai de Tailandia", "Kebab de Turquía", "Dumplings de China"], pi: 1 },
      { q: "Tradición que adoptarías de otra cultura:", options: ["Siesta (España)", "Hygge (Dinamarca)", "Hanami (Japón)", "Fika (Suecia)"], pi: 2 },
      { q: "Idioma que te encantaría hablar:", options: ["Japonés", "Francés", "Árabe", "Coreano"], pi: 0 },
      { q: "Festival mundial al que irías:", options: ["Carnaval (Brasil)", "Holi (India)", "Día de los Muertos (México)", "Festival de Linternas (Tailandia)"], pi: 1 },
      { q: "Mejor bebida reconfortante del mundo:", options: ["Chai (India)", "Matcha (Japón)", "Café turco", "Horchata (México)"], pi: 2 },
      { q: "Música que mueve tu alma:", options: ["Afrobeats", "K-Pop", "Reggaetón latino", "Música de oud árabe"], pi: 0 },
      { q: "Valor cultural que más respetas:", options: ["Hospitalidad (Medio Oriente)", "Respeto a mayores (Asia)", "Espíritu comunitario (África)", "Equilibrio vida-trabajo (Nórdico)"], pi: 3 },
      { q: "Si vivieras un año en el extranjero:", options: ["Italia — comida y vibes", "Corea del Sur — ola cultural", "Brasil — energía y calidez", "Nueva Zelanda — naturaleza y paz"], pi: 0 },
      { q: "Mejor tradición de postres:", options: ["Pastelería francesa", "Baklava turco", "Mochi japonés", "Gulab jamun indio"], pi: 1 },
    ],
    ethics: [
      { q: "Encuentras una cartera con $500 y una ID:", options: ["Devuelvo todo", "Me quedo el dinero, devuelvo cartera", "Intento encontrar al dueño", "Depende de qué tan quebrado esté"], pi: 0 },
      { q: "¿Está bien mentir para proteger a alguien?", options: ["Sí, siempre", "Solo en casos extremos", "Nunca — la verdad importa", "Depende de qué proteges"], pi: 3 },
      { q: "Un amigo engaña a su pareja:", options: ["Le digo a la pareja", "No es mi asunto", "Confronto a mi amigo primero", "Es complicado"], pi: 2 },
      { q: "¿Reportarías a un compañero por robar cosas pequeñas?", options: ["Sí, las reglas son reglas", "No, no es mi problema", "Hablaría con ellos primero", "Depende de qué roben"], pi: 2 },
      { q: "¿La cultura de cancelación es justa?", options: ["Sí — la responsabilidad importa", "A veces, no siempre", "No — todos merecen segundas oportunidades", "Es más complejo que eso"], pi: 3 },
      { q: "Puedes salvar a 5 desconocidos o 1 persona que amas:", options: ["5 desconocidos", "1 persona que amo", "No puedo elegir", "Rechazo el escenario"], pi: 1 },
      { q: "Privacidad vs. seguridad — ¿qué gana?", options: ["Privacidad siempre", "Seguridad siempre", "Un balance de ambos", "Depende de la situación"], pi: 2 },
      { q: "¿Está bien ghostear después de una mala cita?", options: ["Sí, sin obligación", "Al menos envía un texto", "Nunca, sé respetuoso", "Depende de qué tan mala fue"], pi: 1 },
      { q: "Los ricos deberían pagar más impuestos:", options: ["100% de acuerdo", "Algo de acuerdo", "En desacuerdo", "No es tan simple"], pi: 3 },
      { q: "Tu mejor amigo te pide que mientas por él:", options: ["Lo haría sin dudar", "Depende de la mentira", "Nunca — no comprometo mi integridad", "Buscaría otra solución"], pi: 3 },
    ],
    situations: [
      { q: "Tu reacción cuando llega la comida: 🍕", options: ["😍 felicidad pura", "📸 foto primero", "🤤 ya estoy comiendo", "😐 se ve diferente al menú"], pi: 0 },
      { q: "El grupo de chat explotando a las 3am:", options: ["😴 silenciado desde el día uno", "👀 leyendo todo", "🔥 echando leña al fuego", "😤 quiénes son estas personas"], pi: 1 },
      { q: "Le das like a una foto de hace 3 años:", options: ["😱 pánico, quitar like", "💀 mi vida social terminó", "🤷 ya fue", "😂 reírse y seguir"], pi: 0 },
      { q: "Alguien dice 'tenemos que hablar':", options: ["😰 ansiedad instantánea", "🙄 aquí vamos", "🧘 estoy tranquilo", "🏃 hora de correr"], pi: 0 },
      { q: "Ves a tu ex en público:", options: ["👻 hacerme invisible", "😎 actuar indiferente", "👋 saludar normal", "📱 fingir que estoy en el teléfono"], pi: 3 },
      { q: "Plot twist en la película:", options: ["😮 mandíbula caída", "🤓 lo sabía", "😭 desastre emocional", "😴 espera qué pasó"], pi: 0 },
      { q: "Tu mejor amigo cancela planes a último momento:", options: ["😤 nunca lo perdono", "😌 secretamente aliviado", "🥺 triste pero comprensivo", "📱 ya reprogramando"], pi: 1 },
      { q: "Se cae el WiFi en un momento importante:", options: ["🤯 crisis existencial", "📖 supongo que leeré", "🕯️ velas, es un vibe", "😡 llamando al proveedor YA"], pi: 0 },
      { q: "Alguien te hace un cumplido:", options: ["😊 derritiéndome por dentro", "🤨 qué quieren", "😅 desvío incómodo", "💅 ya lo sé"], pi: 0 },
      { q: "Energía del lunes por la mañana:", options: ["☕ no me hables todavía", "🏃 a ganar el pan", "😩 ya contando hasta el viernes", "🎵 vibrando, sorprendentemente"], pi: 0 },
    ],
    livingtogether: [
      { q: "¿Quién cocina esta noche?", options: ["Yo cocino", "Tú cocinas, yo limpio", "Pidamos delivery", "El que esté menos cansado"], pi: 3 },
      { q: "El debate del termostato:", options: ["Siempre frío, persona de cobija", "Siempre calor, ventana abierta", "Llegamos a un acuerdo", "El último que lo toca gana"], pi: 2 },
      { q: "Arreglo ideal para dormir:", options: ["Misma cama, abrazados", "Misma cama, cobijas separadas", "Mismo cuarto, camas separadas", "A veces necesito mi espacio"], pi: 1 },
      { q: "¿Cómo manejan los quehaceres?", options: ["Horario estricto", "El que lo ve lo hace", "Turnos semanales", "Discutimos cada vez"], pi: 1 },
      { q: "Filosofía del supermercado:", options: ["Plan de comidas y lista", "Recorrer los pasillos", "Solo delivery en línea", "Comprar snacks, improvisar comidas"], pi: 3 },
      { q: "La situación del baño:", options: ["Necesito mínimo 45 minutos", "Entro y salgo, 10 minutos", "Podemos compartir, está bien", "No me hablen ahí dentro"], pi: 3 },
      { q: "Control del televisor:", options: ["Yo elijo, tú aceptas", "Nos turnamos", "Scrollear 30 min, no ver nada", "Pantallas separadas honestamente"], pi: 2 },
      { q: "Cuando vienen visitas:", options: ["Limpieza profunda", "Arreglo rápido basta", "Nuestra casa, nuestro desorden", "Necesito 3 días de aviso mínimo"], pi: 3 },
      { q: "Compatibilidad de rutina matutina:", options: ["Despertamos juntos", "Uno de nosotros es zombie", "Horarios completamente diferentes", "Coexistencia silenciosa hasta el café"], pi: 3 },
      { q: "Hablar de dinero en casa:", options: ["Todo 50/50", "Una cuenta, todo compartido", "Cada quien paga sus fuerzas", "No hablamos suficiente de eso"], pi: 0 },
    ],
    soulspirit: [
      { q: "¿Crees en algo más grande que nosotros?", options: ["Sí, profundamente", "Soy espiritual, no religioso", "No estoy seguro aún", "No, confío en la ciencia"], pi: 1 },
      { q: "¿Dónde encuentras paz?", options: ["En la naturaleza", "En oración o meditación", "En la música", "Con seres queridos"], pi: 0 },
      { q: "Destino vs. libre albedrío:", options: ["Todo pasa por algo", "Creamos nuestro camino", "Una mezcla de ambos", "Voy y vengo honestamente"], pi: 2 },
      { q: "¿Qué pasa después de morir?", options: ["Algo hermoso", "Nada — y está bien", "Prefiero no pensar en eso", "¿Reencarnación quizás?"], pi: 0 },
      { q: "Un ritual que te conecta a tierra:", options: ["Escribir un diario", "Oración", "Meditación o respiración", "Caminatas largas solo"], pi: 2 },
      { q: "¿Puede la gente realmente cambiar?", options: ["Sí, con esfuerzo real", "Solo si quieren", "La personalidad base no cambia", "Lo he visto pasar"], pi: 1 },
      { q: "Perdonar — ¿fácil o difícil para ti?", options: ["Perdono rápido", "Toma tiempo pero llego", "Perdono pero no olvido", "Depende de lo que hicieron"], pi: 3 },
      { q: "Tu relación con la gratitud:", options: ["La practico a diario", "Intento pero se me olvida", "La siento pero no la expreso", "Trabajando en ello"], pi: 0 },
      { q: "¿Qué le da sentido a la vida?", options: ["Amor y relaciones", "Propósito y contribución", "Experiencias y crecimiento", "Aún lo estoy descubriendo"], pi: 2 },
      { q: "Respeto por diferentes creencias:", options: ["Respeto todos los caminos", "Tengo curiosidad por otros", "Me quedo con lo mío", "Las creencias nos moldean"], pi: 0 },
    ],
  },
  th: {
    couples: [
      { q: "สิ่งแรกที่คุณสังเกตเห็นในตัวอีกคนคืออะไร?", options: ["รอยยิ้ม", "พลังงาน", "สไตล์", "อารมณ์ขัน"], pi: 1 },
      { q: "ถ้าเรามีเพลงประจำคู่ จะเป็นแนวอะไร?", options: ["R&B / Soul", "Pop", "Indie", "Lo-fi Beats"], pi: 2 },
      { q: "สิ่งที่คุณแอบชื่นชมมากที่สุดคืออะไร?", options: ["ความมั่นใจ", "ความใจดี", "ความคิดสร้างสรรค์", "ความแข็งแกร่ง"], pi: 1 },
      { q: "เลือกบรรยากาศสำหรับเดทในฝัน:", options: ["พระอาทิตย์ตกบนดาดฟ้า", "ขับรถกลางคืน", "ดูหนังอบอุ่น", "ผจญภัยแบบไม่มีแผน"], pi: 1 },
      { q: "อธิบายความสัมพันธ์เราด้วยคำเดียว:", options: ["วุ่นวาย", "มีประกายไฟ", "อบอุ่น", "ไม่เหมือนใคร"], pi: 1 },
    ],
    bestfriends: [
      { q: "อาหารคอมฟอร์ตฟู้ดที่ชอบที่สุด?", options: ["พิซซ่า", "ราเมน", "ทาโก้", "ไอศกรีม"], pi: 1 },
      { q: "เลือกแผนวันหยุดสุดสัปดาห์:", options: ["บรันช์ + ช้อปปิ้ง", "ดูซีรีส์ยาว", "โรดทริป", "ไม่ทำอะไรเลย"], pi: 2 },
      { q: "คุณสมบัติที่ดีที่สุดของเพื่อน?", options: ["ความซื่อสัตย์", "อารมณ์ขัน", "ความจริงใจ", "ความเป็นธรรมชาติ"], pi: 1 },
      { q: "แนวเพลงประจำมิตรภาพ:", options: ["Pop Hits", "เพลงย้อนยุค", "Indie Vibes", "Hip-Hop"], pi: 1 },
      { q: "ปลอบใจกันยังไง?", options: ["ส่งมีม", "สั่งอาหาร", "ไปหาแบบไม่บอก", "ส่งข้อความเสียงยาว"], pi: 0 },
    ],
    deeptalk: [
      { q: "อะไรสำคัญที่สุดในชีวิตคุณ?", options: ["อิสรภาพ", "ความผูกพัน", "การเติบโต", "ความมั่นคง"], pi: 1 },
      { q: "ความกลัวที่สุดของคุณ:", options: ["ถูกลืม", "อยู่คนเดียว", "เสียเวลาเปล่า", "สูญเสียตัวเอง"], pi: 2 },
      { q: "ความรักเป็นยังไงสำหรับคุณ?", options: ["สิ่งเล็กๆ ทุกวัน", "ท่าทางยิ่งใหญ่", "แค่อยู่ตรงนั้น", "คำพูดที่ยืนยัน"], pi: 0 },
      { q: "ถ้าเปลี่ยนโลกได้หนึ่งอย่าง:", options: ["ความเห็นอกเห็นใจ", "ความซื่อสัตย์", "ความเท่าเทียม", "ความอยากรู้อยากเห็น"], pi: 0 },
      { q: "พลังพิเศษด้านอารมณ์ของคุณคืออะไร?", options: ["อ่านบรรยากาศ", "ใจเย็น", "ทำให้คนหัวเราะ", "ฟังอย่างลึกซึ้ง"], pi: 3 },
    ],
    coworkers: [
      { q: "คนตื่นเช้าหรือนกฮูก?", options: ["ตื่น 6 โมง", "นกฮูก 100%", "แล้วแต่วัน", "เหนื่อยตลอด"], pi: 3 },
      { q: "สถานที่ทำงานในฝัน:", options: ["คาเฟ่", "ทำงานที่บ้าน", "ออฟฟิศเปิดโล่ง", "เงียบแบบห้องสมุด"], pi: 1 },
      { q: "สไตล์การประชุมของคุณ:", options: ["เปิดกล้อง ตั้งใจ", "ปิดกล้อง ทำหลายอย่าง", "ส่งอีเมลก็ได้", "ชอบไวท์บอร์ด"], pi: 2 },
      { q: "สไตล์การส่งข้อความ:", options: ["พิมพ์ยาวย่อหนึ่ง", "20 ข้อความสั้นๆ", "ข้อความเสียง", "แค่อีโมจิ"], pi: 3 },
      { q: "พักเที่ยง:", options: ["กินที่โต๊ะ", "ออกไปเดินเล่น", "กินเป็นกลุ่ม", "งีบ"], pi: 1 },
    ],
    hottakes: [
      { q: "สับปะรดบนพิซซ่า?", options: ["ระดับเทพ", "ไม่มีทาง", "แล้วแต่อารมณ์", "ไม่เคยลอง"], pi: 0 },
      { q: "ส่งข้อความซ้ำคือ:", options: ["กล้าหาญและไอคอนิก", "ร้องขอความช่วยเหลือ", "ปกติมาก", "แล้วแต่คน"], pi: 2 },
      { q: "ร้องไห้ในที่สาธารณะ:", options: ["ทรงพลัง", "อายมาก", "แล้วแต่การร้องไห้", "ทำไปแล้ววันนี้"], pi: 0 },
      { q: "ยุคเพลงที่ดีที่สุด:", options: ["ตอนนี้เลย", "2000s นอสทัลเจีย", "90s ตลอดกาล", "70s/80s คลาสสิก"], pi: 1 },
      { q: "โหราศาสตร์คือ:", options: ["แม่นจนน่ากลัว", "สนุกแต่เฟค", "ไร้สาระสิ้นดี", "ไม่รู้ราศีตัวเอง"], pi: 1 },
      { q: "ความสัมพันธ์คลุมเครือ:", options: ["สิ่งประดิษฐ์ที่แย่ที่สุด", "ก็โอเค", "แค่ใช้ชีวิต", "โรงงาน Red Flag"], pi: 1 },
      { q: "เวลาตอบสำคัญไหม?", options: ["ใช่ 100%", "เปล่า ฉันก็ลืม", "ตอนแรกๆ เท่านั้น", "ถ้าแคร์ก็ตอบ"], pi: 3 },
      { q: "The ick คือ:", options: ["จริงและสมเหตุสมผล", "ใช้เยอะไป", "แค่ข้ออ้าง", "ฉันคือ ick เอง"], pi: 0 },
      { q: "AI ครองโลก:", options: ["เกิดขึ้นแล้ว", "กลัวนิดหน่อย", "มาเลย", "ยินดีต้อนรับ"], pi: 1 },
      { q: "Ghost คน:", options: ["บางทีก็จำเป็น", "ผิดเสมอ", "แล้วแต่สถานการณ์", "ฉันเป็นคน ghost"], pi: 2 },
    ],
    redflags: [
      { q: "ตอบช้า 3 วัน:", options: ["Red flag", "อาจจะยุ่ง", "ฉันก็ทำแบบนั้น", "แล้วแต่ข้อความ"], pi: 0 },
      { q: "ไม่ชอบหมา:", options: ["จบเลย", "แมว > หมา อยู่แล้ว", "ไม่ใช่ทุกคน", "น่าสงสัยแต่โอเค"], pi: 3 },
      { q: "โพสต์ทุกอย่างในโซเชียล:", options: ["ชอบความมั่นใจ", "Red flag ใหญ่", "ขอแค่มีเราด้วย", "ฉันก็ทำเหมือนกัน"], pi: 1 },
      { q: "ยังเป็นเพื่อนกับแฟนเก่า:", options: ["เป็นผู้ใหญ่", "ไม่ได้เลย", "แล้วแต่กรณี", "ขอข้อมูลเพิ่ม"], pi: 2 },
      { q: "กินซีเรียลกับน้ำเปล่า:", options: ["เรียกตำรวจ", "ฉันไปละ", "เคารพความอยากรู้", "ทำเป็นไม่เห็น"], pi: 0 },
      { q: "ไม่เคยชวนไปไหน:", options: ["Red flag", "อาจจะขี้อาย", "ฉันเป็นคนวางแผนอยู่แล้ว", "ไม่ได้เจอกันแน่"], pi: 0 },
      { q: "ไม่มีโซเชียลเลย:", options: ["Green flag จริงๆ", "ซ่อนอะไร", "ไวบ์ลึกลับ", "ฉันก็เหมือนกัน"], pi: 0 },
      { q: "หลับระหว่างดูหนัง:", options: ["น่ารัก", "ไม่ให้เกียรติ", "ถ้าหนังน่าเบื่อก็ได้", "ปลุกแบบดราม่า"], pi: 0 },
      { q: "สั่งอาหารแทนเรา:", options: ["โรแมนติก", "ควบคุมเกินไป", "ถ้ารู้จักเราดีก็โอเค", "กล้าดี"], pi: 2 },
      { q: "บอก 'ไม่เป็นไร' แต่เป็น:", options: ["ถามต่อ", "ให้พื้นที่", "ฉันก็ทำแบบนั้น", "ถ้าทำตลอดคือ red flag"], pi: 0 },
    ],
    chaotic: [
      { q: "ของชิ้นสุดท้ายที่หยิบตอนไฟไหม้:", options: ["ที่ชาร์จมือถือ", "ขนม", "ศักดิ์ศรี", "ยืนเฉยๆ"], pi: 2 },
      { q: "Roman Empire ของคุณ:", options: ["ความทรงจำน่าอาย", "รักข้างเดียว", "ไทม์ไลน์คู่ขนาน", "ไดโนเสาร์จริงๆ"], pi: 0 },
      { q: "เป็นตัวร้าย อาวุธคือ:", options: ["ข้อความ passive aggressive", "ความเงียบเป็นอาวุธ", "เพลย์ลิสต์วุ่นวาย", "สปอยล์ตอนจบ"], pi: 3 },
      { q: "ทักษะเอาตัวรอดจริงๆ:", options: ["นอนได้ทุกที่", "กินของเหลือได้", "จอดรถขนาน", "ร้องไห้ตามสั่ง"], pi: 0 },
      { q: "เลือกตำแหน่งปลอม:", options: ["Chief Overthinker", "นักพูดมืออาชีพ", "ที่ปรึกษาไวบ์", "สถาปนิกงีบ"], pi: 1 },
      { q: "สายลับ FBI คิดว่าคุณ:", options: ["บ้า", "น่าเบื่อจริงๆ", "น่าเป็นห่วง", "งานที่ชอบที่สุด"], pi: 3 },
      { q: "ความคิดตอนตี 3:", options: ["ถ้าแรงโน้มถ่วงหยุด", "ควรทักแฟนเก่า", "ฉันมีจริงไหม", "อยากกินชีส"], pi: 3 },
      { q: "คำติดปาก:", options: ["มันก็คือมัน", "ไม่มีความคิดในหัว", "เอาเถอะ—", "บ้าไปแล้ว"], pi: 0 },
      { q: "ในหนังสยองขวัญคุณจะ:", options: ["ตายก่อน", "รอดคนสุดท้าย", "เป็นฆาตกร", "สะดุดล้มทันที"], pi: 3 },
      { q: "นิสัย toxic ของคุณ:", options: ["ซินโดรมตัวเอก", "คิดมากทุกเรื่อง", "หัวเราะผิดจังหวะ", "บอก 'ไว้เจอกัน' แต่ไม่เจอ"], pi: 1 },
    ],
    '36questions': [
      { q: "ถ้าเชิญใครก็ได้มาทานข้าวเย็น จะเชิญใคร?", options: ["ฮีโร่ในวัยเด็ก", "บุคคลในประวัติศาสตร์", "คนที่ขาดการติดต่อ", "คนดังที่ชื่นชม"], pi: 1 },
      { q: "อยากมีชื่อเสียงไหม? แบบไหน?", options: ["ใช่ — ด้วยความสามารถ", "ใช่ — เพื่อสร้างความเปลี่ยนแปลง", "อาจจะ — แค่นิดหน่อย", "ไม่ — ชอบความเป็นส่วนตัว"], pi: 1 },
      { q: "ก่อนโทรศัพท์ คุณซ้อมสิ่งที่จะพูดไหม?", options: ["ทุกครั้ง", "เฉพาะเรื่องสำคัญ", "นานๆ ที", "ไม่เลย — ด้นสด"], pi: 1 },
      { q: "วันที่สมบูรณ์แบบของคุณเป็นยังไง?", options: ["เช้าช้าๆ ไม่มีแผน", "ผจญภัยทั้งวัน", "อยู่กับคนที่รัก", "สร้างสรรค์สิ่งมีความหมาย"], pi: 0 },
      { q: "ครั้งสุดท้ายที่ร้องเพลงให้ตัวเองฟังคือเมื่อไหร่?", options: ["วันนี้ — ร้องตลอด", "สัปดาห์นี้ ตอนอาบน้ำ", "จำไม่ได้แล้ว", "ฮัมเพลง นับไหม?"], pi: 0 },
      { q: "ถ้าอายุถึง 90 — จะเลือกเก็บจิตใจหรือร่างกายของคนอายุ 30?", options: ["จิตใจ แน่นอน", "ร่างกาย ไม่ต้องคิด", "จิตใจ — ความคิดคือตัวฉัน", "ร่างกาย — ที่เหลือจัดการได้"], pi: 0 },
    ],
    fungames: [
      { q: "พิซซ่าไม่จำกัดหรือซูชิไม่จำกัดตลอดชีวิต?", options: ["พิซซ่าตลอดกาล", "ซูชิแน่นอน", "แล้วแต่อารมณ์", "เลือกไม่ได้ ร้องไห้แน่"], pi: 0 },
      { q: "ฟังได้แค่แนวเดียวตลอดกาล:", options: ["Pop", "Hip-hop", "เพลงคลาสสิกย้อนยุค", "Lo-fi / chill"], pi: 2 },
      { q: "จริงหรือกล้า?", options: ["จริง — เสมอ", "กล้า — ชีวิตต้องเสี่ยง", "แล้วแต่ใครถาม", "ไม่เอาทั้งคู่ ดูเฉยๆ"], pi: 1 },
      { q: "อยู่บนเกาะร้าง เลือกของ 1 อย่าง:", options: ["โทรศัพท์ (ไม่มีสัญญาณ)", "ขนมไม่จำกัด", "มีด", "หนังสือดีๆ"], pi: 1 },
      { q: "พลังวิเศษที่แย่ที่สุด:", options: ["อ่านใจ 24/7", "ล่องหนแต่หนาวตลอด", "บินได้แต่สูงแค่ 60 ซม.", "เร็วสุดๆ แต่สะดุดตลอด"], pi: 2 },
      { q: "สลับชีวิตกับใครสักคน 1 วัน:", options: ["คนดัง", "สัตว์เลี้ยง", "เจ้านาย", "ตัวเองตอนเด็ก"], pi: 3 },
      { q: "สิ่งน่าอายที่สุดที่จะทำเพื่อ 1 ล้าน:", options: ["ร้องคาราโอเกะตอนเมา", "ส่งข้อความหาแฟนเก่า 'คิดถึง'", "ใส่ชุดแฟนซีไปทำงาน", "โพสต์ประวัติการค้นหา"], pi: 0 },
      { q: "รายการเกมโชว์ในฝัน:", options: ["Survivor", "The Floor Is Lava", "Love Island", "เกมตอบคำถาม"], pi: 0 },
      { q: "สองจริงหนึ่งโกหก — คนเดาผิดข้อไหน?", options: ["ข้อบ้าๆ", "ข้อน่าเบื่อ", "เดาถูกตลอด", "โกหกไม่เก่งเลย"], pi: 1 },
      { q: "จัดปาร์ตี้ดินเนอร์ บรรยากาศ:", options: ["หรู ไวน์ แจ๊ส", "สบายๆ พิซซ่า บอร์ดเกม", "Potluck วุ่นวาย", "แค่เรา สั่งอาหาร คุยลึก"], pi: 3 },
    ],
    worldtaste: [
      { q: "จุดหมายท่องเที่ยวในฝัน:", options: ["โตเกียว ญี่ปุ่น", "มาร์ราเกช โมร็อกโก", "ซานโตรินี กรีซ", "เมเดยิน โคลอมเบีย"], pi: 0 },
      { q: "สตรีทฟู้ดที่ดีที่สุดในโลก:", options: ["ทาโก้จากเม็กซิโก", "ผัดไทยจากไทย", "เคบับจากตุรกี", "ติ่มซำจากจีน"], pi: 1 },
      { q: "ประเพณีที่อยากนำมาใช้:", options: ["Siesta (สเปน)", "Hygge (เดนมาร์ก)", "ฮานามิ (ญี่ปุ่น)", "Fika (สวีเดน)"], pi: 2 },
      { q: "ภาษาที่อยากพูดได้คล่อง:", options: ["ญี่ปุ่น", "ฝรั่งเศส", "อาหรับ", "เกาหลี"], pi: 0 },
      { q: "เทศกาลโลกที่อยากไป:", options: ["คาร์นิวัล (บราซิล)", "โฮลี (อินเดีย)", "วันแห่งความตาย (เม็กซิโก)", "เทศกาลโคมลอย (ไทย)"], pi: 1 },
      { q: "เครื่องดื่มสบายใจที่สุดในโลก:", options: ["ชัย (อินเดีย)", "มัทฉะ (ญี่ปุ่น)", "กาแฟตุรกี", "ออร์ชาตา (เม็กซิโก)"], pi: 2 },
      { q: "เพลงที่สะกดจิตวิญญาณ:", options: ["Afrobeats", "K-Pop", "ละตินเร็กเกตอน", "ดนตรีอูดอาหรับ"], pi: 0 },
      { q: "คุณค่าทางวัฒนธรรมที่เคารพที่สุด:", options: ["การต้อนรับ (ตะวันออกกลาง)", "เคารพผู้อาวุโส (เอเชีย)", "จิตวิญญาณชุมชน (แอฟริกา)", "สมดุลชีวิต-งาน (นอร์ดิก)"], pi: 3 },
      { q: "ถ้าอยู่ต่างประเทศ 1 ปี:", options: ["อิตาลี — อาหารและไวบ์", "เกาหลีใต้ — คลื่นวัฒนธรรม", "บราซิล — พลังและความอบอุ่น", "นิวซีแลนด์ — ธรรมชาติและสงบ"], pi: 0 },
      { q: "ประเพณีขนมหวานที่ดีที่สุด:", options: ["เพสทรีฝรั่งเศส", "บากลาวาตุรกี", "โมจิญี่ปุ่น", "กุหลาบจามุนอินเดีย"], pi: 1 },
    ],
    ethics: [
      { q: "เจอกระเป๋าสตางค์มี $500 และบัตรประชาชน:", options: ["คืนทั้งหมด", "เก็บเงิน คืนกระเป๋า", "พยายามหาเจ้าของ", "แล้วแต่ว่าถังแค่ไหน"], pi: 0 },
      { q: "โกหกเพื่อปกป้องคนอื่นได้ไหม?", options: ["ได้ เสมอ", "เฉพาะกรณีรุนแรง", "ไม่เลย — ความจริงสำคัญ", "แล้วแต่ว่าปกป้องอะไร"], pi: 3 },
      { q: "เพื่อนนอกใจแฟน:", options: ["บอกแฟนเพื่อน", "ไม่ยุ่งเรื่องคนอื่น", "คุยกับเพื่อนก่อน", "มันซับซ้อน"], pi: 2 },
      { q: "แจ้งเพื่อนร่วมงานที่ขโมยของเล็กๆ น้อยๆ?", options: ["ใช่ กฎคือกฎ", "ไม่ ไม่ใช่เรื่องฉัน", "คุยกับเขาก่อน", "แล้วแต่ว่าขโมยอะไร"], pi: 2 },
      { q: "แคนเซิลคัลเจอร์ยุติธรรมไหม?", options: ["ใช่ — ต้องรับผิดชอบ", "บางครั้ง ไม่เสมอ", "ไม่ — ทุกคนสมควรได้โอกาสที่สอง", "ซับซ้อนกว่านั้น"], pi: 3 },
      { q: "ช่วยคนแปลกหน้า 5 คน หรือคนที่รัก 1 คน:", options: ["5 คนแปลกหน้า", "1 คนที่รัก", "เลือกไม่ได้", "ปฏิเสธสถานการณ์ทั้งหมด"], pi: 1 },
      { q: "ความเป็นส่วนตัว vs. ความปลอดภัย:", options: ["ความเป็นส่วนตัวเสมอ", "ความปลอดภัยเสมอ", "สมดุลทั้งสอง", "แล้วแต่สถานการณ์"], pi: 2 },
      { q: "ghostหลังเดทแย่ๆ ได้ไหม?", options: ["ได้ ไม่มีภาระ", "อย่างน้อยส่งข้อความ", "ไม่เลย ให้เกียรติ", "แล้วแต่ว่าแย่แค่ไหน"], pi: 1 },
      { q: "คนรวยควรเสียภาษีมากขึ้น:", options: ["เห็นด้วย 100%", "ค่อนข้างเห็นด้วย", "ไม่เห็นด้วย", "ไม่ง่ายอย่างนั้น"], pi: 3 },
      { q: "เพื่อนสนิทขอให้โกหกแทน:", options: ["ทำเลย ไม่ต้องคิด", "แล้วแต่เรื่องโกหก", "ไม่เลย — ไม่ยอมเสียความซื่อสัตย์", "หาทางออกอื่น"], pi: 3 },
    ],
    situations: [
      { q: "ปฏิกิริยาเมื่ออาหารมาถึง: 🍕", options: ["😍 มีความสุขล้วนๆ", "📸 ถ่ายรูปก่อน", "🤤 กินไปแล้ว", "😐 ดูไม่เหมือนในเมนู"], pi: 0 },
      { q: "กรุ๊ปแชทระเบิดตี 3:", options: ["😴 ปิดเสียงตั้งแต่วันแรก", "👀 อ่านทุกอย่าง", "🔥 เติมเชื้อไฟ", "😤 คนพวกนี้คือใคร"], pi: 1 },
      { q: "กดไลค์รูปเก่า 3 ปีโดยไม่ตั้งใจ:", options: ["😱 แพนิก ยกเลิกไลค์", "💀 ชีวิตสังคมจบแล้ว", "🤷 ช่างมัน", "😂 หัวเราะต่อ"], pi: 0 },
      { q: "มีคนบอก 'เราต้องคุยกัน':", options: ["😰 กังวลทันที", "🙄 มาอีกแล้ว", "🧘 ใจเย็น", "🏃 หนีเลย"], pi: 0 },
      { q: "เจอแฟนเก่าในที่สาธารณะ:", options: ["👻 ล่องหน", "😎 ทำเป็นไม่แคร์", "👋 ทักทายปกติ", "📱 แกล้งคุยโทรศัพท์"], pi: 3 },
      { q: "พล็อตทวิสต์ในหนัง:", options: ["😮 อ้าปากค้าง", "🤓 รู้แล้ว", "😭 พังทางอารมณ์", "😴 เอ๊ะ อะไรนะ"], pi: 0 },
      { q: "เพื่อนสนิทยกเลิกแผนนาทีสุดท้าย:", options: ["😤 ไม่มีวันให้อภัย", "😌 แอบโล่งใจ", "🥺 เศร้าแต่เข้าใจ", "📱 นัดใหม่แล้ว"], pi: 1 },
      { q: "WiFi หายตอนสำคัญ:", options: ["🤯 วิกฤตอัตถิภาวนิยม", "📖 อ่านหนังสือแล้วกัน", "🕯️ จุดเทียน เป็นไวบ์", "😡 โทรหาผู้ให้บริการเดี๋ยวนี้"], pi: 0 },
      { q: "มีคนชมคุณ:", options: ["😊 ละลายข้างใน", "🤨 ต้องการอะไร", "😅 เบี่ยงเบนอย่างเก้อ", "💅 รู้อยู่แล้ว"], pi: 0 },
      { q: "พลังงานเช้าวันจันทร์:", options: ["☕ อย่าเพิ่งคุยกับฉัน", "🏃 ลุยเลย", "😩 นับวันถึงศุกร์แล้ว", "🎵 สนุกดีเหมือนกัน"], pi: 0 },
    ],
    livingtogether: [
      { q: "คืนนี้ใครทำอาหาร?", options: ["ฉันทำ", "คุณทำ ฉันล้าง", "สั่งเลย", "ใครเหนื่อยน้อยกว่า"], pi: 3 },
      { q: "ศึกเทอร์โมสตัท:", options: ["หนาวตลอด ชอบผ้าห่ม", "ร้อนตลอด เปิดหน้าต่าง", "ประนีประนอมกัน", "คนสุดท้ายที่แตะชนะ"], pi: 2 },
      { q: "การนอนในอุดมคติ:", options: ["เตียงเดียว กอดกัน", "เตียงเดียว ผ้าห่มแยก", "ห้องเดียว เตียงแยก", "บางทีต้องการพื้นที่ส่วนตัว"], pi: 1 },
      { q: "จัดการงานบ้านยังไง?", options: ["ตารางเข้มงวด", "ใครเห็นก่อนทำ", "สลับกันรายสัปดาห์", "ทะเลาะกันทุกครั้ง"], pi: 1 },
      { q: "ปรัชญาซื้อของ:", options: ["แพลนมื้ออาหารและรายการ", "เดินดูไปเรื่อย", "สั่งออนไลน์อย่างเดียว", "ซื้อขนม คิดมื้อทีหลัง"], pi: 3 },
      { q: "สถานการณ์ห้องน้ำ:", options: ["ต้องการอย่างน้อย 45 นาที", "เข้าออก 10 นาที", "แชร์กันได้ ไม่เป็นไร", "อย่าคุยกับฉันในนั้น"], pi: 3 },
      { q: "รีโมททีวี:", options: ["ฉันเลือก คุณตกลง", "สลับกัน", "เลื่อนดู 30 นาที ไม่ดูอะไร", "แยกจอกันดีกว่า"], pi: 2 },
      { q: "เมื่อมีแขกมา:", options: ["ทำความสะอาดลึก", "เก็บเร็วๆ พอ", "บ้านเรา ความรกเรา", "ต้องบอกล่วงหน้า 3 วัน"], pi: 3 },
      { q: "ความเข้ากันได้ตอนเช้า:", options: ["ตื่นพร้อมกัน", "คนนึงเป็นซอมบี้", "เวลาต่างกันสิ้นเชิง", "อยู่ด้วยกันเงียบๆ จนได้กาแฟ"], pi: 3 },
      { q: "คุยเรื่องเงินในบ้าน:", options: ["แบ่งทุกอย่าง 50/50", "บัญชีเดียว แชร์ทุกอย่าง", "แต่ละคนจ่ายตามจุดแข็ง", "คุยกันไม่พอ"], pi: 0 },
    ],
    soulspirit: [
      { q: "คุณเชื่อในสิ่งที่ยิ่งใหญ่กว่าเราไหม?", options: ["ใช่ อย่างลึกซึ้ง", "เป็นคนจิตวิญญาณ ไม่ใช่ศาสนา", "ยังไม่แน่ใจ", "ไม่ เชื่อวิทยาศาสตร์"], pi: 1 },
      { q: "หาความสงบที่ไหน?", options: ["ธรรมชาติ", "สวดมนต์หรือทำสมาธิ", "เพลง", "อยู่กับคนที่รัก"], pi: 0 },
      { q: "โชคชะตา vs. เจตจำนงเสรี:", options: ["ทุกอย่างเกิดขึ้นด้วยเหตุผล", "เราสร้างเส้นทางเอง", "ผสมทั้งสอง", "ยังไม่ตัดสินใจ"], pi: 2 },
      { q: "ตายแล้วเกิดอะไรขึ้น?", options: ["สิ่งสวยงาม", "ไม่มีอะไร — แต่ไม่เป็นไร", "ไม่อยากคิด", "กลับชาติมาเกิดอาจจะ?"], pi: 0 },
      { q: "พิธีกรรมที่ทำให้มั่นคง:", options: ["เขียนไดอารี่", "สวดมนต์", "ทำสมาธิหรือหายใจ", "เดินคนเดียวนานๆ"], pi: 2 },
      { q: "คนเปลี่ยนได้จริงไหม?", options: ["ได้ ด้วยความพยายาม", "เฉพาะถ้าต้องการ", "บุคลิกหลักเหมือนเดิม", "เคยเห็นมาแล้ว"], pi: 1 },
      { q: "ให้อภัย — ง่ายหรือยาก?", options: ["ให้อภัยเร็ว", "ใช้เวลาแต่ถึง", "ให้อภัยแต่ไม่ลืม", "แล้วแต่ว่าทำอะไร"], pi: 3 },
      { q: "ความสัมพันธ์กับความกตัญญู:", options: ["ปฏิบัติทุกวัน", "พยายามแต่ลืม", "รู้สึกแต่ไม่แสดงออก", "กำลังพัฒนา"], pi: 0 },
      { q: "อะไรให้ความหมายกับชีวิต?", options: ["ความรักและความสัมพันธ์", "เป้าหมายและการมีส่วนร่วม", "ประสบการณ์และการเติบโต", "ยังหาคำตอบอยู่"], pi: 2 },
      { q: "เคารพความเชื่อที่แตกต่าง:", options: ["เคารพทุกเส้นทาง", "อยากรู้เกี่ยวกับคนอื่น", "ยึดของตัวเอง", "ความเชื่อหล่อหลอมเรา"], pi: 0 },
    ],
  },
};

// Get current language questions for a pack
function getQuestions(packKey) {
  const lang = i18n.current;
  const pack = questionPacks[lang]?.[packKey] || questionPacks.en[packKey];
  return pack.map(q => ({
    q: q.q,
    options: q.options,
    partnerAnswerIndex: q.pi
  }));
}

let questions = getQuestions('couples');

// ==================== AUTH FLOW ====================
function showAuth(target) {
  afterAuthTarget = target;
  if (currentUser) {
    goTo(afterAuthTarget);
    return;
  }
  goTo('auth');
  setTimeout(() => document.getElementById('authUsername')?.focus(), 300);
}

async function doAuth() {
  const input = document.getElementById('authUsername');
  const err = document.getElementById('authError');
  const btn = document.getElementById('authBtn');
  const username = input.value.trim();

  if (username.length < 2) {
    err.textContent = 'at least 2 characters';
    return;
  }

  btn.disabled = true;
  btn.textContent = '...';
  err.textContent = '';

  try {
    const data = await blindApi.auth(username);
    if (data.error) { err.textContent = data.error; return; }

    currentUser = data.user;
    localStorage.setItem('bs-user', JSON.stringify(currentUser));
    localStorage.setItem('bs-user-id', currentUser.id);

    // If joining via URL code
    if (joinCode) {
      await handleJoinCode(joinCode);
      joinCode = null;
      return;
    }

    goTo(afterAuthTarget);
  } catch (e) {
    err.textContent = 'connection error, try again';
  } finally {
    btn.disabled = false;
    btn.textContent = 'continue';
  }
}

// Enter key on auth input
document.getElementById('authUsername')?.addEventListener('keydown', e => {
  if (e.key === 'Enter') doAuth();
});

function switchUser() {
  currentUser = null;
  currentSession = null;
  localStorage.removeItem('bs-user');
  localStorage.removeItem('bs-user-id');
  stopPolling();
  document.getElementById('authUsername').value = '';
  document.getElementById('authError').textContent = '';
  afterAuthTarget = 'home';
  goTo('auth');
  setTimeout(() => document.getElementById('authUsername')?.focus(), 300);
}

// ==================== HOME SESSIONS ====================
let _cachedSessions = null;
let _homeFilter = 'all';

function setHomeFilter(filter) {
  _homeFilter = filter;
  document.querySelectorAll('.home-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === filter);
  });
  renderHomeSessions();
}

function renderHomeSessions() {
  const container = document.getElementById('homeSessions');
  if (!container) return;
  if (_cachedSessions === null) {
    container.innerHTML = `<div style="text-align:center;padding:24px;color:var(--text-dim)">${i18n.t('home_loading')}</div>`;
    return;
  }
  const hidden = getHiddenSessions();
  const sessions = _cachedSessions.filter(s => !hidden.includes(s.code));

  if (sessions.length === 0) {
    container.innerHTML = `
      <div style="text-align:center;padding:40px 20px;color:var(--text-dim)">
        <div style="font-size:36px;margin-bottom:12px">🫣</div>
        <p>${i18n.t('home_no_sessions')}</p>
      </div>`;
    return;
  }

  const packEmojis = { couples: '💕', bestfriends: '👯', deeptalk: '🌊', coworkers: '💼', '36questions': '❤️‍🔥', hottakes: '🌶️', redflags: '🚩', chaotic: '🎲', fungames: '🎉', worldtaste: '🌍', ethics: '⚖️', situations: '😱', livingtogether: '🏠', soulspirit: '🕊️' };
  let html = '';
  const active = sessions.filter(s => s.status !== 'complete');
  const done = sessions.filter(s => s.status === 'complete');

  const showActive = _homeFilter === 'all' || _homeFilter === 'active';
  const showDone = _homeFilter === 'all' || _homeFilter === 'completed';

  if (showActive && active.length) {
    if (_homeFilter === 'all') html += `<div class="section-label">${i18n.t('home_active')}</div>`;
    active.forEach(s => {
      const partner = s.creator_id === currentUser.id ? s.partner_username : s.creator_username;
      const emoji = packEmojis[s.pack_key] || '📦';
      const packName = i18n.t('pack_' + s.pack_key) || s.pack_key;
      let badge = '';
      if (s.status === 'waiting') badge = `<div class="s-badge badge-waiting">${i18n.t('badge_waiting')}</div>`;
      else if (s.status === 'active') badge = `<div class="s-badge badge-progress">${i18n.t('badge_progress')}</div>`;

      html += `<div class="session-card-wrap" data-code="${s.code}">
        <div class="session-card glass" onclick="resumeSession('${s.code}')">
          <div class="s-icon" style="background:rgba(124,58,237,0.1)">${emoji}</div>
          <div class="s-info">
            <div class="s-title">${packName}</div>
            <div class="s-sub">${partner ? i18n.t('home_with') + ' ' + partner : i18n.t('home_waiting_partner')} · ${s.code}</div>
          </div>
          ${badge}
        </div>
        <button class="delete-btn" onclick="openDeleteModal('${s.code}')">${i18n.t('delete_label')}</button>
      </div>`;
    });
  }

  if (showDone && done.length) {
    if (_homeFilter === 'all') html += `<div class="section-label">${i18n.t('home_completed')}</div>`;
    done.forEach(s => {
      const partner = s.creator_id === currentUser.id ? s.partner_username : s.creator_username;
      const emoji = packEmojis[s.pack_key] || '📦';
      const packName = i18n.t('pack_' + s.pack_key) || s.pack_key;
      html += `<div class="session-card-wrap" data-code="${s.code}">
        <div class="session-card glass" onclick="viewResults('${s.code}')">
          <div class="s-icon" style="background:var(--surface)">${emoji}</div>
          <div class="s-info">
            <div class="s-title">${packName}</div>
            <div class="s-sub">${i18n.t('home_with')} ${partner || '?'}</div>
          </div>
          <div class="s-badge badge-done">${i18n.t('home_done')}</div>
        </div>
        <button class="delete-btn" onclick="openDeleteModal('${s.code}')">${i18n.t('delete_label')}</button>
      </div>`;
    });
  }

  if (!html) {
    const emptyKey = _homeFilter === 'active' ? 'home_active' : _homeFilter === 'completed' ? 'home_completed' : '';
    html = `<div style="text-align:center;padding:40px 20px;color:var(--text-dim)">
      <div style="font-size:36px;margin-bottom:12px">🫣</div>
      <p>${i18n.t('home_no_sessions')}</p>
    </div>`;
  }

  container.innerHTML = html;
  initSwipeToDelete();
}

async function loadHomeSessions() {
  const usernameEl = document.getElementById('homeUsername');
  if (currentUser) usernameEl.textContent = '@' + currentUser.username;
  if (_cachedSessions === null) renderHomeSessions();
  try {
    const data = await blindApi.getUserSessions();
    _cachedSessions = data.sessions || [];
    renderHomeSessions();
  } catch (e) {
    const container = document.getElementById('homeSessions');
    if (container) container.innerHTML = `<div style="text-align:center;padding:24px;color:var(--text-dim)">${i18n.t('home_load_error')}</div>`;
  }
}

async function resumeSession(code) {
  try {
    const data = await blindApi.getSession(code);
    const s = data.session;
    currentSession = s;
    selectedPackKey = s.pack_key;
    questions = getQuestions(s.pack_key);

    if (s.status === 'complete') {
      viewResults(code);
      return;
    }

    if (s.user_submitted) {
      // Already submitted, go to waiting
      goTo('waiting');
      document.getElementById('waitingCode').textContent = s.code;
      const pName = s.creator_id === currentUser?.id ? s.partner_username : s.creator_username;
      if (pName) {
        document.getElementById('waitingDesc').innerHTML =
          `waiting for <strong style="color:var(--text)">${pName}</strong> to finish answering...`;
      }
      startPolling();
      return;
    }

    // Start/continue quiz
    currentQuestion = 0;
    selectedAnswers = {};
    questionModes = [];
    goTo('quiz');
  } catch (e) {
    alert('Could not load session');
  }
}

async function viewResults(code) {
  try {
    currentSession = (await blindApi.getSession(code)).session;
    selectedPackKey = currentSession.pack_key;
    questions = getQuestions(currentSession.pack_key);
    goTo('results');
    await buildReceiptFromApi(code);
  } catch (e) {
    alert('Could not load results');
  }
}

// ==================== SESSION CREATION ====================
function getInviteUrl() {
  if (!currentSession) return '';
  const base = window.location.origin + window.location.pathname;
  return base + '?join=' + currentSession.code;
}

function copyInviteLink(btn) {
  const url = getInviteUrl();
  navigator.clipboard.writeText(url).catch(() => {});
  const orig = btn.textContent;
  btn.textContent = 'copied!';
  btn.style.background = 'var(--lime)';
  btn.style.color = '#000';
  setTimeout(() => {
    btn.textContent = orig;
    btn.style.background = '';
    btn.style.color = '';
  }, 2000);
}

function shareInvite(method) {
  const url = getInviteUrl();
  const text = 'take this blind quiz with me!';
  if (method === 'share' && navigator.share) {
    navigator.share({ title: 'blindside.', text, url }).catch(() => {});
  } else if (method === 'whatsapp') {
    window.open('https://wa.me/?text=' + encodeURIComponent(text + ' ' + url));
  } else if (method === 'sms') {
    window.open('sms:?body=' + encodeURIComponent(text + ' ' + url));
  }
}

// ==================== JOIN VIA URL ====================
async function handleJoinCode(code) {
  try {
    // First check session status
    const check = await blindApi.getSession(code);
    if (check.error) { alert('Session not found'); goTo('home'); return; }

    const session = check.session;

    // If already complete, just show results
    if (session.status === 'complete') {
      viewResults(code);
      return;
    }

    // If user already submitted for this session, go to waiting
    if (session.user_submitted) {
      currentSession = session;
      selectedPackKey = session.pack_key;
      questions = getQuestions(session.pack_key);
      goTo('waiting');
      document.getElementById('waitingCode').textContent = session.code;
      const pName = session.creator_id === currentUser?.id ? session.partner_username : session.creator_username;
      if (pName) {
        document.getElementById('waitingDesc').innerHTML =
          `waiting for <strong style="color:var(--text)">${pName}</strong> to finish answering...`;
      }
      startPolling();
      return;
    }

    // Join the session
    const data = await blindApi.joinSession(code);
    if (data.error) { alert(data.error); goTo('home'); return; }

    currentSession = data.session;
    selectedPackKey = currentSession.pack_key;
    questions = getQuestions(currentSession.pack_key);

    currentQuestion = 0;
    selectedAnswers = {};
    questionModes = [];
    goTo('quiz');
  } catch (e) {
    alert('Could not join session');
    goTo('home');
  }
}

// Render marquee
function renderPacksMarquee() {
  const el = document.getElementById('packsMarquee');
  if (!el) return;
  const items = [
    `<span class="marquee-hot">${i18n.t('marquee_trending')}</span>`,
    `<span>${i18n.t('marquee_plays')}</span>`,
    `<span class="marquee-hot">${i18n.t('marquee_new')}</span>`,
    `<span>${i18n.t('marquee_dare')}</span>`,
    `<span class="marquee-hot">${i18n.t('marquee_viral')}</span>`,
    `<span>${i18n.t('marquee_send')}</span>`,
  ];
  el.innerHTML = items.join('') + items.join('');
}

// Render filter pills
function renderPacksFilters() {
  const el = document.getElementById('packsFilters');
  if (!el) return;
  el.innerHTML = packCategories.map(c =>
    `<button class="filter-pill${c.key === activePackFilter ? ' active' : ''}" onclick="filterPacks('${c.key}')">${c.icon ? c.icon + ' ' : ''}${i18n.t(c.labelKey)}</button>`
  ).join('');
}

function filterPacks(catKey) {
  activePackFilter = catKey;
  renderPacksFilters();
  renderPacksGridCards();
  const featuredSection = document.getElementById('packsFeaturedSection');
  const sectionLabel = document.querySelector('.packs-section-label');
  if (featuredSection) featuredSection.style.display = catKey === 'all' ? '' : 'none';
  if (sectionLabel) sectionLabel.style.display = catKey === 'all' ? '' : 'none';
}

// Render featured carousel
function renderPacksFeatured() {
  const el = document.getElementById('packsFeatured');
  if (!el) return;
  const featured = packDefs.filter(p => p.featured);
  el.innerHTML = featured.map((p, idx) =>
    `<div class="featured-card" style="animation-delay:${idx * 0.1}s" onclick="selectPack('${p.key}')">
      <div class="featured-badge ${p.featuredBadge}">${i18n.t('badge_' + p.featuredBadge)}</div>
      <div class="featured-emoji">${p.emoji}</div>
      <div class="featured-title">${i18n.t(p.nameKey)}</div>
      <div class="featured-desc">${i18n.t(p.descKey)}</div>
      <div class="featured-meta">
        <span class="meta-plays">${p.plays} ${i18n.t('packs_played')}</span>
      </div>
    </div>`
  ).join('');
}

// Render pack grid cards
function renderPacksGridCards() {
  const grid = document.getElementById('packsGrid');
  if (!grid) return;
  const filtered = activePackFilter === 'all'
    ? packDefs
    : packDefs.filter(p => p.cat === activePackFilter);
  grid.innerHTML = filtered.map((p, idx) => {
    const badgeHtml = p.badge
      ? `<span class="pack-badge badge-${p.badge}">${i18n.t('badge_' + p.badge)}</span>`
      : '';
    return `<div class="pack-card glass" style="animation-delay:${idx * 0.06}s" onclick="selectPack('${p.key}')">
      ${badgeHtml}
      <div class="pack-emoji">${p.emoji}</div>
      <div class="pack-title">${i18n.t(p.nameKey)}</div>
      <div class="pack-plays">${p.plays} ${i18n.t('packs_played')}</div>
      <div class="pack-count">${i18n.t(p.countKey)}</div>
    </div>`;
  }).join('');
}

// Full packs render
function renderPacksGrid() {
  renderPacksMarquee();
  renderPacksFilters();
  renderPacksFeatured();
  renderPacksGridCards();
}
renderPacksGrid();

// Navigation
function goTo(screenId) {
  const prev = document.getElementById(currentScreen);
  const next = document.getElementById(screenId);
  if (!next) return;
  if (currentScreen === screenId) {
    // Allow re-triggering side effects for home
    if (screenId === 'home') { stopPolling(); loadHomeSessions(); }
    return;
  }

  prev.classList.remove('active');
  prev.classList.add('slide-out');

  setTimeout(() => {
    prev.classList.remove('slide-out');
    next.classList.add('active');
    currentScreen = screenId;

    if (screenId === 'quiz') renderQuestion();
    if (screenId === 'results') { /* receipt built by caller */ }
    if (screenId === 'home') { updateNav('home'); stopPolling(); loadHomeSessions(); }
    if (screenId === 'packs') { updateNav('packs'); renderPacksGrid(); }
  }, 200);
}

function updateNav(active) {
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  // This is cosmetic
}

// Pack selection
async function selectPack(key) {
  selectedPackKey = key;
  const def = packDefs.find(p => p.key === key);
  questions = getQuestions(key);
  document.getElementById('invitePackName').textContent = i18n.t(def.nameKey);

  // Create session via API
  try {
    const data = await blindApi.createSession(key, i18n.current);
    if (data.error) { alert(data.error); return; }
    currentSession = data.session;
    document.getElementById('inviteLink').textContent = getInviteUrl();
    goTo('invite');
  } catch (e) {
    alert('Could not create session');
  }
}

function startQuizAsCreator() {
  currentQuestion = 0;
  selectedAnswers = {};
  questionModes = [];
  goTo('quiz');
}

// Quiz — Mini-game modes
const QUIZ_MODES = ['classic', 'thisOrThat', 'bubblePop', 'blitz', 'swipe'];
const MODE_LABELS = { classic: '✏️', thisOrThat: '⚔️ This or That', bubblePop: '🫧 Bubble Pop', blitz: '⚡ Blitz', swipe: '👆 Swipe Pick' };
let questionModes = [];
let blitzInterval = null;

function assignQuestionModes() {
  questionModes = [];
  for (let i = 0; i < questions.length; i++) {
    if (i === 0) { questionModes.push('classic'); continue; }
    const av = QUIZ_MODES.filter(m => m !== questionModes[i - 1]);
    questionModes.push(av[Math.floor(Math.random() * av.length)]);
  }
}

function renderQuestion() {
  if (!questionModes.length) assignQuestionModes();
  const q = questions[currentQuestion];
  const total = questions.length;
  const progress = ((currentQuestion) / total) * 100;
  const mode = questionModes[currentQuestion];

  document.getElementById('quizProgress').style.width = progress + '%';
  document.getElementById('quizCount').textContent = `${currentQuestion + 1} / ${total}`;

  const isLast = currentQuestion === total - 1;
  const nextBtn = document.getElementById('quizNextBtn');
  nextBtn.textContent = isLast ? i18n.t('quiz_submit') : i18n.t('quiz_next');
  nextBtn.disabled = selectedAnswers[currentQuestion] === undefined;
  document.getElementById('quizBackBtn').style.display = currentQuestion > 0 ? '' : 'none';

  if (blitzInterval) { clearInterval(blitzInterval); blitzInterval = null; }
  const body = document.getElementById('quizBody');

  switch (mode) {
    case 'thisOrThat': renderThisOrThat(body, q); break;
    case 'bubblePop': renderBubblePop(body, q); break;
    case 'blitz': renderBlitz(body, q); break;
    case 'swipe': renderSwipe(body, q); break;
    default: renderClassic(body, q);
  }
}

// --- CLASSIC ---
function renderClassic(body, q) {
  body.innerHTML = `
    <div class="question-card" key="${currentQuestion}">
      <div class="question-label">${i18n.t('quiz_question')} ${currentQuestion + 1}</div>
      <div class="question-text">${q.q}</div>
      <div class="answer-options">
        ${q.options.map((opt, oi) => `
          <button class="answer-opt ${selectedAnswers[currentQuestion] === oi ? 'selected' : ''}"
                  onclick="selectAnswer(${currentQuestion}, ${oi}, this)">
            ${opt}
          </button>
        `).join('')}
      </div>
    </div>`;
}

// --- THIS OR THAT ---
function renderThisOrThat(body, q) {
  const opts = q.options, s = selectedAnswers[currentQuestion];
  body.innerHTML = `
    <div class="question-card" key="${currentQuestion}">
      <div class="mode-badge">${MODE_LABELS.thisOrThat}</div>
      <div class="question-text" style="font-size:19px">${q.q}</div>
      <div class="tot-container">
        <div class="tot-matchup">
          ${opts.slice(0, 2).map((opt, i) =>
            `<div class="tot-side ${s === i ? 'selected' : (s !== undefined && s !== i ? 'dimmed' : '')}"
                  onclick="selectTot(${currentQuestion}, ${i})">${opt}</div>`
          ).join('<div class="tot-vs">VS</div>')}
        </div>
        <div class="tot-matchup">
          ${opts.slice(2).map((opt, i) =>
            `<div class="tot-side ${s === (i+2) ? 'selected' : (s !== undefined && s !== (i+2) ? 'dimmed' : '')}"
                  onclick="selectTot(${currentQuestion}, ${i+2})">${opt}</div>`
          ).join('<div class="tot-vs">VS</div>')}
        </div>
      </div>
    </div>`;
}
function selectTot(qi, ans) {
  selectedAnswers[qi] = ans;
  document.getElementById('quizNextBtn').disabled = false;
  document.querySelectorAll('.tot-side').forEach((el, i) => {
    el.classList.remove('selected', 'dimmed');
    if (i === ans) el.classList.add('selected');
    else el.classList.add('dimmed');
  });
}

// --- BUBBLE POP ---
function renderBubblePop(body, q) {
  const pos = [
    { top: '5%', left: '8%', size: 120 },
    { top: '2%', left: '55%', size: 110 },
    { top: '50%', left: '5%', size: 115 },
    { top: '48%', left: '52%', size: 125 }
  ];
  const s = selectedAnswers[currentQuestion];
  body.innerHTML = `
    <div class="question-card" key="${currentQuestion}">
      <div class="mode-badge">${MODE_LABELS.bubblePop}</div>
      <div class="question-text" style="font-size:19px">${q.q}</div>
      <div class="bubble-field">
        ${q.options.map((opt, oi) => {
          const p = pos[oi];
          return `<div class="bubble ${s === oi ? 'selected' : ''} ${s !== undefined && s !== oi ? 'dimmed' : ''}"
                       style="top:${p.top};left:${p.left};width:${p.size}px;height:${p.size}px"
                       onclick="selectBubble(${currentQuestion}, ${oi})">${opt}</div>`;
        }).join('')}
      </div>
    </div>`;
}
function selectBubble(qi, ans) {
  selectedAnswers[qi] = ans;
  document.getElementById('quizNextBtn').disabled = false;
  document.querySelectorAll('.bubble').forEach((el, i) => {
    el.classList.remove('selected', 'dimmed');
    if (i === ans) el.classList.add('selected');
    else el.classList.add('dimmed');
  });
}

// --- BLITZ ---
function renderBlitz(body, q) {
  const BT = 10;
  body.innerHTML = `
    <div class="question-card" key="${currentQuestion}">
      <div class="mode-badge">${MODE_LABELS.blitz}</div>
      <div class="blitz-label" id="blitzCount">${BT}</div>
      <div class="blitz-timer-bar"><div class="blitz-timer-fill" id="blitzFill"></div></div>
      <div class="question-text" style="font-size:19px">${q.q}</div>
      <div class="answer-options blitz-mode">
        ${q.options.map((opt, oi) => `
          <button class="answer-opt ${selectedAnswers[currentQuestion] === oi ? 'selected' : ''}"
                  onclick="selectAnswer(${currentQuestion}, ${oi}, this)">
            ${opt}
          </button>
        `).join('')}
      </div>
    </div>`;
  if (selectedAnswers[currentQuestion] !== undefined) return;
  let rem = BT * 10;
  const fill = document.getElementById('blitzFill'), label = document.getElementById('blitzCount');
  blitzInterval = setInterval(() => {
    rem--;
    const pct = (rem / (BT * 10)) * 100;
    if (fill) fill.style.width = pct + '%';
    if (label) label.textContent = Math.ceil(rem / 10);
    if (rem <= 30) {
      if (fill) fill.classList.add('urgent');
      if (label) label.classList.add('urgent');
    }
    if (rem <= 0) {
      clearInterval(blitzInterval); blitzInterval = null;
      if (selectedAnswers[currentQuestion] === undefined) {
        const ri = Math.floor(Math.random() * q.options.length);
        selectedAnswers[currentQuestion] = ri;
        document.getElementById('quizNextBtn').disabled = false;
        const btns = document.querySelectorAll('.blitz-mode .answer-opt');
        if (btns[ri]) btns[ri].classList.add('selected');
        if (label) { label.textContent = '\u23F0'; label.style.fontSize = '36px'; }
      }
    }
  }, 100);
}

// --- SWIPE ---
let swipeDeckData = [];
function renderSwipe(body, q) {
  swipeDeckData = q.options.map((opt, i) => ({ text: opt, index: i }));
  const prev = selectedAnswers[currentQuestion];
  body.innerHTML = `
    <div class="question-card" key="${currentQuestion}">
      <div class="mode-badge">${MODE_LABELS.swipe}</div>
      <div class="question-text" style="font-size:19px">${q.q}</div>
      <div class="swipe-deck" id="swipeDeck"></div>
      <div class="swipe-hint">\u2190 skip \u00B7 swipe right to pick \u2192</div>
    </div>`;
  const deck = document.getElementById('swipeDeck');
  for (let i = swipeDeckData.length - 1; i >= 0; i--) {
    const card = document.createElement('div');
    card.className = 'swipe-card';
    card.textContent = swipeDeckData[i].text;
    card.style.zIndex = swipeDeckData.length - i;
    const d = swipeDeckData.length - 1 - i;
    card.style.transform = `scale(${1 - d * 0.04}) translateY(${d * 6}px)`;
    card.dataset.optIndex = i;
    deck.appendChild(card);
  }
  if (prev !== undefined) {
    deck.innerHTML = `<div class="swipe-card" style="border-color:var(--accent-1);box-shadow:0 0 24px var(--accent-1-glow)">${q.options[prev]}</div>`;
    return;
  }
  initSwipeDeckGestures(deck);
}

function initSwipeDeckGestures(deck) {
  const cards = Array.from(deck.querySelectorAll('.swipe-card'));
  let topIdx = 0;
  function attachSwipe(card) {
    let startX = 0, dx = 0, dragging = false;
    const onStart = (e) => {
      const pt = e.touches ? e.touches[0] : e;
      startX = pt.clientX; dragging = true;
      card.style.transition = 'none';
    };
    const onMove = (e) => {
      if (!dragging) return;
      const pt = e.touches ? e.touches[0] : e;
      dx = pt.clientX - startX;
      card.style.transform = `translateX(${dx}px) rotate(${dx * 0.08}deg)`;
      if (!card.querySelector('.pick-indicator')) {
        card.insertAdjacentHTML('afterbegin',
          '<div class="swipe-indicator pick pick-indicator">PICK</div><div class="swipe-indicator nope nope-indicator">SKIP</div>');
      }
      const pi = card.querySelector('.pick-indicator'), ni = card.querySelector('.nope-indicator');
      if (pi) pi.style.opacity = Math.max(0, Math.min(1, dx / 80));
      if (ni) ni.style.opacity = Math.max(0, Math.min(1, -dx / 80));
    };
    const onEnd = () => {
      if (!dragging) return;
      dragging = false;
      card.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
      if (dx > 70) {
        card.style.transform = 'translateX(400px) rotate(20deg)';
        card.style.opacity = '0';
        const oi = parseInt(card.dataset.optIndex);
        selectedAnswers[currentQuestion] = oi;
        document.getElementById('quizNextBtn').disabled = false;
        setTimeout(() => {
          deck.innerHTML = `<div class="swipe-card" style="border-color:var(--accent-1);box-shadow:0 0 24px var(--accent-1-glow);opacity:0;animation:cardIn 0.3s ease forwards">${swipeDeckData[oi].text}</div>`;
        }, 250);
      } else if (dx < -70) {
        card.style.transform = 'translateX(-400px) rotate(-20deg)';
        card.style.opacity = '0';
        topIdx++;
        if (topIdx >= cards.length) {
          topIdx = 0;
          setTimeout(() => { renderSwipe(document.getElementById('quizBody'), questions[currentQuestion]); }, 300);
        }
      } else {
        card.style.transform = '';
        const pi = card.querySelector('.pick-indicator'), ni = card.querySelector('.nope-indicator');
        if (pi) pi.style.opacity = '0';
        if (ni) ni.style.opacity = '0';
      }
      dx = 0;
    };
    card.addEventListener('touchstart', onStart, { passive: true });
    card.addEventListener('touchmove', onMove, { passive: true });
    card.addEventListener('touchend', onEnd);
    card.addEventListener('mousedown', onStart);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onEnd);
  }
  cards.forEach(c => attachSwipe(c));
}

function selectAnswer(qIndex, answer, el) {
  selectedAnswers[qIndex] = answer;
  if (el && el.parentElement) {
    el.parentElement.querySelectorAll('.answer-opt').forEach(b => b.classList.remove('selected'));
    el.classList.add('selected');
  }
  document.getElementById('quizNextBtn').disabled = false;
  if (blitzInterval) { clearInterval(blitzInterval); blitzInterval = null; }
}

function nextQuestion() {
  if (selectedAnswers[currentQuestion] === undefined) return;

  if (currentQuestion === questions.length - 1) {
    document.getElementById('submitModal').classList.add('show');
    return;
  }

  currentQuestion++;
  renderQuestion();
}

function prevQuestion() {
  if (currentQuestion > 0) {
    currentQuestion--;
    renderQuestion();
  }
}

function confirmQuit() {
  goTo('home');
}

function closeModal() {
  document.getElementById('submitModal').classList.remove('show');
}

// Session delete
let pendingDeleteCode = null;

function initSwipeToDelete() {
  document.querySelectorAll('.session-card-wrap').forEach(wrap => {
    const card = wrap.querySelector('.session-card');
    let startX = 0, currentX = 0, dragging = false;

    card.addEventListener('touchstart', e => {
      startX = e.touches[0].clientX;
      currentX = startX;
      dragging = true;
      card.style.transition = 'none';
    }, { passive: true });

    card.addEventListener('touchmove', e => {
      if (!dragging) return;
      currentX = e.touches[0].clientX;
      const dx = Math.min(0, currentX - startX);
      if (dx < -10) {
        card.style.transform = `translateX(${Math.max(dx, -80)}px)`;
      }
    }, { passive: true });

    card.addEventListener('touchend', () => {
      dragging = false;
      card.style.transition = '';
      const dx = currentX - startX;
      if (dx < -40) {
        wrap.classList.add('swiped');
        card.style.transform = '';
        closeSiblingSwipes(wrap);
      } else {
        wrap.classList.remove('swiped');
        card.style.transform = '';
      }
    });
  });

  // Click outside to close any swiped card
  document.addEventListener('click', e => {
    if (!e.target.closest('.session-card-wrap')) {
      document.querySelectorAll('.session-card-wrap.swiped').forEach(w => w.classList.remove('swiped'));
    }
  });
}

function closeSiblingSwipes(except) {
  document.querySelectorAll('.session-card-wrap.swiped').forEach(w => {
    if (w !== except) w.classList.remove('swiped');
  });
}

function openDeleteModal(code) {
  pendingDeleteCode = code;
  document.getElementById('deleteModal').classList.add('show');
}

function closeDeleteModal() {
  document.getElementById('deleteModal').classList.remove('show');
  pendingDeleteCode = null;
}

function getHiddenSessions() {
  try { return JSON.parse(localStorage.getItem('bs-hidden-sessions') || '[]'); } catch { return []; }
}

function hideSession(code) {
  const hidden = getHiddenSessions();
  if (!hidden.includes(code)) {
    hidden.push(code);
    localStorage.setItem('bs-hidden-sessions', JSON.stringify(hidden));
  }
}

function confirmDeleteSession() {
  if (!pendingDeleteCode) return;
  const code = pendingDeleteCode;
  closeDeleteModal();

  // Persist in localStorage
  hideSession(code);

  const wrap = document.querySelector(`.session-card-wrap[data-code="${code}"]`);
  if (wrap) {
    wrap.classList.add('removing');
    wrap.addEventListener('animationend', () => wrap.remove());
  }

  // Remove from cached sessions
  if (_cachedSessions) {
    _cachedSessions = _cachedSessions.filter(s => s.code !== code);
  }

  // Re-render if all sessions removed
  if (_cachedSessions && _cachedSessions.length === 0) {
    renderHomeSessions();
  }
}

async function submitAnswers() {
  closeModal();
  document.getElementById('quizProgress').style.width = '100%';

  if (currentSession) {
    try {
      const data = await blindApi.submitAnswers(currentSession.code, selectedAnswers);
      if (data.error) {
        alert('Failed to submit: ' + data.error);
        return;
      }
      if (data.both_done) {
        goTo('reveal');
        runCountdown();
        return;
      }
    } catch (e) {
      alert('Could not submit answers. Check your connection and try again.');
      return;
    }
  }

  // Go to waiting screen
  goTo('waiting');
  if (currentSession) {
    document.getElementById('waitingCode').textContent = currentSession.code;
    const partner = currentSession.creator_id === currentUser?.id
      ? currentSession.partner_username
      : currentSession.creator_username;
    document.getElementById('waitingDesc').innerHTML = partner
      ? `waiting for <strong style="color:var(--text)">${partner}</strong> to finish answering...`
      : 'waiting for your partner to join and answer...';
    startPolling();
  }
}

function startPolling() {
  stopPolling();
  document.getElementById('waitingStatus').textContent = 'checking...';

  pollTimer = setInterval(async () => {
    if (!currentSession) return;
    try {
      const data = await blindApi.getSession(currentSession.code);
      const s = data.session;
      currentSession = s;

      if (s.status === 'complete' || (s.user_submitted && s.partner_submitted)) {
        stopPolling();
        document.getElementById('waitingStatus').textContent = 'both done!';
        setTimeout(() => {
          goTo('reveal');
          runCountdown();
        }, 500);
      } else if (s.partner_submitted) {
        document.getElementById('waitingStatus').textContent = 'partner is done! waiting for you...';
      } else if (s.partner_id) {
        const pName = s.creator_id === currentUser?.id ? s.partner_username : s.creator_username;
        document.getElementById('waitingStatus').textContent = (pName || 'partner') + ' is answering...';
        document.getElementById('waitingDesc').innerHTML =
          `waiting for <strong style="color:var(--text)">${pName || 'partner'}</strong> to finish answering...`;
      } else {
        document.getElementById('waitingStatus').textContent = 'waiting for partner to join...';
      }
    } catch (e) { /* silent */ }
  }, 3000);
}

function stopPolling() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

// Reveal
function startReveal() {
  goTo('reveal');
  runCountdown();
}

function runCountdown() {
  const container = document.getElementById('revealCountdown');
  let count = 3;
  container.classList.remove('hidden');

  function showNum() {
    if (count > 0) {
      container.innerHTML = `
        <div class="countdown-num" key="${count}">${count}</div>
        <div class="countdown-label">${i18n.t('reveal_get_ready')}</div>
      `;
      count--;
      setTimeout(showNum, 800);
    } else {
      // Skip per-card reveal, go straight to receipt
      if (currentSession) {
        goTo('results');
        buildReceiptFromApi(currentSession.code);
      } else {
        goTo('results');
        buildReceipt();
      }
    }
  }
  showNum();
}

// Per-question reveal flow
let revealIndex = 0;
let revealData = [];

const matchReactions = [
  { emoji: '🔥', text: 'same wavelength!' },
  { emoji: '🧠', text: 'telepathic!' },
  { emoji: '💫', text: 'in sync!' },
  { emoji: '🎯', text: 'bullseye!' },
  { emoji: '⚡', text: 'connected!' },
];
const diffReactions = [
  { emoji: '👀', text: 'plot twist' },
  { emoji: '😏', text: 'interesting...' },
  { emoji: '🌀', text: 'different worlds' },
  { emoji: '🤷', text: 'agree to disagree' },
  { emoji: '💭', text: 'now you know' },
];

function showRevealCards() {
  revealIndex = 0;
  revealData = questions.map((q, i) => {
    const userIdx = selectedAnswers[i] != null ? selectedAnswers[i] : 0;
    const partnerIdx = q.partnerAnswerIndex;
    return { q: q.q, userAns: q.options[userIdx], partnerAns: q.options[partnerIdx], matched: userIdx === partnerIdx };
  });
  showRevealCard(0);
}

function showRevealCard(idx) {
  if (idx >= revealData.length) {
    goTo('results');
    setTimeout(buildReceipt, 300);
    return;
  }

  const container = document.getElementById('revealCardsContainer');
  const d = revealData[idx];
  const reaction = d.matched
    ? matchReactions[idx % matchReactions.length]
    : diffReactions[idx % diffReactions.length];

  // Remove old card
  const old = container.querySelector('.reveal-fullscreen.active');
  if (old) {
    old.classList.remove('active');
    old.classList.add('exit');
    setTimeout(() => old.remove(), 400);
  }

  const card = document.createElement('div');
  card.className = 'reveal-fullscreen';
  card.innerHTML = `
    <div class="reveal-q-num">${i18n.t('reveal_question_of').replace('{n}', idx + 1).replace('{total}', revealData.length)}</div>
    <div class="reveal-question">${d.q}</div>
    <div class="reveal-vs-block">
      <div class="reveal-vs-card you-card">
        <div class="rv-label">${i18n.t('reveal_you')}</div>
        <div class="rv-answer rv-answer-hidden" id="revYou${idx}">• • •</div>
      </div>
      <div class="reveal-vs-card them-card">
        <div class="rv-label">Alex</div>
        <div class="rv-answer rv-answer-hidden" id="revThem${idx}">• • •</div>
      </div>
    </div>
    <div class="reveal-reaction" id="revReaction${idx}">
      <span class="reaction-emoji">${reaction.emoji}</span>
      <div class="reaction-text ${d.matched ? 'matched-text' : 'diff-text'}">${reaction.text}</div>
    </div>
    <div class="reveal-tap-hint" id="revHint${idx}">${i18n.t('reveal_tap_reveal')}</div>
    ${d.matched ? '<div class="card-confetti" id="revConfetti' + idx + '"></div>' : ''}
  `;
  container.appendChild(card);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => card.classList.add('active'));
  });

  let tapState = 0; // 0=show answers, 1=next
  card.onclick = () => {
    if (tapState === 0) {
      // Reveal answers
      const youEl = document.getElementById(`revYou${idx}`);
      const themEl = document.getElementById(`revThem${idx}`);
      const hintEl = document.getElementById(`revHint${idx}`);
      youEl.textContent = d.userAns;
      youEl.classList.remove('rv-answer-hidden');
      themEl.textContent = d.partnerAns;
      themEl.classList.remove('rv-answer-hidden');
      youEl.style.animation = 'countPop 0.35s ease';
      themEl.style.animation = 'countPop 0.35s ease 0.1s both';

      // Show reaction
      setTimeout(() => {
        const reactionEl = document.getElementById(`revReaction${idx}`);
        if (reactionEl) reactionEl.classList.add('pop');
        if (d.matched) {
          burstCardConfetti(`revConfetti${idx}`);
        }
      }, 300);

      hintEl.textContent = i18n.t('reveal_tap_continue');
      tapState = 1;
    } else {
      revealIndex++;
      showRevealCard(revealIndex);
    }
  };
}

function burstCardConfetti(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const colors = ['#7C3AED', '#EC4899', '#84CC16', '#F97316', '#06B6D4'];
  for (let i = 0; i < 24; i++) {
    const p = document.createElement('div');
    p.className = 'card-confetti-piece';
    const size = 4 + Math.random() * 5;
    const angle = (Math.PI * 2 * i) / 24;
    const dist = 60 + Math.random() * 80;
    const tx = Math.cos(angle) * dist;
    const ty = Math.sin(angle) * dist;
    p.style.cssText = `
      width:${size}px;height:${size}px;
      background:${colors[i % colors.length]};
      left:50%;top:50%;
      transform:translate(-50%,-50%);
      animation: cardConfettiBurst 0.8s ease-out forwards;
    `;
    // Override animation with custom end position
    p.animate([
      { transform: 'translate(-50%,-50%) scale(1)', opacity: 1 },
      { transform: `translate(calc(-50% + ${tx}px), calc(-50% + ${ty}px)) scale(0)`, opacity: 0 }
    ], { duration: 600 + Math.random() * 400, easing: 'cubic-bezier(0,0.5,0.5,1)', fill: 'forwards' });
    el.appendChild(p);
  }
}

// Confetti
function spawnConfetti() {
  const container = document.getElementById('confetti');
  const colors = ['#7C3AED', '#EC4899', '#84CC16', '#F97316', '#06B6D4', '#fff'];

  for (let i = 0; i < 60; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    piece.style.left = Math.random() * 100 + '%';
    piece.style.background = colors[Math.floor(Math.random() * colors.length)];
    piece.style.animationDuration = (1.5 + Math.random() * 2) + 's';
    piece.style.animationDelay = Math.random() * 0.5 + 's';
    piece.style.width = (5 + Math.random() * 6) + 'px';
    piece.style.height = (8 + Math.random() * 10) + 'px';
    piece.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
    container.appendChild(piece);
  }
  setTimeout(() => { container.innerHTML = ''; }, 4000);
}

// Vibe Receipt builder

// ==================== AI VIBE REPORT ====================
function getVibeReportLoadingHtml() {
  return `
    <div class="vibe-report">
      <div class="vibe-report-inner vibe-report-loading">
        <div class="vibe-skel vibe-skel-badge"></div>
        <div class="vibe-skel vibe-skel-title"></div>
        <div class="vibe-skel vibe-skel-line"></div>
        <div class="vibe-skel vibe-skel-line"></div>
        <div class="vibe-skel vibe-skel-line short"></div>
        <div style="height:12px"></div>
        <div class="vibe-skel vibe-skel-award"></div>
        <div class="vibe-skel vibe-skel-award"></div>
        <div class="vibe-skel vibe-skel-award"></div>
        <div style="height:12px"></div>
        <div class="vibe-skel vibe-skel-metaphor"></div>
        <div class="vibe-loading-hint">ai is reading your vibes...</div>
      </div>
    </div>
  `;
}

function renderVibeReport(report) {
  const awardsHtml = (report.superlatives || []).map(s => `
    <div class="vibe-award">
      <div class="vibe-award-icon">${s.icon}</div>
      <div class="vibe-award-content">
        <div class="vibe-award-label">${s.label}</div>
        <div class="vibe-award-text">${s.text}</div>
      </div>
    </div>
  `).join('');

  return `
    <div class="vibe-report" id="vibeReportCard">
      <div class="vibe-report-inner">
        <div class="vibe-report-badge">AI Vibe Report</div>
        <div class="vibe-report-headline">${report.headline}</div>
        <div class="vibe-report-narrative">${report.narrative}</div>
        <div class="vibe-superlatives">${awardsHtml}</div>
        <div class="vibe-metaphor">
          <div class="vibe-metaphor-label">${report.metaphor_label || 'Your Duo Archetype'}</div>
          <div class="vibe-metaphor-text">${report.metaphor}</div>
          <div class="vibe-metaphor-desc">${report.metaphor_desc}</div>
        </div>
      </div>
    </div>
  `;
}

async function generateVibeReport(data, partnerName, pct, packKey) {
  const lang = localStorage.getItem('bs-lang') || 'en';
  const langNames = { en: 'English', tr: 'Turkish', es: 'Spanish', th: 'Thai' };

  const qaList = data.map((d, i) =>
    `Q${i+1}: "${d.q}" — You: "${d.userAns}", ${partnerName}: "${d.partnerAns}" [${d.matched ? 'MATCH' : 'DIFFERENT'}]`
  ).join('\n');

  const prompt = `You are a witty, warm, Gen-Z-friendly personality analyst for a blind compatibility quiz app called "blindside."

Two people answered the same questions without seeing each other's answers. Here are the results:

Players: "You" & "${partnerName}"
Pack: ${packKey || 'general'}
Match rate: ${pct}%
Questions & Answers:
${qaList}

Generate a fun, creative, shareable "Vibe Report" in JSON format. Respond in ${langNames[lang] || 'English'}.

Requirements:
- "headline": A punchy, creative 4-8 word title for their dynamic (not generic — reference specific answers if possible)
- "narrative": 2-3 sentences. Be specific about their actual answers. Use <strong> tags for emphasis on key phrases. Be warm but funny. Reference actual surprising matches or funny differences.
- "superlatives": Array of exactly 3 fun awards. Each has:
  - "icon": a single emoji
  - "label": short award category (e.g. "Most Aligned On", "Biggest Plot Twist", "The One That Hurt")
  - "text": 1 short sentence referencing actual Q&A
- "metaphor": A creative duo archetype/metaphor (e.g. "The Jazz Duo", "Chaotic Roommates", "The Brain Cell Sharers")
- "metaphor_label": Short label like "Your Duo Archetype" (translated)
- "metaphor_desc": 1 sentence explaining the metaphor, tied to their actual answers

Be creative, funny, specific. Do NOT be generic. Reference their actual answers. Keep it light and shareable.
Return ONLY valid JSON, no markdown fences.`;

  try {
    const res = await fetch(`${API_URL}/claude?nocache=1`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': 'blindside-vibes' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 800,
        messages: [{ role: 'user', content: prompt }]
      })
    });
    const result = await res.json();
    const text = result?.content?.[0]?.text;
    if (!text) return null;
    // Parse JSON — handle potential markdown fences
    const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    return JSON.parse(cleaned);
  } catch (e) {
    console.error('AI vibe report failed:', e);
    return null;
  }
}

async function loadVibeReport(data, partnerName, pct, packKey) {
  const container = document.getElementById('vibeReportSlot');
  if (!container) return;
  const report = await generateVibeReport(data, partnerName, pct, packKey);
  if (report && report.headline) {
    container.innerHTML = renderVibeReport(report);
  } else {
    // Remove the loading skeleton on failure
    container.innerHTML = '';
  }
}

async function buildReceiptFromApi(code) {
  const scroll = document.getElementById('storyScroll');
  scroll.innerHTML = '<div style="text-align:center;padding:60px 20px;color:var(--text-dim)"><div class="dot-pulse" style="margin:0 auto"></div><p style="margin-top:16px">loading results...</p></div>';

  try {
    const result = await blindApi.getResults(code);
    if (result.error) {
      scroll.innerHTML = '<div style="text-align:center;padding:60px 20px;color:var(--text-dim)"><p>could not load results</p><button class="btn btn-ghost" onclick="goTo(\'home\')">back home</button></div>';
      return;
    }

    const s = result.session;
    const answers = result.answers;
    const isCreator = currentUser && s.creator_id === currentUser.id;
    const myId = currentUser?.id;
    const partnerId = isCreator ? s.partner_id : s.creator_id;
    const partnerName = isCreator ? s.partner_username : s.creator_username;

    // Build reveal data from real answers — compare by index, display in viewer's language
    // Helper: parse answer as option index if it's a number (int or float like 0.0)
    function toIdx(raw) {
      if (typeof raw === 'number') return Math.round(raw);
      if (typeof raw === 'string' && /^\d+(\.\d+)?$/.test(raw.trim())) return Math.round(parseFloat(raw));
      return null;
    }
    revealData = questions.map((q, i) => {
      const qAnswers = answers[i] || {};
      const rawUser = qAnswers[myId] != null ? qAnswers[myId] : (selectedAnswers[i] != null ? selectedAnswers[i] : '?');
      const rawPartner = qAnswers[partnerId] != null ? qAnswers[partnerId] : '?';
      const userIdx = toIdx(rawUser);
      const partnerIdx = toIdx(rawPartner);
      const userAns = userIdx != null && q.options[userIdx] ? q.options[userIdx] : String(rawUser);
      const partnerAns = partnerIdx != null && q.options[partnerIdx] ? q.options[partnerIdx] : String(rawPartner);
      const matched = (userIdx != null && partnerIdx != null) ? userIdx === partnerIdx : userAns === partnerAns;
      return { q: q.q, userAns, partnerAns, matched };
    });

    buildReceiptWithName(partnerName || 'partner');
  } catch (e) {
    console.error('Failed to load results:', e);
    scroll.innerHTML = '<div style="text-align:center;padding:60px 20px;color:var(--text-dim)"><p>could not load results</p><button class="btn btn-ghost" onclick="goTo(\'home\')">back home</button></div>';
  }
}

function buildReceiptWithName(partnerName) {
  const data = revealData;
  const matches = data.filter(d => d.matched).length;
  const total = data.length;
  const pct = Math.round((matches / total) * 100);
  const vibeLabels = [
    { min: 0,  emoji: '🫠', title: 'Wildly Different', desc: 'opposites attract...right?', intro: 'Well, this was... <strong>eventful</strong>. You two see the world through very different lenses — and honestly, that might be the most interesting part.' },
    { min: 20, emoji: '🌀', title: 'Unpredictable Duo', desc: 'never a boring moment', intro: 'You two are <strong>unpredictable</strong> in the best way. Not always on the same page, but always an interesting read.' },
    { min: 40, emoji: '🤝', title: 'Getting There', desc: 'common ground exists', intro: 'There\'s real <strong>overlap</strong> here — and where there isn\'t, there\'s curiosity. That counts for a lot.' },
    { min: 60, emoji: '💜', title: 'Real Ones', desc: 'you get each other', intro: 'You two <strong>get each other</strong>. Not perfectly, not always — but more than most. And the differences? That\'s where the good conversations live.' },
    { min: 80, emoji: '🔮', title: 'Mind Readers', desc: 'basically the same person', intro: 'OK this is getting <strong>suspicious</strong>. You two are answering like you share a brain. Who copied who?' },
    { min: 100, emoji: '👽', title: 'Literally Telepathic', desc: 'this is actually scary', intro: '<strong>Every. Single. One.</strong> You matched on all of them. This is either beautiful or terrifying. Probably both.' },
  ];
  const vibe = [...vibeLabels].reverse().find(v => pct >= v.min);
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  let chaptersHtml = '';
  data.forEach((d, i) => {
    chaptersHtml += `
      <div class="story-chapter">
        <div class="ch-num">${i + 1} ${i18n.t('results_of')} ${total}</div>
        <div class="ch-question">${d.q}</div>
        <div class="ch-answers">
          <div class="ch-ans ch-you">
            <div class="ch-label">${i18n.t('results_you')}</div>
            <div class="ch-text">${d.userAns}</div>
          </div>
          <div class="ch-ans ch-them">
            <div class="ch-label">${partnerName}</div>
            <div class="ch-text">${d.partnerAns}</div>
          </div>
        </div>
      </div>
    `;
  });

  const scroll = document.getElementById('storyScroll');
  scroll.innerHTML = `
    <div class="story-hero">
      <div class="story-hero-top">
        <div class="story-hero-emoji">${vibe.emoji}</div>
        <div class="story-hero-score">${pct}%</div>
      </div>
      <div class="story-hero-vibe">${vibe.title}</div>
      <div class="story-hero-sub">${vibe.desc}</div>
      <div class="story-hero-names">${i18n.t('results_you')} & ${partnerName}</div>
    </div>
    <div class="story-intro"><p>${vibe.intro}</p></div>
    <!-- <div id="vibeReportSlot">${getVibeReportLoadingHtml()}</div> -->
    ${chaptersHtml}
    <div class="story-outro">
      <div class="story-stats">
        <div><div class="story-stat-val">${matches}</div><div class="story-stat-lbl">${i18n.t('results_matches')}</div></div>
        <div><div class="story-stat-val">${total - matches}</div><div class="story-stat-lbl">${i18n.t('results_plot_twists')}</div></div>
        <div><div class="story-stat-val">${pct}%</div><div class="story-stat-lbl">${i18n.t('results_sync_rate')}</div></div>
      </div>
      <div class="story-brand">blindside.</div>
      <div class="story-date">${dateStr}</div>
    </div>
    <div class="story-actions">
      <button class="btn-share" onclick="shareReceipt()">${i18n.t('results_share')}</button>
      <button class="btn btn-primary" style="width:100%" onclick="goTo('packs')">${i18n.t('results_play_another')}</button>
      <button class="btn btn-ghost" onclick="goTo('home');loadHomeSessions()">${i18n.t('results_back_home')}</button>
    </div>
  `;
  scroll.scrollTop = 0;
  spawnConfetti();
  // AI vibe report disabled for now
  // loadVibeReport(data, partnerName, pct, selectedPackKey);
}

function buildReceipt() {
  const data = revealData.length ? revealData : questions.map((q, i) => {
    const userIdx = selectedAnswers[i] != null ? selectedAnswers[i] : 0;
    const partnerIdx = q.partnerAnswerIndex;
    return { q: q.q, userAns: q.options[userIdx], partnerAns: q.options[partnerIdx], matched: userIdx === partnerIdx };
  });

  const matches = data.filter(d => d.matched).length;
  const total = data.length;
  const pct = Math.round((matches / total) * 100);

  const vibeLabels = [
    { min: 0,  emoji: '🫠', title: 'Wildly Different', desc: 'opposites attract...right?', intro: 'Well, this was... <strong>eventful</strong>. You two see the world through very different lenses — and honestly, that might be the most interesting part.' },
    { min: 20, emoji: '🌀', title: 'Unpredictable Duo', desc: 'never a boring moment', intro: 'You two are <strong>unpredictable</strong> in the best way. Not always on the same page, but always an interesting read.' },
    { min: 40, emoji: '🤝', title: 'Getting There', desc: 'common ground exists', intro: 'There\'s real <strong>overlap</strong> here — and where there isn\'t, there\'s curiosity. That counts for a lot.' },
    { min: 60, emoji: '💜', title: 'Real Ones', desc: 'you get each other', intro: 'You two <strong>get each other</strong>. Not perfectly, not always — but more than most. And the differences? That\'s where the good conversations live.' },
    { min: 80, emoji: '🔮', title: 'Mind Readers', desc: 'basically the same person', intro: 'OK this is getting <strong>suspicious</strong>. You two are answering like you share a brain. Who copied who?' },
    { min: 100, emoji: '👽', title: 'Literally Telepathic', desc: 'this is actually scary', intro: '<strong>Every. Single. One.</strong> You matched on all of them. This is either beautiful or terrifying. Probably both.' },
  ];
  const vibe = [...vibeLabels].reverse().find(v => pct >= v.min);

  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  // Build chapters
  let chaptersHtml = '';
  data.forEach((d, i) => {
    chaptersHtml += `
      <div class="story-chapter">
        <div class="ch-num">${i + 1} ${i18n.t('results_of')} ${total}</div>
        <div class="ch-question">${d.q}</div>
        <div class="ch-answers">
          <div class="ch-ans ch-you">
            <div class="ch-label">${i18n.t('results_you')}</div>
            <div class="ch-text">${d.userAns}</div>
          </div>
          <div class="ch-ans ch-them">
            <div class="ch-label">alex</div>
            <div class="ch-text">${d.partnerAns}</div>
          </div>
        </div>
      </div>
    `;
  });

  const scroll = document.getElementById('storyScroll');
  scroll.innerHTML = `
    <div class="story-hero">
      <div class="story-hero-top">
        <div class="story-hero-emoji">${vibe.emoji}</div>
        <div class="story-hero-score">${pct}%</div>
      </div>
      <div class="story-hero-vibe">${vibe.title}</div>
      <div class="story-hero-sub">${vibe.desc}</div>
      <div class="story-hero-names">${i18n.t('results_you')} & Alex</div>
    </div>

    <div class="story-intro">
      <p>${vibe.intro}</p>
    </div>

    <!-- <div id="vibeReportSlot">${getVibeReportLoadingHtml()}</div> -->

    ${chaptersHtml}

    <div class="story-outro">
      <div class="story-stats">
        <div>
          <div class="story-stat-val">${matches}</div>
          <div class="story-stat-lbl">${i18n.t('results_matches')}</div>
        </div>
        <div>
          <div class="story-stat-val">${total - matches}</div>
          <div class="story-stat-lbl">${i18n.t('results_plot_twists')}</div>
        </div>
        <div>
          <div class="story-stat-val">${pct}%</div>
          <div class="story-stat-lbl">${i18n.t('results_sync_rate')}</div>
        </div>
      </div>
      <div class="story-brand">blindside.</div>
      <div class="story-date">${dateStr}</div>
    </div>

    <div class="story-actions">
      <button class="btn-share" onclick="shareReceipt()">${i18n.t('results_share')}</button>
      <button class="btn btn-primary" style="width:100%" onclick="goTo('packs')">${i18n.t('results_play_another')}</button>
      <button class="btn btn-ghost" onclick="goTo('home')">${i18n.t('results_back_home')}</button>
    </div>
  `;

  scroll.scrollTop = 0;
  spawnConfetti();
  // AI vibe report disabled for now
  // loadVibeReport(data, 'Alex', pct, selectedPackKey);
}

function shareReceipt() {
  if (navigator.share) {
    navigator.share({
      title: 'blindside. vibe check',
      text: 'We just did a blind reveal — check our results!',
    }).catch(() => {});
  } else {
    const btn = event.target;
    btn.textContent = i18n.t('feedback_link_copied');
    setTimeout(() => { btn.innerHTML = i18n.t('results_share'); }, 2000);
  }
}

// Keep animateResults as alias for backward compat
function animateResults() { buildReceipt(); }

// ==================== INIT: URL JOIN + AUTO-LOGIN ====================
(function init() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('join');

  if (code) {
    joinCode = code;
    if (currentUser) {
      // Already logged in, join directly
      handleJoinCode(code);
      joinCode = null;
    } else {
      // Need to auth first
      goTo('auth');
      setTimeout(() => document.getElementById('authUsername')?.focus(), 300);
    }
    // Clean URL
    window.history.replaceState({}, '', window.location.pathname);
  } else if (currentUser) {
    // Auto-login: skip splash, go to home
    goTo('home');
  }
})();
