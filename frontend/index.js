const apiBaseUrl = 'http://localhost:3000';
let token = localStorage.getItem('token');
let selectedReceiverId = null;
let isTestMode = false;

// Utility function to create elements
function createElement(tag, attrs = {}, children = []) {
    const element = document.createElement(tag);
    Object.entries(attrs).forEach(([key, value]) => {
        if (key === 'style') Object.assign(element.style, value);
        else if (key === 'className') element.className = value;
        else element.setAttribute(key, value);
    });
    children.forEach(child => {
        if (typeof child === 'string') element.appendChild(document.createTextNode(child));
        else if (child) element.appendChild(child);
    });
    return element;
}

// Main app structure (only dynamic sections)
function renderApp() {
    const app = document.getElementById('app');
    if (!app) {
        console.error('App container not found');
        return;
    }

    // Header
    const header = createElement('header', {}, [
        createElement('h1', {}, ['Money Transfer App']),
        createElement('nav', { id: 'navBar' })
    ]);

    // Dynamic sections
    const sections = [
        { id: 'profile', title: 'Profile', content: createProfileSection() },
        { id: 'sendMoney', title: 'Send Money', content: createSendMoneySection() },
        { id: 'history', title: 'Transaction History', content: createHistorySection() }
    ];

    sections.forEach(section => {
        app.appendChild(createElement('div', { id: `${section.id}Section`, className: 'section' }, [
            createElement('h2', {}, [section.title]),
            section.content
        ]));
    });

    app.insertBefore(header, app.querySelector('#registerSection'));
    updateNavBar(!!token);
    checkLoginStatus();

    // Attach event listeners to static forms
    document.getElementById('registerForm').addEventListener('submit', register);
    document.getElementById('loginForm').addEventListener('submit', login);
}

// Navigation
function updateNavBar(isLoggedIn) {
    const navBar = document.getElementById('navBar');
    if (!navBar) return;
    navBar.innerHTML = '';
    const links = isLoggedIn
        ? [
            { text: 'Profile', action: () => showSection('profile') },
            { text: 'Send Money', action: () => showSection('sendMoney') },
            { text: 'History', action: () => showSection('history') },
            { text: 'Logout', action: logout }
        ]
        : [
            { text: 'Register', action: () => showSection('register') },
            { text: 'Login', action: () => showSection('login') }
        ];

    links.forEach(link => {
        const a = createElement('a', { href: '#' }, [link.text]);
        a.addEventListener('click', (e) => {
            e.preventDefault();
            link.action();
        });
        navBar.appendChild(a);
    });
}

function showSection(sectionId) {
    document.querySelectorAll('.section').forEach(section => section.classList.remove('active'));
    const section = document.getElementById(`${sectionId}Section`);
    if (section) {
        section.classList.add('active');
        if (sectionId === 'profile') fetchProfile();
        if (sectionId === 'history') fetchTransactions();
    } else {
        console.error(`Section ${sectionId}Section not found`);
    }
}

// Dynamic section creators
function createProfileSection() {
    const addFundsButton = createElement('button', {}, ['Add Funds']);
    addFundsButton.addEventListener('click', addFunds);

    return createElement('div', {}, [
        createElement('p', { id: 'userInfo' }),
        createElement('div', { id: 'addFunds', style: { display: 'none' } }, [
            createElement('h3', {}, ['Add Funds (Test Mode Only)']),
            createFormGroup('cardNumber', 'Card Number', 'text', false, 'card_number', '16 digits'),
            createFormGroup('expiry', 'Expiry (MM/YY)', 'text', false, 'expiry', 'MM/YY'),
            createFormGroup('cvv', 'CVV', 'text', false, 'cvv', '3 digits'),
            createFormGroup('fundAmount', 'Amount', 'number', false, 'amount', null, { min: '0', step: '0.01' }),
            addFundsButton
        ])
    ]);
}

function createSendMoneySection() {
    const sendButton = createElement('button', {}, ['Send']);
    sendButton.addEventListener('click', sendMoney);

    return createElement('div', {}, [
        createFormGroup('searchUser', 'Search Recipient (Username)', 'text', false, 'searchUser', 'Type to search...'),
        createElement('div', { id: 'searchResults' }),
        createFormGroup('sendAmount', 'Amount', 'number', true, 'amount', null, { min: '0', step: '0.01' }),
        createElement('div', { id: 'cardDetails', style: { display: 'none' } }, [
            createFormGroup('sendCardNumber', 'Card Number', 'text', false, 'card_number', '16 digits'),
            createFormGroup('sendExpiry', 'Expiry (MM/YY)', 'text', false, 'expiry', 'MM/YY'),
            createFormGroup('sendCvv', 'CVV', 'text', false, 'cvv', '3 digits')
        ]),
        sendButton
    ]);
}

