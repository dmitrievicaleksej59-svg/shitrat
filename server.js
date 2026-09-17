const express = require('express');
const http = require('http');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const socketIO = require('socket.io');
const path = require('path');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIO(server, { cors: { origin: "*" } });

app.use(cors());
app.use(express.json({ limit: '15mb' }));
app.use(express.static(path.join(__dirname)));

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/shitrat';
mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ Подключено к MongoDB'))
    .catch(err => console.error('❌ Ошибка MongoDB:', err.message));

// ============ МОДЕЛИ ============
const UserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true, trim: true },
    usernameLower: { type: String, unique: true, sparse: true },
    password: { type: String, required: true },
    emoji: { type: String, default: '🐀' },
    avatar: { type: String, default: '' },
    role: { type: String, default: 'USER' },
    firstName: { type: String, default: '' },
    lastName: { type: String, default: '' },
    bio: { type: String, default: '' },
    phone: { type: String, default: '' },
    birthday: { type: Date, default: null },
    isBanned: { type: Boolean, default: false },
    banReason: { type: String, default: '' },
    lastSeen: { type: Date, default: Date.now },
    isOnline: { type: Boolean, default: false },
    privacy: { lastSeen: { type: String, default: 'everybody' }, profilePhoto: { type: String, default: 'everybody' }, calls: { type: String, default: 'everybody' }, forwardMessages: { type: String, default: 'everybody' }, groups: { type: String, default: 'everybody' } },
    notifications: { privateChats: { type: Boolean, default: true }, groupChats: { type: Boolean, default: true }, sounds: { type: Boolean, default: true }, vibration: { type: Boolean, default: true }, preview: { type: Boolean, default: true } },
    chatSettings: { theme: { type: String, default: 'day' }, fontSize: { type: Number, default: 16 }, wallpaper: { type: String, default: 'default' }, messageCorner: { type: String, default: 'round' } },
    language: { type: String, default: 'ru' },
    twoFA: { enabled: { type: Boolean, default: false }, password: { type: String, default: '' } },
    contacts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    // Звёзды
    stars: { type: Number, default: 100 },
    totalStarsSpent: { type: Number, default: 0 },
    totalStarsEarned: { type: Number, default: 0 },
    lastDailyBonus: { type: Date, default: null },
    lastOnlineAt: { type: Date, default: Date.now },
    
    createdAt: { type: Date, default: Date.now }
});

const SessionSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    deviceType: { type: String, default: 'web' },
    platform: { type: String, default: 'Web' },
    browser: { type: String, default: 'Unknown' },
    ip: { type: String, default: '' },
    token: { type: String, required: true },
    isCurrent: { type: Boolean, default: false },
    lastActive: { type: Date, default: Date.now },
    createdAt: { type: Date, default: Date.now }
});

const ChatSchema = new mongoose.Schema({
    name: { type: String, required: true },
    type: { type: String, default: 'group' },
    creator: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    description: { type: String, default: '' },
    avatar: { type: String, default: '' },
    lastMessage: { type: mongoose.Schema.Types.ObjectId, ref: 'Message' },
    createdAt: { type: Date, default: Date.now }
});

const MessageSchema = new mongoose.Schema({
    chat: { type: mongoose.Schema.Types.ObjectId, ref: 'Chat', required: true },
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    content: { type: String, default: '' },
    image: { type: String, default: null },
    isDeleted: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

const GiftSchema = new mongoose.Schema({
    name: { type: String, required: true },
    emoji: { type: String, required: true },
    description: { type: String, default: '' },
    rarity: { type: String, default: 'common' },
    animation: { type: String, default: 'bounce' },
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true }
});

const UserGiftSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    gift: { type: mongoose.Schema.Types.ObjectId, ref: 'Gift', required: true },
    givenBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    message: { type: String, default: '' },
    isNew: { type: Boolean, default: true },
    receivedAt: { type: Date, default: Date.now }
});

const PostSchema = new mongoose.Schema({
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    content: { type: String, default: '' },
    image: { type: String, default: null },
    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    comments: [{ author: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, text: String, createdAt: { type: Date, default: Date.now } }],
    isPublic: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now }
});

const StorySchema = new mongoose.Schema({
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    image: { type: String, required: true },
    caption: { type: String, default: '' },
    views: [{ user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, viewedAt: { type: Date, default: Date.now } }],
    expiresAt: { type: Date, default: () => new Date(Date.now() + 24*60*60*1000), index: { expires: 0 } },
    createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', UserSchema);
const Session = mongoose.model('Session', SessionSchema);
const Chat = mongoose.model('Chat', ChatSchema);
const Message = mongoose.model('Message', MessageSchema);
const Gift = mongoose.model('Gift', GiftSchema);
const UserGift = mongoose.model('UserGift', UserGiftSchema);
const Post = mongoose.model('Post', PostSchema);
const Story = mongoose.model('Story', StorySchema);
// ============ ЗВЁЗДЫ ============

const StarTransactionSchema = new mongoose.Schema({
    from: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    to: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    amount: { type: Number, required: true },
    type: {
        type: String,
        enum: ['admin_grant', 'gift_purchase', 'post_reward', 'bonus', 'refund', 'bonus_daily'],
        default: 'admin_grant'
    },
    description: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now }
});

// ============ ФОРМЫ ПОДАРКОВ ============

const GiftFormSchema = new mongoose.Schema({
    name: { type: String, required: true },
    form: {
        type: String,
        enum: ['bear', 'rose', 'heart', 'star', 'cake', 'crown', 'diamond', 'rocket', 'clover', 'trophy', 'gift', 'ring'],
        required: true
    },
    color: { type: String, default: '#f39c12' },
    colorSecondary: { type: String, default: '#e67e22' },
    price: { type: Number, default: 10 },
    rarity: {
        type: String,
        enum: ['common', 'rare', 'epic', 'legendary', 'mythic'],
        default: 'common'
    },
    animation: {
        type: String,
        enum: ['bounce', 'spin', 'pulse', 'shake', 'float', 'rainbow'],
        default: 'bounce'
    },
    description: { type: String, default: '' },
    isActive: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now }
});

const GiftPurchaseSchema = new mongoose.Schema({
    buyer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    form: { type: mongoose.Schema.Types.ObjectId, ref: 'GiftForm', required: true },
    pricePaid: { type: Number, required: true },
    message: { type: String, default: '', maxlength: 200 },
    isAnonymous: { type: Boolean, default: false },
    isNew: { type: Boolean, default: true },
    purchasedAt: { type: Date, default: Date.now }
});

const ChatFolderSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true, maxlength: 30 },
    emoji: { type: String, default: '📁' },
    chats: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Chat' }],
    order: { type: Number, default: 0 },
    isDefault: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

const UserInterfaceSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    darkMode: { type: Boolean, default: false },
    theme: { type: String, enum: ['day', 'night', 'system'], default: 'day' },
    accentColor: { type: String, default: '#517da2' },
    fontSize: { type: Number, default: 16 },
    chatView: {
        type: String,
        enum: ['all', 'new', 'personal', 'groups', 'channels'],
        default: 'all'
    },
    searchTab: {
        type: String,
        enum: ['chats', 'channels', 'apps', 'posts', 'photos', 'videos', 'files', 'links', 'music', 'voice'],
        default: 'chats'
    },
    activeFolder: { type: mongoose.Schema.Types.ObjectId, ref: 'ChatFolder', default: null }
});

