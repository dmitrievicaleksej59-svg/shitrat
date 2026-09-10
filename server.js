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
const io = socketIO(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Отдаём index.html
app.use(express.static(path.join(__dirname)));

// ============ ПОДКЛЮЧЕНИЕ К БАЗЕ ДАННЫХ ============
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/shitrat';

mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ Подключено к MongoDB'))
    .catch(err => {
        console.error('❌ Ошибка MongoDB:', err.message);
    });

// ============ МОДЕЛИ ============
const UserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true, trim: true },
    password: { type: String, required: true },
    emoji: { type: String, default: '🐀' },
    role: { type: String, enum: ['USER', 'ADMIN', 'CREATOR'], default: 'USER' },
    isBanned: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

const ChatSchema = new mongoose.Schema({
    name: { type: String, required: true },
    type: { type: String, enum: ['group', 'direct'], default: 'group' },
    creator: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    createdAt: { type: Date, default: Date.now }
});

const MessageSchema = new mongoose.Schema({
    chat: { type: mongoose.Schema.Types.ObjectId, ref: 'Chat', required: true },
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    content: { type: String, default: '' },
    image: { type: String, default: null },
    createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', UserSchema);
const Chat = mongoose.model('Chat', ChatSchema);
const Message = mongoose.model('Message', MessageSchema);

// ============ ИНИЦИАЛИЗАЦИЯ СОЗДАТЕЛЯ ============
async function initializeCreator() {
    try {
        const creatorExists = await User.findOne({ username: 'ShitRat_Creator' });
        
        if (!creatorExists) {
            const hashedPassword = await bcrypt.hash('ShitRat2024!', 12);
            
            const creator = new User({
                username: 'ShitRat_Creator',
                password: hashedPassword,
                emoji: '👑',
                role: 'CREATOR'
            });
            
            await creator.save();
            console.log('👑 Создатель ShitRat инициализирован');
            
            const generalChat = new Chat({
                name: 'Общий чат',
                type: 'group',
                creator: creator._id,
                members: [creator._id]
            });
            
            await generalChat.save();
            console.log('💬 Общий чат создан');
        }
    } catch (error) {
        console.error('Ошибка инициализации:', error);
    }
}

mongoose.connection.once('open', () => {
    initializeCreator();
});

// ============ MIDDLEWARE ============
function authMiddleware(req, res, next) {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
        return res.status(401).json({ error: 'Токен не предоставлен' });
    }
    
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'shitrat-secret-key');
        req.userId = decoded.id;
        req.userRole = decoded.role;
        next();
    } catch (error) {
        res.status(401).json({ error: 'Неверный токен' });
    }
}

function adminMiddleware(req, res, next) {
    if (req.userRole !== 'CREATOR' && req.userRole !== 'ADMIN') {
        return res.status(403).json({ error: 'Доступ только для администраторов' });
    }
    next();
}