function createHistorySection() {
    return createElement('table', { id: 'transactionTable' }, [
        createElement('thead', {}, [
            createElement('tr', {}, [
                createElement('th', {}, ['Date']),
                createElement('th', {}, ['Type']),
                createElement('th', {}, ['Amount']),
                createElement('th', {}, ['Sender']),
                createElement('th', {}, ['Receiver']),
                createElement('th', {}, ['Status'])
            ])
        ]),
        createElement('tbody')
    ]);
}

function createFormGroup(id, labelText, type, required = false, name, placeholder = null, inputAttrs = {}) {
    const input = type === 'select'
        ? createElement('select', { id, name, ...(required ? { required: true } : {}) })
        : createElement('input', {
            type,
            id,
            name,
            ...(required ? { required: true } : {}),
            ...(placeholder ? { placeholder } : {}),
            ...inputAttrs
        });

    if (id === 'searchUser') input.addEventListener('input', searchUsers);

    return createElement('div', { className: 'form-group' }, [
        createElement('label', { for: id }, [labelText]),
        input
    ]);
}

// API interactions
async function checkLoginStatus() {
    if (!token) {
        updateNavBar(false);
        showSection('login');
        return;
    }

    try {
        const response = await fetch(`${apiBaseUrl}/users/me`, {
            headers: { 'Authorization': token }
        });
        if (response.ok) {
            updateNavBar(true);
            showSection('profile');
        } else {
            console.error('Token invalid or expired:', response.status);
            localStorage.removeItem('token');
            token = null;
            updateNavBar(false);
            showSection('login');
        }
    } catch (error) {
        console.error('Error checking login status:', error);
        alert('Error connecting to server');
        showSection('login');
    }
}

async function register(e) {
    e.preventDefault();
    const form = e.target;
    const formData = new FormData(form);
    const data = Object.fromEntries(formData);

    try {
        console.log('Registering with data:', data);
        const response = await fetch(`${apiBaseUrl}/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        const result = await response.text();
        console.log('Register response:', result);

        if (response.ok) {
            alert('Registration successful! Please log in.');
            showSection('login');
            form.reset();
        } else {
            alert(result || 'Registration failed');
        }
    } catch (error) {
        console.error('Registration error:', error);
        alert('Error registering: ' + error.message);
    }
}

async function login(e) {
    e.preventDefault();
    const form = e.target;
    const formData = new FormData(form);
    const data = Object.fromEntries(formData);

    try {
        console.log('Logging in with data:', data);
        const response = await fetch(`${apiBaseUrl}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        const result = await response.json();
        console.log('Login response:', result);

        if (response.ok) {
            token = result.token;
            isTestMode = result.test_mode || false;
            localStorage.setItem('token', token);
            alert('Login successful!');
            form.reset();
            checkLoginStatus();
        } else {
            alert(result.message || 'Login failed');
        }
    } catch (error) {
        console.error('Login error:', error);
        alert('Error logging in: ' + error.message);
    }
}

async function fetchProfile() {
    try {
        const response = await fetch(`${apiBaseUrl}/users/me`, {
            headers: { 'Authorization': token }
        });
        if (response.ok) {
            const user = await response.json();
            const userInfo = document.getElementById('userInfo');
            if (userInfo) {
                userInfo.innerHTML = `
                    Username: ${user.username}<br>
                    Email: ${user.email}<br>
                    Name: ${user.name || 'N/A'}<br>
                    Address: ${user.address || 'N/A'}<br>
                    Type: ${user.user_type}<br>
                    Balance: $${user.balance}<br>
                    Mode: ${user.test_mode ? 'Test' : 'Live'}
                `;
                document.getElementById('addFunds').style.display = user.test_mode ? 'block' : 'none';
                document.getElementById('cardDetails').style.display = user.test_mode ? 'none' : 'block';
                isTestMode = user.test_mode;
            }
        } else {
            alert('Failed to load profile');
        }
    } catch (error) {
        console.error('Profile error:', error);
        alert('Error loading profile');
    }
}

async function searchUsers(e) {
    const searchTerm = e.target.value;
    const resultsDiv = document.getElementById('searchResults');
    if (!resultsDiv) return;

    if (searchTerm.length < 2) {
        resultsDiv.innerHTML = '';
        return;
    }

    try {
        const response = await fetch(`${apiBaseUrl}/users?username=${searchTerm}`, {
            headers: { 'Authorization': token }
        });
        if (response.ok) {
            const users = await response.json();
            resultsDiv.innerHTML = users.map(user => `
                <div onclick="selectUser(${user.user_id}, '${user.username}')">
                    ${user.username} (${user.user_type})
                </div>
            `).join('');
        }
    } catch (error) {
        console.error('Search error:', error);
    }
}

function selectUser(userId, username) {
    selectedReceiverId = userId;
    const searchInput = document.getElementById('searchUser');
    const resultsDiv = document.getElementById('searchResults');
    if (searchInput && resultsDiv) {
        searchInput.value = username;
        resultsDiv.innerHTML = '';
    }
}

async function addFunds() {
    const cardNumber = document.getElementById('cardNumber')?.value;
    const expiry = document.getElementById('expiry')?.value;
    const cvv = document.getElementById('cvv')?.value;
    const amount = document.getElementById('fundAmount')?.value;

    if (!cardNumber || !expiry || !cvv || !amount || amount <= 0) {
        alert('Please enter valid card details and amount');
        return;
    }

    try {
        const response = await fetch(`${apiBaseUrl}/simulate-card-payment`, {
            method: 'POST',
            headers: {
                'Authorization': token,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ card_number: cardNumber, expiry, cvv, amount })
        });
        const text = await response.text();
        if (response.ok) {
            alert('Funds added successfully');
            fetchProfile();
        } else {
            alert(text || 'Failed to add funds');
        }
    } catch (error) {
        console.error('Add funds error:', error);
        alert('Error adding funds');
    }
}