const StarTransaction = mongoose.model('StarTransaction', StarTransactionSchema);
const GiftForm = mongoose.model('GiftForm', GiftFormSchema);
const GiftPurchase = mongoose.model('GiftPurchase', GiftPurchaseSchema);
const ChatFolder = mongoose.model('ChatFolder', ChatFolderSchema);
const UserInterface = mongoose.model('UserInterface', UserInterfaceSchema);
// ============ ИНИЦИАЛИЗАЦИЯ ============
async function initializeCreator() {
    try {
        ...
        const creator = await User.findOne({ username: 'ShitRat_Creator' });
        if (!creator) {
            const hashed = await bcrypt.hash('ShitRat2024!', 12);
            const c = new User({
                username: 'ShitRat_Creator',
                usernameLower: 'shitrat_creator',
                password: hashed,
                emoji: '👑',
                role: 'CREATOR',
                firstName: 'Создатель',
                lastName: 'ShitRat',
                bio: 'Я создал этот мессенджер 🐀'
            });
            await c.save();
            console.log('👑 Создатель ShitRat инициализирован');

            const general = new Chat({ name: 'Общий чат', type: 'group', creator: c._id, members: [c._id], description: 'Добро пожаловать!' });
            await general.save();
            console.log('💬 Общий чат создан');

            const saved = new Chat({ name: 'Избранное', type: 'saved', creator: c._id, members: [c._id] });
            await saved.save();
        }
    } catch (e) { console.error('Ошибка инициализации:', e); }
}

async function initializeGifts() {
    try {

        const count = await Gift.countDocuments();
        if (count > 0) return;

        const gifts = [
            { name: 'Крыса-новичок', emoji: '🐀', description: 'Первый шаг', rarity: 'common', animation: 'bounce', order: 1 },
            { name: 'Сырная любовь', emoji: '🧀', description: 'Ням-ням', rarity: 'common', animation: 'pulse', order: 2 },
            { name: 'Крысиный король', emoji: '👑', description: 'Королевский статус', rarity: 'rare', animation: 'spin', order: 3 },
            { name: 'Огненная крыса', emoji: '🔥', description: 'Горячая штучка', rarity: 'rare', animation: 'shake', order: 4 },
            { name: 'Крыса-звезда', emoji: '⭐', description: 'Сияй ярко', rarity: 'epic', animation: 'rainbow', order: 5 },
            { name: 'Ледяная крыса', emoji: '❄️', description: 'Холодный ум', rarity: 'epic', animation: 'float', order: 6 },
            { name: 'Космическая крыса', emoji: '🚀', description: 'В космос!', rarity: 'legendary', animation: 'float', order: 7 },
            { name: 'Алмазная крыса', emoji: '💎', description: 'Бриллиант', rarity: 'legendary', animation: 'spin', order: 8 },
            { name: 'Королевская крыса', emoji: '🐭', description: 'Милота', rarity: 'rare', animation: 'bounce', order: 9 },
            { name: 'Крыса-легенда', emoji: '🏆', description: 'Достоин лучший', rarity: 'mythic', animation: 'rainbow', order: 10 },
            { name: 'Смертельная крыса', emoji: '💀', description: 'Опасный тип', rarity: 'epic', animation: 'shake', order: 11 },
            { name: 'Крыса-призрак', emoji: '👻', description: 'Бу!', rarity: 'rare', animation: 'float', order: 12 },
            { name: 'Любовь', emoji: '❤️', description: 'С любовью', rarity: 'common', animation: 'pulse', order: 13 },
            { name: 'Босс', emoji: '😎', description: 'Крутой', rarity: 'rare', animation: 'bounce', order: 14 },
            { name: 'Клоун', emoji: '🤡', description: 'Смешной', rarity: 'common', animation: 'shake', order: 15 },
            { name: 'Пришелец', emoji: '👽', description: 'Из космоса', rarity: 'epic', animation: 'float', order: 16 },
            { name: 'Дракон', emoji: '🐉', description: 'Легендарный', rarity: 'legendary', animation: 'spin', order: 17 },
            { name: 'Крыса-бог', emoji: '⚡', description: 'Божественная сила', rarity: 'mythic', animation: 'rainbow', order: 18 },
            { name: 'Крысиный трон', emoji: '🪑', description: 'Твоё место', rarity: 'common', animation: 'pulse', order: 19 },
            { name: 'Сокровище', emoji: '💰', description: 'Богатство', rarity: 'epic', animation: 'bounce', order: 20 }
        ];
        await Gift.insertMany(gifts);
        console.log('🎁 Подарки инициализированы: 20');
    } catch (e) { console.error('Ошибка подарков:', e); }
}
// ============ ИНИЦИАЛИЗАЦИЯ ФОРМ ПОДАРКОВ ============
async function initializeGiftForms() {
    try {
        const count = await GiftForm.countDocuments();
        if (count > 0) return;
        
        const forms = [
            {
                name: 'Роза',
                form: 'rose',
                color: '#e74c3c',
                colorSecondary: '#27ae60',
                price: 5,
                rarity: 'common',
                animation: 'pulse',
                description: 'Красная роза — символ любви',
                order: 1
            },
            {
                name: 'Сердце',
                form: 'heart',
                color: '#e91e63',
                colorSecondary: '#c2185b',
                price: 10,
                rarity: 'common',
                animation: 'pulse',
                description: 'Сердце от чистого сердца',
                order: 2
            },
            {
                name: 'Мишка',
                form: 'bear',
                color: '#d4a574',
                colorSecondary: '#a67c52',
                price: 15,
                rarity: 'common',
                animation: 'bounce',
                description: 'Милый плюшевый медвежонок',
                order: 3
            },
            {
                name: 'Звезда',
                form: 'star',
                color: '#f39c12',
                colorSecondary: '#e67e22',
                price: 25,
                rarity: 'rare',
                animation: 'spin',
                description: 'Сияющая золотая звезда',
                order: 4
            },
            {
                name: 'Подарок',
                form: 'gift',
                color: '#9b59b6',
                colorSecondary: '#f39c12',
                price: 30,
                rarity: 'rare',
                animation: 'shake',
                description: 'Коробка с сюрпризом',
                order: 5
            },
            {
                name: 'Торт',
                form: 'cake',
                color: '#ff9eb8',
                colorSecondary: '#f4c542',
                price: 50,
                rarity: 'rare',
                animation: 'bounce',
                description: 'Праздничный торт со свечами',
                order: 6
            },
            {
                name: 'Клевер',
                form: 'clover',
                color: '#27ae60',
                colorSecondary: '#16a085',
                price: 75,
                rarity: 'rare',
                animation: 'float',
                description: 'Клевер на удачу',
                order: 7
            },
            {
                name: 'Корона',
                form: 'crown',
                color: '#f39c12',
                colorSecondary: '#d68910',
                price: 100,
                rarity: 'epic',
                animation: 'rainbow',
                description: 'Золотая королевская корона',
                order: 8
            },
            {
                name: 'Кубок',
                form: 'trophy',
                color: '#f1c40f',
                colorSecondary: '#b8860b',
                price: 150,
                rarity: 'epic',
                animation: 'float',
                description: 'Кубок победителя',
                order: 9
            },
            {
                name: 'Алмаз',
                form: 'diamond',
                color: '#5dade2',
                colorSecondary: '#2874a6',
                price: 200,
                rarity: 'epic',
                animation: 'spin',
                description: 'Сияющий драгоценный алмаз',
                order: 10
            },
            {
                name: 'Ракета',
                form: 'rocket',
                color: '#e74c3c',
                colorSecondary: '#95a5a6',
                price: 300,
                rarity: 'legendary',
                animation: 'float',
                description: 'Космическая ракета',
                order: 11
            },
            {
                name: 'Кольцо',
                form: 'ring',
                color: '#f1c40f',
                colorSecondary: '#d4af37',
                price: 500,
                rarity: 'mythic',
                animation: 'rainbow',
                description: 'Золотое кольцо с бриллиантом',
                order: 12
            }
        ];
        
        await GiftForm.insertMany(forms);
        console.log('🎨 Формы подарков инициализированы: ' + forms.length);
    } catch (e) {
        console.error('Ошибка форм подарков:', e);
    }
}