// ============ API: АУТЕНТИФИКАЦИЯ ============
app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({ error: 'Введите имя и пароль' });
        }
        
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return res.status(400).json({ error: 'Пользователь уже существует' });
        }
        
        const hashedPassword = await bcrypt.hash(password, 12);
        
        const user = new User({
            username,
            password: hashedPassword,
            emoji: ['🐀', '🐁', '🧀', '🐭', '🦝'][Math.floor(Math.random() * 5)]
        });
        
        await user.save();
        
        // Автоматически добавляем в общий чат
        const generalChat = await Chat.findOne({ name: 'Общий чат' });
        if (generalChat) {
            generalChat.members.push(user._id);
            await generalChat.save();
        }
        
        const token = jwt.sign(
            { id: user._id, username: user.username, role: user.role },
            process.env.JWT_SECRET || 'shitrat-secret-key',
            { expiresIn: '7d' }
        );
        
        res.status(201).json({
            token,
            user: {
                id: user._id,
                username: user.username,
                emoji: user.emoji,
                role: user.role
            }
        });
    } catch (error) {
        console.error('Ошибка регистрации:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        const user = await User.findOne({ username });
        if (!user) {
            return res.status(401).json({ error: 'Пользователь не найден' });
        }
        
        if (user.isBanned) {
            return res.status(403).json({ error: 'Вы забанены' });
        }
        
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ error: 'Неверный пароль' });
        }
        
        const token = jwt.sign(
            { id: user._id, username: user.username, role: user.role },
            process.env.JWT_SECRET || 'shitrat-secret-key',
            { expiresIn: '7d' }
        );
        
        res.json({
            token,
            user: {
                id: user._id,
                username: user.username,
                emoji: user.emoji,
                role: user.role
            }
        });
    } catch (error) {
        console.error('Ошибка входа:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

app.get('/api/auth/me', authMiddleware, async (req, res) => {
    try {
        const user = await User.findById(req.userId).select('-password');
        res.json({ user });
    } catch (error) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// ============ API: ЧАТЫ ============
app.get('/api/chats', authMiddleware, async (req, res) => {
    try {
        const chats = await Chat.find({ members: req.userId })
            .populate('creator', 'username emoji')
            .sort({ createdAt: -1 });
        
        res.json({ chats });
    } catch (error) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

app.post('/api/chats', authMiddleware, async (req, res) => {
    try {
        const { name } = req.body;
        
        if (!name) {
            return res.status(400).json({ error: 'Введите название чата' });
        }
        
        const chat = new Chat({
            name,
            type: 'group',
            creator: req.userId,
            members: [req.userId]
        });
        
        await chat.save();
        
        res.status(201).json({ chat });
    } catch (error) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// ============ API: СООБЩЕНИЯ ============
app.get('/api/chats/:chatId/messages', authMiddleware, async (req, res) => {
    try {
        const messages = await Message.find({ chat: req.params.chatId })
            .populate('author', 'username emoji')
            .sort({ createdAt: 1 })
            .limit(100);
        
        res.json({ messages });
    } catch (error) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

app.post('/api/chats/:chatId/messages', authMiddleware, async (req, res) => {
    try {
        const { content, image } = req.body;
        
        const message = new Message({
            chat: req.params.chatId,
            author: req.userId,
            content: content || '🖼️ Изображение',
            image: image || null
        });
        
        await message.save();
        
        const populatedMessage = await Message.findById(message._id)
            .populate('author', 'username emoji');
        
        io.to(req.params.chatId).emit('new-message', populatedMessage);
        
        res.status(201).json({ message: populatedMessage });
    } catch (error) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// ============ API: АДМИН ============
app.get('/api/admin/users', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const users = await User.find().select('-password').sort({ createdAt: -1 });
        res.json({ users });
    } catch (error) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

app.post('/api/admin/users/:userId/ban', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const user = await User.findById(req.params.userId);
        
        if (!user) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }
        
        if (user.role === 'CREATOR') {
            return res.status(403).json({ error: 'Нельзя забанить создателя' });
        }
        
        user.isBanned = true;
        await user.save();
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

app.post('/api/admin/users/:userId/unban', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const user = await User.findById(req.params.userId);
        
        if (!user) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }
        
        user.isBanned = false;
        await user.save();
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

app.delete('/api/admin/users/:userId', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const user = await User.findById(req.params.userId);
        
        if (!user) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }
        
        if (user.role === 'CREATOR') {
            return res.status(403).json({ error: 'Нельзя удалить создателя' });
        }
        
        await User.findByIdAndDelete(req.params.userId);
        await Message.deleteMany({ author: req.params.userId });
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

app.get('/api/admin/stats', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const totalUsers = await User.countDocuments();
        const totalChats = await Chat.countDocuments();
        const totalMessages = await Message.countDocuments();
        const bannedUsers = await User.countDocuments({ isBanned: true });
        
        res.json({
            totalUsers,
            totalChats,
            totalMessages,
            bannedUsers
        });
    } catch (error) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// ============ WEBSOCKET ============
io.on('connection', (socket) => {
    console.log('🔌 Пользователь подключился:', socket.id);
    
    socket.on('join-chat', (chatId) => {
        socket.join(chatId);
    });
    
    socket.on('leave-chat', (chatId) => {
        socket.leave(chatId);
    });
    
    socket.on('disconnect', () => {
        console.log('🔌 Пользователь отключился:', socket.id);
    });
});

// ============ ЗАПУСК ============
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
    console.log(`🐀 ShitRat сервер запущен на порту ${PORT}`);
    console.log(`🌐 Открой: http://localhost:${PORT}/index.html`);
});