async function sendMoney() {
    const searchUser = document.getElementById('searchUser')?.value;
    const amount = document.getElementById('sendAmount')?.value;
    const cardNumber = document.getElementById('sendCardNumber')?.value;
    const expiry = document.getElementById('sendExpiry')?.value;
    const cvv = document.getElementById('sendCvv')?.value;

    if (!selectedReceiverId || !searchUser) {
        alert('Please select a recipient');
        return;
    }
    if (!amount || amount <= 0) {
        alert('Please enter a valid amount');
        return;
    }
    if (!isTestMode && (!cardNumber || !expiry || !cvv)) {
        alert('Please enter card details for real transactions');
        return;
    }

    try {
        const response = await fetch(`${apiBaseUrl}/transactions`, {
            method: 'POST',
            headers: {
                'Authorization': token,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                receiver_id: selectedReceiverId,
                amount,
                card_number: cardNumber,
                expiry,
                cvv
            })
        });
        const text = await response.text();
        if (response.ok) {
            alert('Transaction successful');
            const fields = ['sendAmount', 'searchUser', ...(isTestMode ? [] : ['sendCardNumber', 'sendExpiry', 'sendCvv'])];
            fields.forEach(id => {
                const el = document.getElementById(id);
                if (el) el.value = '';
            });
            selectedReceiverId = null;
            fetchProfile();
        } else {
            alert(text || 'Transaction failed');
        }
    } catch (error) {
        console.error('Transaction error:', error);
        alert('Error sending money');
    }
}

async function fetchTransactions() {
    try {
        const response = await fetch(`${apiBaseUrl}/transactions`, {
            headers: { 'Authorization': token }
        });
        if (response.ok) {
            const transactions = await response.json();
            const tbody = document.getElementById('transactionTable')?.querySelector('tbody');
            if (tbody) {
                tbody.innerHTML = transactions.map(t => `
                    <tr>
                        <td>${new Date(t.transaction_date).toLocaleString()}</td>
                        <td>${t.transaction_type}</td>
                        <td>$${t.amount}</td>
                        <td>${t.sender_username}</td>
                        <td>${t.receiver_username}</td>
                        <td>${t.status}</td>
                    </tr>
                `).join('');
            }
        } else {
            alert('Failed to load transactions');
        }
    } catch (error) {
        console.error('Transactions error:', error);
        alert('Error loading transactions');
    }
}

function logout() {
    localStorage.removeItem('token');
    token = null;
    isTestMode = false;
    updateNavBar(false);
    showSection('login');
}

// Ensure DOM is loaded before rendering dynamic content
document.addEventListener('DOMContentLoaded', renderApp);