mongoose.connection.once('open', () => {
    initializeCreator().then(() => {
        initializeGifts();
        initializeGiftForms();
    });
});

// ============ MIDDLEWARE ============
async function authMiddleware(req, res, next) {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Токен не предоставлен' });
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'shitrat-secret-key');
        const user = await User.findById(decoded.id);
        if (!user) return res.status(401).json({ error: 'Не найден' });
        if (user.isBanned) return res.status(403).json({ error: 'Забанен' });
        req.userId = decoded.id;
        req.userRole = user.role;
        req.user = user;
        next();
    } catch (e) { res.status(401).json({ error: 'Неверный токен' }); }
}

function adminMiddleware(req, res, next) {
    if (req.userRole !== 'CREATOR' && req.userRole !== 'ADMIN') return res.status(403).json({ error: 'Нет доступа' });
    next();
}

function generateToken(user) {
    return jwt.sign({ id: user._id, username: user.username, role: user.role }, process.env.JWT_SECRET || 'shitrat-secret-key', { expiresIn: '30d' });
}

function detectDevice(ua) {
    ua = ua || '';
    let deviceType = 'web', platform = 'Web', browser = 'Unknown';
    if (/mobile|android|iphone|ipod/i.test(ua)) { deviceType = 'mobile'; platform = 'Mobile'; }
    else if (/tablet|ipad/i.test(ua)) { deviceType = 'tablet'; platform = 'Tablet'; }
    else if (/windows/i.test(ua)) { platform = 'Windows'; deviceType = 'desktop'; }
    else if (/mac/i.test(ua)) { platform = 'macOS'; deviceType = 'desktop'; }
    else if (/linux/i.test(ua)) { platform = 'Linux'; deviceType = 'desktop'; }
    if (/chrome/i.test(ua) && !/edge|edg/i.test(ua)) browser = 'Chrome';
    else if (/safari/i.test(ua) && !/chrome/i.test(ua)) browser = 'Safari';
    else if (/firefox/i.test(ua)) browser = 'Firefox';
    else if (/edge|edg/i.test(ua)) browser = 'Edge';
    return { deviceType, platform, browser };
}

// ============ АУТЕНТИФИКАЦИЯ ============
app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, password, firstName, lastName } = req.body;
        if (!username || !password) return res.status(400).json({ error: 'Введите данные' });
        if (username.length < 3) return res.status(400).json({ error: 'Мин. 3 символа' });
        if (!/^[a-zA-Z0-9_]+$/.test(username)) return res.status(400).json({ error: 'Только латиница' });

        const exists = await User.findOne({ usernameLower: username.toLowerCase() });
        if (exists) return res.status(400).json({ error: 'Имя занято' });

        const hashed = await bcrypt.hash(password, 12);
        const user = new User({
            username,
            usernameLower: username.toLowerCase(),
            password: hashed,
            emoji: ['🐀', '🐁', '🧀', '🐭', '🦝'][Math.floor(Math.random() * 5)],
            firstName: firstName || '',
            lastName: lastName || ''
        });
        await user.save();

        const general = await Chat.findOne({ name: 'Общий чат' });
        if (general) { general.members.push(user._id); await general.save(); }

        const saved = new Chat({ name: 'Избранное', type: 'saved', creator: user._id, members: [user._id] });
        await saved.save();

        const token = generateToken(user);
        const di = detectDevice(req.headers['user-agent']);
        await new Session({ user: user._id, ...di, ip: req.ip, token, isCurrent: true }).save();

        res.status(201).json({ token, user: { id: user._id, username: user.username, emoji: user.emoji, avatar: user.avatar, role: user.role, firstName: user.firstName, lastName: user.lastName } });
    } catch (e) { console.error(e); res.status(500).json({ error: 'Ошибка' }); }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ usernameLower: username.toLowerCase() });
        if (!user) return res.status(401).json({ error: 'Не найден' });
        if (user.isBanned) return res.status(403).json({ error: 'Забанен' });

        const ok = await bcrypt.compare(password, user.password);
        if (!ok) return res.status(401).json({ error: 'Неверный пароль' });

        user.isOnline = true;
        user.lastSeen = new Date();
        await user.save();

        const token = generateToken(user);
        const di = detectDevice(req.headers['user-agent']);
        await Session.updateMany({ user: user._id }, { isCurrent: false });
        await new Session({ user: user._id, ...di, ip: req.ip, token, isCurrent: true }).save();

        res.json({ token, user: { id: user._id, username: user.username, emoji: user.emoji, avatar: user.avatar, role: user.role, firstName: user.firstName, lastName: user.lastName, bio: user.bio, phone: user.phone, birthday: user.birthday, privacy: user.privacy, notifications: user.notifications, chatSettings: user.chatSettings } });
    } catch (e) { res.status(500).json({ error: 'Ошибка' }); }
});

app.get('/api/auth/me', authMiddleware, async (req, res) => {
    const user = await User.findById(req.userId).select('-password');
    res.json({ user });
});

app.post('/api/auth/logout', authMiddleware, async (req, res) => {
    try {
        await User.findByIdAndUpdate(req.userId, { isOnline: false, lastSeen: new Date() });
        const token = req.headers.authorization?.replace('Bearer ', '');
        await Session.deleteOne({ token });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: 'Ошибка' }); }
});

// ============ ПРОФИЛЬ ============
app.put('/api/profile', authMiddleware, async (req, res) => {
    const update = {};
    ['firstName', 'lastName', 'bio', 'emoji', 'phone', 'birthday'].forEach(k => { if (req.body[k] !== undefined) update[k] = req.body[k]; });
    const user = await User.findByIdAndUpdate(req.userId, update, { new: true }).select('-password');
    res.json({ user });
});

app.post('/api/profile/avatar', authMiddleware, async (req, res) => {
    try {
        const { avatar } = req.body;
        if (!avatar) return res.status(400).json({ error: 'Нет фото' });
        if (avatar.length > 3 * 1024 * 1024) return res.status(400).json({ error: 'Слишком большое' });
        const user = await User.findByIdAndUpdate(req.userId, { avatar }, { new: true }).select('-password');
        res.json({ user });
    } catch (e) { res.status(500).json({ error: 'Ошибка' }); }
});

