const express = require('express');
const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const cors = require('cors');

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// MySQL connection pool
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Verify token middleware
const verifyToken = (req, res, next) => {
    const token = req.headers['authorization'];
    if (!token) return res.status(401).send('Unauthorized');
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user_id = decoded.user_id;
        next();
    } catch (error) {
        res.status(401).send('Invalid token');
    }
};

// Registration endpoint with test mode option
app.post('/register', async (req, res) => {
    const { username, password, email, name, address, user_type, test_mode } = req.body;
    if (!username || !password || !email) {
        return res.status(400).send('Username, password, and email are required');
    }

    try {
        const [usernameRows] = await pool.query('SELECT user_id FROM users WHERE username = ?', [username]);
        const [emailRows] = await pool.query('SELECT user_id FROM users WHERE email = ?', [email]);

        if (usernameRows.length > 0) return res.status(409).send('Username already taken');
        if (emailRows.length > 0) return res.status(409).send('Email already taken');

        const hashedPassword = await bcrypt.hash(password, 10);
        const [result] = await pool.query(
            'INSERT INTO users (username, password_hash, email, name, address, user_type, test_mode, balance) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [username, hashedPassword, email, name, address, user_type || 'user', test_mode ? 1 : 0, test_mode ? 1000 : 0] // Mock balance for test mode
        );
        res.status(201).send('Registration successful');
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).send('Internal server error');
    }
});

// Login endpoint
app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).send('Username and password are required');

    try {
        const [rows] = await pool.query('SELECT user_id, password_hash, test_mode FROM users WHERE username = ?', [username]);
        if (rows.length === 0) return res.status(401).send('Invalid username or password');

        const user = rows[0];
        const match = await bcrypt.compare(password, user.password_hash);
        if (!match) return res.status(401).send('Invalid username or password');

        const token = jwt.sign({ user_id: user.user_id }, process.env.JWT_SECRET, { expiresIn: '1h' });
        res.json({ token, test_mode: user.test_mode });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).send('Internal server error');
    }
});

// Get current user
app.get('/users/me', verifyToken, async (req, res) => {
    try {
        const [rows] = await pool.query(
            'SELECT user_id, username, email, name, address, user_type, balance, test_mode FROM users WHERE user_id = ?',
            [req.user_id]
        );
        if (rows.length === 0) return res.status(404).send('User not found');
        res.json(rows[0]);
    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).send('Internal server error');
    }
});

// Search users
app.get('/users', verifyToken, async (req, res) => {
    const { username, user_type } = req.query;
    try {
        const [rows] = await pool.query(
            'SELECT user_id, username, name, user_type FROM users WHERE username LIKE ? AND (? IS NULL OR user_type = ?)',
            [`%${username || ''}%`, user_type || null, user_type || null]
        );
        res.json(rows);
    } catch (error) {
        console.error('Search users error:', error);
        res.status(500).send('Internal server error');
    }
});

// Simulate card payment (for testing)
app.post('/simulate-card-payment', verifyToken, async (req, res) => {
    const { card_number, expiry, cvv, amount } = req.body;
    if (!card_number || !expiry || !cvv || !amount) {
        return res.status(400).send('Card details and amount are required');
    }

    try {
        const [userRows] = await pool.query('SELECT test_mode FROM users WHERE user_id = ?', [req.user_id]);
        if (userRows.length === 0) return res.status(404).send('User not found');

        if (userRows[0].test_mode) {
            // Simulate card validation (e.g., check format)
            if (card_number.length < 16 || expiry.length !== 5 || cvv.length !== 3) {
                return res.status(400).send('Invalid card details');
            }
            await pool.query('UPDATE users SET balance = balance + ? WHERE user_id = ?', [parseFloat(amount), req.user_id]);
            res.send('Test payment successful');
        } else {
            res.status(403).send('Real payments not implemented in this sandbox');
        }
    } catch (error) {
        console.error('Simulate payment error:', error);
        res.status(500).send('Internal server error');
    }
});

// Create transaction
app.post('/transactions', verifyToken, async (req, res) => {
    const { receiver_id, amount, card_number, expiry, cvv } = req.body;
    const sender_id = req.user_id;

    if (!receiver_id || !amount || amount <= 0) return res.status(400).send('Valid receiver ID and amount are required');
    if (sender_id === receiver_id) return res.status(400).send('Cannot send money to yourself');

    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        const [senderRows] = await connection.query('SELECT balance, test_mode FROM users WHERE user_id = ?', [sender_id]);
        const [receiverRows] = await connection.query('SELECT user_id, user_type FROM users WHERE user_id = ?', [receiver_id]);
        if (receiverRows.length === 0) {
            await connection.rollback();
            return res.status(404).send('Receiver not found');
        }

        const isTestMode = senderRows[0].test_mode;
        if (!isTestMode && (!card_number || !expiry || !cvv)) {
            await connection.rollback();
            return res.status(400).send('Card details required for real transactions');
        }

        if (isTestMode) {
            if (senderRows[0].balance < amount) {
                await connection.rollback();
                return res.status(400).send('Insufficient balance');
            }
        } else {
            // In real mode, you'd integrate a payment gateway here
            // For now, we'll simulate it
            if (card_number.length < 16 || expiry.length !== 5 || cvv.length !== 3) {
                await connection.rollback();
                return res.status(400).send('Invalid card details');
            }
        }

        const transaction_type = receiverRows[0].user_type === 'merchant' ? 'payment' : 'transfer';

        await connection.query('UPDATE users SET balance = balance - ? WHERE user_id = ?', [amount, sender_id]);
        await connection.query('UPDATE users SET balance = balance + ? WHERE user_id = ?', [amount, receiver_id]);
        await connection.query(
            'INSERT INTO transactions (sender_id, receiver_id, amount, transaction_type, status) VALUES (?, ?, ?, ?, ?)',
            [sender_id, receiver_id, amount, transaction_type, 'completed']
        );

        await connection.commit();
        res.status(201).send('Transaction successful');
    } catch (error) {
        if (connection) await connection.rollback();
        console.error('Transaction error:', error);
        res.status(500).send('Transaction failed');
    } finally {
        if (connection) connection.release();
    }
});

// Get transaction history
app.get('/transactions', verifyToken, async (req, res) => {
    const user_id = req.user_id;
    try {
        const [rows] = await pool.query(
            `SELECT t.*, u1.username AS sender_username, u2.username AS receiver_username
             FROM transactions t
             JOIN users u1 ON t.sender_id = u1.user_id
             JOIN users u2 ON t.receiver_id = u2.user_id
             WHERE t.sender_id = ? OR t.receiver_id = ?
             ORDER BY t.transaction_date DESC`,
            [user_id, user_id]
        );
        res.json(rows);
    } catch (error) {
        console.error('Get transactions error:', error);
        res.status(500).send('Internal server error');
    }
});

app.use(express.static(__dirname));
app.get('/', (req, res) => res.sendFile(__dirname + '/index.html'));

// Start server with database connection check
async function startServer() {
    try {
        const [rows] = await pool.query('SELECT 1 AS test');
        console.log('MySQL connected successfully');
        app.listen(port, () => {
            console.log(`Server listening on port ${port}`);
        });
    } catch (error) {
        console.error('Failed to connect to MySQL:', error);
        process.exit(1);
    }
}

startServer();