app.post('/api/profile/change-password', authMiddleware, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Заполните' });
        if (newPassword.length < 6) return res.status(400).json({ error: 'Мин. 6 символов' });
        const user = await User.findById(req.userId);
        const ok = await bcrypt.compare(currentPassword, user.password);
        if (!ok) return res.status(400).json({ error: 'Неверный пароль' });
        user.password = await bcrypt.hash(newPassword, 12);
        await user.save();
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: 'Ошибка' }); }
});

app.put('/api/profile/privacy', authMiddleware, async (req, res) => {
    const user = await User.findByIdAndUpdate(req.userId, { privacy: req.body }, { new: true }).select('-password');
    res.json({ user });
});

app.put('/api/profile/notifications', authMiddleware, async (req, res) => {
    const user = await User.findByIdAndUpdate(req.userId, { notifications: req.body }, { new: true }).select('-password');
    res.json({ user });
});

app.put('/api/profile/chat-settings', authMiddleware, async (req, res) => {
    const user = await User.findByIdAndUpdate(req.userId, { chatSettings: req.body }, { new: true }).select('-password');
    res.json({ user });
});

app.put('/api/profile/language', authMiddleware, async (req, res) => {
    const user = await User.findByIdAndUpdate(req.userId, { language: req.body.language }, { new: true }).select('-password');
    res.json({ user });
});

// ============ УСТРОЙСТВА ============
app.get('/api/sessions', authMiddleware, async (req, res) => {
    const currentToken = req.headers.authorization?.replace('Bearer ', '');
    const sessions = await Session.find({ user: req.userId }).sort({ lastActive: -1 });
    const result = sessions.map(s => ({
        id: s._id, deviceType: s.deviceType, platform: s.platform, browser: s.browser,
        ip: s.ip, lastActive: s.lastActive, isCurrent: s.token === currentToken
    }));
    res.json({ sessions: result });
});

app.delete('/api/sessions/:sessionId', authMiddleware, async (req, res) => {
    const s = await Session.findOne({ _id: req.params.sessionId, user: req.userId });
    if (!s) return res.status(404).json({ error: 'Не найдено' });
    const currentToken = req.headers.authorization?.replace('Bearer ', '');
    if (s.token === currentToken) return res.status(400).json({ error: 'Текущая сессия' });
    await Session.deleteOne({ _id: s._id });
    res.json({ success: true });
});

app.delete('/api/sessions', authMiddleware, async (req, res) => {
    const currentToken = req.headers.authorization?.replace('Bearer ', '');
    await Session.deleteMany({ user: req.userId, token: { $ne: currentToken } });
    res.json({ success: true });
});

// ============ ЧАТЫ ============
app.get('/api/chats', authMiddleware, async (req, res) => {
    const chats = await Chat.find({ members: req.userId })
        .populate('creator', 'username emoji avatar')
        .populate({ path: 'lastMessage', populate: { path: 'author', select: 'username emoji avatar' } })
        .sort({ createdAt: -1 });
    res.json({ chats });
});

app.post('/api/chats', authMiddleware, async (req, res) => {
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ error: 'Введите название' });
    const chat = new Chat({ name, description: description || '', type: 'group', creator: req.userId, members: [req.userId] });
    await chat.save();
    res.status(201).json({ chat });
});

app.post('/api/chats/direct/:userId', authMiddleware, async (req, res) => {
    const otherId = req.params.userId;
    let chat = await Chat.findOne({ type: 'direct', members: { $all: [req.userId, otherId], $size: 2 } });
    if (!chat) {
        chat = new Chat({ name: 'Личный чат', type: 'direct', creator: req.userId, members: [req.userId, otherId] });
        await chat.save();
    }
    const populated = await Chat.findById(chat._id).populate('members', 'username emoji avatar isOnline lastSeen');
    res.json({ chat: populated });
});

// ============ СООБЩЕНИЯ ============
app.get('/api/chats/:chatId/messages', authMiddleware, async (req, res) => {
    const messages = await Message.find({ chat: req.params.chatId, isDeleted: false })
        .populate('author', 'username emoji avatar')
        .sort({ createdAt: 1 }).limit(200);
    res.json({ messages });
});

app.post('/api/chats/:chatId/messages', authMiddleware, async (req, res) => {
    const { content, image } = req.body;
    const message = new Message({ chat: req.params.chatId, author: req.userId, content: content || '', image: image || null });
    await message.save();
    const chat = await Chat.findById(req.params.chatId);
    if (chat) { chat.lastMessage = message._id; await chat.save(); }
    const populated = await Message.findById(message._id).populate('author', 'username emoji avatar');
    io.to(req.params.chatId).emit('new-message', populated);
    res.status(201).json({ message: populated });
});

app.delete('/api/messages/:messageId', authMiddleware, async (req, res) => {
    const msg = await Message.findById(req.params.messageId);
    if (!msg) return res.status(404).json({ error: 'Не найдено' });
    if (msg.author.toString() !== req.userId && req.userRole !== 'CREATOR') return res.status(403).json({ error: 'Нет прав' });
    msg.isDeleted = true;
    msg.content = 'Сообщение удалено';
    msg.image = null;
    await msg.save();
    io.to(msg.chat.toString()).emit('message-deleted', { messageId: msg._id });
    res.json({ success: true });
});

// ============ ПОИСК ============
app.get('/api/users/search', authMiddleware, async (req, res) => {
    const query = req.query.q || '';
    if (!query || query.length < 2) return res.json({ users: [] });
    const users = await User.find({ usernameLower: { $regex: query.toLowerCase(), $options: 'i' }, _id: { $ne: req.userId } })
        .select('username emoji avatar isOnline lastSeen firstName lastName').limit(20);
    res.json({ users });
});

app.get('/api/users/:userId', authMiddleware, async (req, res) => {
    const user = await User.findById(req.params.userId).select('username emoji avatar isOnline lastSeen firstName lastName bio role createdAt');
    if (!user) return res.status(404).json({ error: 'Не найден' });
    res.json({ user });
});

// ============ КОНТАКТЫ ============
app.post('/api/contacts/:userId', authMiddleware, async (req, res) => {
    await User.findByIdAndUpdate(req.userId, { $addToSet: { contacts: req.params.userId } });
    await User.findByIdAndUpdate(req.params.userId, { $addToSet: { contacts: req.userId } });
    res.json({ success: true });
});

app.delete('/api/contacts/:userId', authMiddleware, async (req, res) => {
    await User.findByIdAndUpdate(req.userId, { $pull: { contacts: req.params.userId } });
    await User.findByIdAndUpdate(req.params.userId, { $pull: { contacts: req.userId } });
    res.json({ success: true });
});

app.get('/api/contacts', authMiddleware, async (req, res) => {
    const user = await User.findById(req.userId).populate('contacts', 'username emoji avatar isOnline lastSeen');
    res.json({ contacts: user.contacts || [] });
});

// ============ ПОДАРКИ ============
app.get('/api/gifts', authMiddleware, async (req, res) => {
    const gifts = await Gift.find({ isActive: true }).sort({ order: 1 });
    res.json({ gifts });
});

app.get('/api/gifts/my', authMiddleware, async (req, res) => {
    const userGifts = await UserGift.find({ user: req.userId })
        .populate('gift').populate('givenBy', 'username emoji').sort({ receivedAt: -1 });
    res.json({ userGifts });
});

app.get('/api/gifts/user/:userId', authMiddleware, async (req, res) => {
    const userGifts = await UserGift.find({ user: req.params.userId })
        .populate('gift').populate('givenBy', 'username emoji').sort({ receivedAt: -1 });
    res.json({ userGifts });
});

app.post('/api/gifts/give', authMiddleware, async (req, res) => {
    if (req.userRole !== 'CREATOR') return res.status(403).json({ error: 'Только создатель' });
    const { userId, giftId, message } = req.body;
    if (!userId || !giftId) return res.status(400).json({ error: 'Выберите юзера и подарок' });
    const gift = await Gift.findById(giftId);
    if (!gift) return res.status(404).json({ error: 'Подарок не найден' });
    const exists = await UserGift.findOne({ user: userId, gift: giftId });
    if (exists) return res.status(400).json({ error: 'Уже есть этот подарок' });

    const ug = new UserGift({ user: userId, gift: giftId, givenBy: req.userId, message: message || '', isNew: true });
    await ug.save();
    const populated = await UserGift.findById(ug._id).populate('gift').populate('givenBy', 'username emoji').populate('user', 'username emoji');
    res.json({ userGift: populated });
});

app.post('/api/gifts/:userGiftId/view', authMiddleware, async (req, res) => {
    await UserGift.findOneAndUpdate({ _id: req.params.userGiftId, user: req.userId }, { isNew: false });
    res.json({ success: true });
});

// ============ ПУБЛИКАЦИИ ============
app.get('/api/posts', authMiddleware, async (req, res) => {
    const posts = await Post.find({ isPublic: true })
        .populate('author', 'username emoji avatar')
        .populate('likes', 'username')
        .populate('comments.author', 'username emoji avatar')
        .sort({ createdAt: -1 }).limit(50);
    const result = posts.map(p => ({
        ...p.toObject(),
        isLiked: p.likes.some(l => l._id.toString() === req.userId),
        likesCount: p.likes.length,
        commentsCount: p.comments.length
    }));
    res.json({ posts: result });
});

app.get('/api/posts/user/:userId', authMiddleware, async (req, res) => {
    const posts = await Post.find({ author: req.params.userId })
        .populate('author', 'username emoji avatar')
        .populate('likes', 'username')
        .populate('comments.author', 'username emoji avatar')
        .sort({ createdAt: -1 });
    const result = posts.map(p => ({
        ...p.toObject(),
        isLiked: p.likes.some(l => l._id.toString() === req.userId),
        likesCount: p.likes.length,
        commentsCount: p.comments.length
    }));
    res.json({ posts: result });
});

app.post('/api/posts', authMiddleware, async (req, res) => {
    const { content, image } = req.body;
    if (!content && !image) return res.status(400).json({ error: 'Нужен текст или фото' });
    const post = new Post({ author: req.userId, content: content || '', image: image || null });
    await post.save();
    const populated = await Post.findById(post._id).populate('author', 'username emoji avatar');
    res.status(201).json({ post: { ...populated.toObject(), isLiked: false, likesCount: 0, commentsCount: 0 } });
});

app.post('/api/posts/:postId/like', authMiddleware, async (req, res) => {
    const post = await Post.findById(req.params.postId);
    if (!post) return res.status(404).json({ error: 'Не найдено' });
    const liked = post.likes.some(l => l.toString() === req.userId);
    if (liked) post.likes = post.likes.filter(l => l.toString() !== req.userId);
    else post.likes.push(req.userId);
    await post.save();
    res.json({ isLiked: !liked, likesCount: post.likes.length });
});

app.post('/api/posts/:postId/comment', authMiddleware, async (req, res) => {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: 'Пустой комментарий' });
    const post = await Post.findById(req.params.postId);
    if (!post) return res.status(404).json({ error: 'Не найдено' });
    post.comments.push({ author: req.userId, text });
    await post.save();
    const populated = await Post.findById(post._id).populate('comments.author', 'username emoji avatar');
    const newComment = populated.comments[populated.comments.length - 1];
    res.json({ comment: newComment });
});

app.delete('/api/posts/:postId', authMiddleware, async (req, res) => {
    const post = await Post.findById(req.params.postId);
    if (!post) return res.status(404).json({ error: 'Не найдено' });
    if (post.author.toString() !== req.userId && req.userRole !== 'CREATOR') return res.status(403).json({ error: 'Нет прав' });
    await Post.deleteOne({ _id: post._id });
    res.json({ success: true });
});

// ============ СТОРИС ============
app.get('/api/stories', authMiddleware, async (req, res) => {
    const stories = await Story.find()
        .populate('author', 'username emoji avatar')
        .populate('views.user', 'username')
        .sort({ createdAt: -1 }).limit(100);

    const grouped = {};
    stories.forEach(s => {
        const authorId = s.author._id.toString();
        if (!grouped[authorId]) grouped[authorId] = { author: s.author, stories: [], hasUnviewed: false };
        grouped[authorId].stories.push(s);
        const viewed = s.views.some(v => v.user && v.user._id.toString() === req.userId);
        if (!viewed) grouped[authorId].hasUnviewed = true;
    });
    res.json({ stories: Object.values(grouped) });
});

app.get('/api/stories/user/:userId', authMiddleware, async (req, res) => {
    const stories = await Story.find({ author: req.params.userId })
        .populate('author', 'username emoji avatar').sort({ createdAt: -1 });
    res.json({ stories });
});

app.post('/api/stories', authMiddleware, async (req, res) => {
    const { image, caption } = req.body;
    if (!image) return res.status(400).json({ error: 'Нет фото' });
    await Story.deleteMany({ author: req.userId, createdAt: { $lt: new Date(Date.now() - 24*60*60*1000) } });
    const story = new Story({ author: req.userId, image, caption: caption || '' });
    await story.save();
    const populated = await Story.findById(story._id).populate('author', 'username emoji avatar');
    res.status(201).json({ story: populated });
});

app.post('/api/stories/:storyId/view', authMiddleware, async (req, res) => {
    const story = await Story.findById(req.params.storyId);
    if (!story) return res.status(404).json({ error: 'Не найдено' });
    const already = story.views.some(v => v.user && v.user.toString() === req.userId);
    if (!already) { story.views.push({ user: req.userId }); await story.save(); }
    res.json({ success: true });
});

app.delete('/api/stories/:storyId', authMiddleware, async (req, res) => {
    const story = await Story.findById(req.params.storyId);
    if (!story) return res.status(404).json({ error: 'Не найдено' });
    if (story.author.toString() !== req.userId && req.userRole !== 'CREATOR') return res.status(403).json({ error: 'Нет прав' });
    await Story.deleteOne({ _id: story._id });
    res.json({ success: true });
});

// ============ АДМИН ============
app.get('/api/admin/users', authMiddleware, adminMiddleware, async (req, res) => {
    const users = await User.find().select('-password').sort({ createdAt: -1 });
    res.json({ users });
});

app.post('/api/admin/users/:userId/ban', authMiddleware, adminMiddleware, async (req, res) => {
    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ error: 'Не найден' });
    if (user.role === 'CREATOR') return res.status(403).json({ error: 'Нельзя забанить создателя' });
    user.isBanned = true;
    user.banReason = req.body.reason || '';
    await user.save();
    await Session.deleteMany({ user: user._id });
    res.json({ success: true });
});

app.post('/api/admin/users/:userId/unban', authMiddleware, adminMiddleware, async (req, res) => {
    await User.findByIdAndUpdate(req.params.userId, { isBanned: false, banReason: '' });
    res.json({ success: true });
});

app.post('/api/admin/users/:userId/promote', authMiddleware, adminMiddleware, async (req, res) => {
    const { role } = req.body;
    if (!['USER', 'ADMIN'].includes(role)) return res.status(400).json({ error: 'Неверная роль' });
    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ error: 'Не найден' });
    if (user.role === 'CREATOR') return res.status(403).json({ error: 'Нельзя' });
    user.role = role;
    await user.save();
    res.json({ success: true, user });
});

app.get('/api/admin/stats', authMiddleware, adminMiddleware, async (req, res) => {
    const totalUsers = await User.countDocuments();
    const totalChats = await Chat.countDocuments();
    const totalMessages = await Message.countDocuments();
    const bannedUsers = await User.countDocuments({ isBanned: true });
    const onlineUsers = await User.countDocuments({ isOnline: true });
    const totalPosts = await Post.countDocuments();
    res.json({ totalUsers, totalChats, totalMessages, bannedUsers, onlineUsers, totalPosts });
});
// ============ API ФОРМ ПОДАРКОВ ============

// Получить все формы подарков
app.get('/api/gift-forms', authMiddleware, async (req, res) => {
    try {
        const forms = await GiftForm.find({ isActive: true }).sort({ order: 1 });
        res.json({ forms });
    } catch (e) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Получить одну форму
app.get('/api/gift-forms/:id', authMiddleware, async (req, res) => {
    try {
        const form = await GiftForm.findById(req.params.id);
        if (!form) return res.status(404).json({ error: 'Не найдено' });
        res.json({ form });
    } catch (e) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Купить и отправить подарок
app.post('/api/gift-forms/send', authMiddleware, async (req, res) => {
    try {
        const { recipientId, formId, message, isAnonymous } = req.body;
        
        if (!recipientId || !formId) {
            return res.status(400).json({ error: 'Укажите получателя и подарок' });
        }
        
        if (recipientId === req.userId) {
            return res.status(400).json({ error: 'Нельзя подарить себе' });
        }
        
        const form = await GiftForm.findById(formId);
        if (!form) return res.status(404).json({ error: 'Подарок не найден' });
        
        const recipient = await User.findById(recipientId);
        if (!recipient) return res.status(404).json({ error: 'Получатель не найден' });
        
        const buyer = await User.findById(req.userId);
        if (!buyer) return res.status(404).json({ error: 'Покупатель не найден' });
        
        // Проверить баланс
        if ((buyer.stars || 0) < form.price) {
            return res.status(400).json({ 
                error: `Недостаточно звёзд. Нужно ${form.price}, у вас ${buyer.stars || 0}`,
                need: form.price,
                have: buyer.stars || 0
            });
        }
        
        // Списать звёзды у покупателя
        buyer.stars -= form.price;
        buyer.totalStarsSpent = (buyer.totalStarsSpent || 0) + form.price;
        await buyer.save();
        
        // Записать транзакцию покупки
        await new StarTransaction({
            from: req.userId,
            to: recipientId,
            amount: -form.price,
            type: 'gift_purchase',
            description: `Подарок: ${form.name}`
        }).save();
        
        // Создать запись покупки
        const purchase = new GiftPurchase({
            buyer: req.userId,
            recipient: recipientId,
            form: formId,
            pricePaid: form.price,
            message: message || '',
            isAnonymous: isAnonymous || false,
            isNew: true
        });
        await purchase.save();
        
        // Уведомить получателя через WebSocket
        io.emit('gift-form-received', {
            recipientId,
            purchase: await GiftPurchase.findById(purchase._id)
                .populate('form')
                .populate('buyer', 'username emoji avatar')
        });
        
        res.json({
            success: true,
            purchase,
            newBalance: buyer.stars
        });
    } catch (e) {
        console.error('Ошибка отправки подарка:', e);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Получить мои покупки (что я купил другим)
app.get('/api/gift-forms/my-purchases', authMiddleware, async (req, res) => {
    try {
        const purchases = await GiftPurchase.find({ buyer: req.userId })
            .populate('form')
            .populate('recipient', 'username emoji avatar')
            .sort({ purchasedAt: -1 })
            .limit(100);
        
        res.json({ purchases });
    } catch (e) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Получить полученные подарки
app.get('/api/gift-forms/received', authMiddleware, async (req, res) => {
    try {
        const received = await GiftPurchase.find({ recipient: req.userId })
            .populate('form')
            .populate('buyer', 'username emoji avatar')
            .sort({ purchasedAt: -1 })
            .limit(100);
        
        // Скрыть имя если анонимно
        const result = received.map(p => {
            const obj = p.toObject();
            if (obj.isAnonymous && obj.buyer) {
                obj.buyer = {
                    username: 'Аноним',
                    emoji: '👤',
                    avatar: ''
                };
            }
            return obj;
        });
        
        res.json({ received: result });
    } catch (e) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Получить подарки конкретного пользователя (публично)
app.get('/api/gift-forms/user/:userId', authMiddleware, async (req, res) => {
    try {
        const received = await GiftPurchase.find({ recipient: req.params.userId })
            .populate('form')
            .sort({ purchasedAt: -1 })
            .limit(50);
        
        // Убрать имена отправителей (приватность)
        const result = received.map(p => ({
            _id: p._id,
            form: p.form,
            message: p.message,
            purchasedAt: p.purchasedAt,
            isAnonymous: p.isAnonymous
        }));
        
        res.json({ gifts: result });
    } catch (e) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Отметить подарок как просмотренный
app.post('/api/gift-forms/:purchaseId/view', authMiddleware, async (req, res) => {
    try {
        await GiftPurchase.findOneAndUpdate(
            { _id: req.params.purchaseId, recipient: req.userId },
            { isNew: false }
        );
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// СОЗДАТЕЛЬ: создать новую форму
app.post('/api/gift-forms/create', authMiddleware, async (req, res) => {
    try {
        if (req.userRole !== 'CREATOR') {
            return res.status(403).json({ error: 'Только создатель' });
        }
        
        const { name, form, color, colorSecondary, price, rarity, animation, description, order } = req.body;
        
        if (!name || !form) {
            return res.status(400).json({ error: 'Укажите название и форму' });
        }
        
        const newForm = new GiftForm({
            name,
            form,
            color: color || '#f39c12',
            colorSecondary: colorSecondary || '#e67e22',
            price: price || 10,
            rarity: rarity || 'common',
            animation: animation || 'bounce',
            description: description || '',
            order: order || 999
        });
        
        await newForm.save();
        res.json({ form: newForm });
    } catch (e) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// СОЗДАТЕЛЬ: удалить форму
app.delete('/api/gift-forms/:id', authMiddleware, async (req, res) => {
    try {
        if (req.userRole !== 'CREATOR') {
            return res.status(403).json({ error: 'Только создатель' });
        }
        
        await GiftForm.findByIdAndUpdate(req.params.id, { isActive: false });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// СОЗДАТЕЛЬ: изменить форму
app.put('/api/gift-forms/:id', authMiddleware, async (req, res) => {
    try {
        if (req.userRole !== 'CREATOR') {
            return res.status(403).json({ error: 'Только создатель' });
        }
        
        const form = await GiftForm.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true }
        );
        
        if (!form) return res.status(404).json({ error: 'Не найдено' });
        res.json({ form });
    } catch (e) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Статистика подарков (для создателя)
app.get('/api/gift-forms/stats', authMiddleware, async (req, res) => {
    try {
        if (req.userRole !== 'CREATOR' && req.userRole !== 'ADMIN') {
            return res.status(403).json({ error: 'Нет доступа' });
        }
        
        const totalPurchases = await GiftPurchase.countDocuments();
        
        // Сумма потраченных звёзд
        const totalStarsSpent = await GiftPurchase.aggregate([
            { $group: { _id: null, sum: { $sum: '$pricePaid' } } }
        ]);
        
        // Топ подарков
        const topForms = await GiftPurchase.aggregate([
            { $group: { _id: '$form', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 10 }
        ]);
        
        // Подтянуть названия
        const formsWithCount = await Promise.all(topForms.map(async item => {
            const form = await GiftForm.findById(item._id);
            return {
                form,
                count: item.count
            };
        }));
        
        res.json({
            totalPurchases,
            totalStarsSpent: totalStarsSpent[0]?.sum || 0,
            topForms: formsWithCount
        });
    } catch (e) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});
// ============ API ПАПОК ЧАТОВ ============

// Получить все папки пользователя
app.get('/api/folders', authMiddleware, async (req, res) => {
    try {
        let folders = await ChatFolder.find({ user: req.userId })
            .populate('chats', 'name type avatar')
            .sort({ order: 1 });
        
        // Если у пользователя нет папок — создать дефолтные
        if (folders.length === 0) {
            const defaultFolders = [
                { user: req.userId, name: 'Все', emoji: '📥', order: 0, isDefault: true },
                { user: req.userId, name: 'Новые', emoji: '🆕', order: 1, isDefault: true },
                { user: req.userId, name: 'Личные', emoji: '👤', order: 2, isDefault: true },
                { user: req.userId, name: 'Группы', emoji: '👥', order: 3, isDefault: true }
            ];
            await ChatFolder.insertMany(defaultFolders);
            
            folders = await ChatFolder.find({ user: req.userId })
                .populate('chats', 'name type avatar')
                .sort({ order: 1 });
        }
        
        res.json({ folders });
    } catch (e) {
        console.error('Ошибка папок:', e);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Создать папку
app.post('/api/folders', authMiddleware, async (req, res) => {
    try {
        const { name, emoji } = req.body;
        
        if (!name || name.length < 1 || name.length > 30) {
            return res.status(400).json({ error: 'Название 1-30 символов' });
        }
        
        // Максимум 10 папок
        const count = await ChatFolder.countDocuments({ user: req.userId });
        if (count >= 10) {
            return res.status(400).json({ error: 'Максимум 10 папок' });
        }
        
        const folder = new ChatFolder({
            user: req.userId,
            name,
            emoji: emoji || '📁',
            order: count,
            isDefault: false
        });
        
        await folder.save();
        res.status(201).json({ folder });
    } catch (e) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Изменить папку
app.put('/api/folders/:folderId', authMiddleware, async (req, res) => {
    try {
        const { name, emoji } = req.body;
        
        const folder = await ChatFolder.findOne({
            _id: req.params.folderId,
            user: req.userId
        });
        
        if (!folder) return res.status(404).json({ error: 'Папка не найдена' });
        
        if (folder.isDefault && name !== undefined) {
            return res.status(400).json({ error: 'Нельзя переименовать системную папку' });
        }
        
        if (name !== undefined) folder.name = name;
        if (emoji !== undefined) folder.emoji = emoji;
        
        await folder.save();
        res.json({ folder });
    } catch (e) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Удалить папку
app.delete('/api/folders/:folderId', authMiddleware, async (req, res) => {
    try {
        const folder = await ChatFolder.findOne({
            _id: req.params.folderId,
            user: req.userId
        });
        
        if (!folder) return res.status(404).json({ error: 'Папка не найдена' });
        
        if (folder.isDefault) {
            return res.status(400).json({ error: 'Нельзя удалить системную папку' });
        }
        
        await ChatFolder.deleteOne({ _id: folder._id });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Добавить чат в папку
app.post('/api/folders/:folderId/chats', authMiddleware, async (req, res) => {
    try {
        const { chatId } = req.body;
        if (!chatId) return res.status(400).json({ error: 'Укажите чат' });
        
        const folder = await ChatFolder.findOne({
            _id: req.params.folderId,
            user: req.userId
        });
        
        if (!folder) return res.status(404).json({ error: 'Папка не найдена' });
        if (folder.isDefault) {
            return res.status(400).json({ error: 'Системные папки заполняются автоматически' });
        }
        
        // Проверить, что пользователь участник чата
        const chat = await Chat.findById(chatId);
        if (!chat) return res.status(404).json({ error: 'Чат не найден' });
        
        if (!chat.members.some(m => m.toString() === req.userId)) {
            return res.status(403).json({ error: 'Вы не участник этого чата' });
        }
        
        // Добавить, если ещё нет
        if (!folder.chats.some(c => c.toString() === chatId)) {
            folder.chats.push(chatId);
            await folder.save();
        }
        
        res.json({ folder });
    } catch (e) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Убрать чат из папки
app.delete('/api/folders/:folderId/chats/:chatId', authMiddleware, async (req, res) => {
    try {
        const folder = await ChatFolder.findOne({
            _id: req.params.folderId,
            user: req.userId
        });
        
        if (!folder) return res.status(404).json({ error: 'Папка не найдена' });
        if (folder.isDefault) {
            return res.status(400).json({ error: 'Нельзя изменить системную папку' });
        }
        
        folder.chats = folder.chats.filter(c => c.toString() !== req.params.chatId);
        await folder.save();
        
        res.json({ folder });
    } catch (e) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Получить чаты для конкретной вкладки (Все / Новые / Личные / Группы)
app.get('/api/chats/filtered/:view', authMiddleware, async (req, res) => {
    try {
        const view = req.params.view;
        
        let query = { members: req.userId };
        
        if (view === 'personal') {
            query.type = 'direct';
        } else if (view === 'groups') {
            query.type = { $in: ['group', 'channel'] };
        } else if (view === 'channels') {
            query.type = 'channel';
        }
        // view === 'all' или 'new' — все чаты
        
        const chats = await Chat.find(query)
            .populate('creator', 'username emoji avatar')
            .populate({
                path: 'lastMessage',
                populate: { path: 'author', select: 'username emoji avatar' }
            })
            .sort({ createdAt: -1 });
        
        // Для "new" — фильтруем непрочитанные
        if (view === 'new') {
            const unread = chats.filter(chat => {
                return chat.lastMessage && 
                    chat.lastMessage.author._id.toString() !== req.userId;
            });
            return res.json({ chats: unread });
        }
        
        res.json({ chats });
    } catch (e) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// ============ API НАСТРОЕК ИНТЕРФЕЙСА ============

// Получить настройки интерфейса
app.get('/api/interface', authMiddleware, async (req, res) => {
    try {
        let ui = await UserInterface.findOne({ user: req.userId });
        
        // Если нет — создать
        if (!ui) {
            ui = new UserInterface({ user: req.userId });
            await ui.save();
        }
        
        res.json({ interface: ui });
    } catch (e) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Обновить настройки интерфейса
app.put('/api/interface', authMiddleware, async (req, res) => {
    try {
        const allowedFields = ['darkMode', 'theme', 'accentColor', 'fontSize', 'chatView', 'searchTab', 'activeFolder'];
        
        const update = {};
        allowedFields.forEach(field => {
            if (req.body[field] !== undefined) {
                update[field] = req.body[field];
            }
        });
        
        let ui = await UserInterface.findOne({ user: req.userId });
        if (!ui) {
            ui = new UserInterface({ user: req.userId, ...update });
        } else {
            Object.assign(ui, update);
        }
        
        await ui.save();
        res.json({ interface: ui });
    } catch (e) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Переключить тёмную тему
app.post('/api/interface/toggle-dark', authMiddleware, async (req, res) => {
    try {
        let ui = await UserInterface.findOne({ user: req.userId });
        if (!ui) {
            ui = new UserInterface({ user: req.userId });
        }
        
        ui.darkMode = !ui.darkMode;
        ui.theme = ui.darkMode ? 'night' : 'day';
        await ui.save();
        
        res.json({ 
            darkMode: ui.darkMode,
            theme: ui.theme
        });
    } catch (e) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// ============ WEBSOCKET ============
io.on('connection', (socket) => {
    console.log('🔌 Подключение:', socket.id);
    socket.on('join-chat', (chatId) => socket.join(chatId));
    socket.on('leave-chat', (chatId) => socket.leave(chatId));
    socket.on('disconnect', () => console.log('🔌 Отключение:', socket.id));
});
// ============ API ЗВЁЗД ============

// Получить баланс звёзд
app.get('/api/stars/balance', authMiddleware, async (req, res) => {
    try {
        const user = await User.findById(req.userId).select('stars totalStarsSpent totalStarsEarned');
        if (!user) return res.status(404).json({ error: 'Не найден' });
        
        res.json({
            stars: user.stars || 0,
            totalSpent: user.totalStarsSpent || 0,
            totalEarned: user.totalStarsEarned || 0
        });
    } catch (e) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Ежедневный бонус
app.post('/api/stars/daily', authMiddleware, async (req, res) => {
    try {
        const user = await User.findById(req.userId);
        if (!user) return res.status(404).json({ error: 'Не найден' });
        
        const now = new Date();
        const lastBonus = user.lastDailyBonus ? new Date(user.lastDailyBonus) : null;
        
        // Проверка — прошло ли 24 часа
        if (lastBonus) {
            const diff = now - lastBonus;
            const hours = diff / (1000 * 60 * 60);
            
            if (hours < 24) {
                const hoursLeft = Math.ceil(24 - hours);
                return res.status(400).json({
                    error: `Бонус будет доступен через ${hoursLeft} ч.`,
                    hoursLeft
                });
            }
        }
        
        // Начисление бонуса
        const bonus = 10;
        user.stars = (user.stars || 0) + bonus;
        user.totalStarsEarned = (user.totalStarsEarned || 0) + bonus;
        user.lastDailyBonus = now;
        await user.save();
        
        // Записать транзакцию
        await new StarTransaction({
            to: req.userId,
            amount: bonus,
            type: 'bonus_daily',
            description: 'Ежедневный бонус'
        }).save();
        
        res.json({
            success: true,
            bonus,
            stars: user.stars
        });
    } catch (e) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Проверить доступность ежедневного бонуса
app.get('/api/stars/daily-status', authMiddleware, async (req, res) => {
    try {
        const user = await User.findById(req.userId).select('lastDailyBonus');
        if (!user) return res.status(404).json({ error: 'Не найден' });
        
        const now = new Date();
        const lastBonus = user.lastDailyBonus ? new Date(user.lastDailyBonus) : null;
        
        if (!lastBonus) {
            return res.json({ available: true, hoursLeft: 0 });
        }
        
        const diff = now - lastBonus;
        const hours = diff / (1000 * 60 * 60);
        
        if (hours >= 24) {
            return res.json({ available: true, hoursLeft: 0 });
        }
        
        return res.json({ 
            available: false, 
            hoursLeft: Math.ceil(24 - hours)
        });
    } catch (e) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Выдать звёзды (только создатель)
app.post('/api/stars/give', authMiddleware, async (req, res) => {
    try {
        if (req.userRole !== 'CREATOR' && req.userRole !== 'ADMIN') {
            return res.status(403).json({ error: 'Только создатель' });
        }
        
        const { userId, amount, description } = req.body;
        
        if (!userId || !amount) {
            return res.status(400).json({ error: 'Укажите пользователя и количество' });
        }
        
        const numAmount = parseInt(amount);
        if (isNaN(numAmount) || numAmount === 0) {
            return res.status(400).json({ error: 'Некорректное количество' });
        }
        
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
        
        // Начислить или списать
        user.stars = (user.stars || 0) + numAmount;
        
        if (numAmount > 0) {
            user.totalStarsEarned = (user.totalStarsEarned || 0) + numAmount;
        } else {
            user.totalStarsSpent = (user.totalStarsSpent || 0) + Math.abs(numAmount);
        }
        
        // Не уходить в минус
        if (user.stars < 0) user.stars = 0;
        
        await user.save();
        
        // Записать транзакцию
        await new StarTransaction({
            from: req.userId,
            to: userId,
            amount: numAmount,
            type: 'admin_grant',
            description: description || 'Начислено создателем'
        }).save();
        
        res.json({
            success: true,
            newBalance: user.stars
        });
    } catch (e) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// История транзакций
app.get('/api/stars/history', authMiddleware, async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        
        const transactions = await StarTransaction.find({
            $or: [{ to: req.userId }, { from: req.userId }]
        })
            .populate('from', 'username emoji avatar')
            .populate('to', 'username emoji avatar')
            .sort({ createdAt: -1 })
            .limit(limit);
        
        res.json({ transactions });
    } catch (e) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Топ по звёздам
app.get('/api/stars/top', authMiddleware, async (req, res) => {
    try {
        const users = await User.find({ isBanned: false })
            .select('username emoji avatar stars')
            .sort({ stars: -1 })
            .limit(50);
        
        res.json({ users });
    } catch (e) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Получить баланс конкретного пользователя
app.get('/api/stars/user/:userId', authMiddleware, async (req, res) => {
    try {
        const user = await User.findById(req.params.userId).select('stars');
        if (!user) return res.status(404).json({ error: 'Не найден' });
        
        res.json({ stars: user.stars || 0 });
    } catch (e) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});
// ============ ЗАПУСК ============
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🐀 ShitRat сервер запущен на порту ${PORT}`);
    console.log(`🌐 Открой: http://localhost:${PORT}/index.html`);
});
