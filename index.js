const express = require('express');
const mysql = require('mysql2');
const ejs = require('ejs');
const multer = require('multer');
const app = express();
const cookieParser = require("cookie-parser");
const path = require('path');
const ITEM_PER_PAGE = 5;

const connection = mysql.createConnection({
  host: 'localhost',
  user: 'wpr',
  password: 'fit2023',
  database: 'wpr2023',
  port: 3306,
}).promise();

const upload = multer();

connection.query('USE wpr2023');
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

connection.connect((error) => {
  if (error) {
    console.log('Error connecting to database: ' + error.stack);
    return;
  }
  console.log('Connected to database as id ' + connection.threadId);
});

app.get('/', (req, res) => {
  const signInUser = req.cookies.signInUser;
  if (signInUser) {
    res.redirect('/inbox');
  }
  else {
    res.render('signin', { error: null });
  }
});

app.post('/', async (req, res) => {
  const username = req.body.username;
  const password = req.body.password;

  // Check user and password
  const query = `SELECT COUNT(*) FROM users WHERE username = ? AND password = ?`;

  try {
    const [result] = await connection.query(query, [username, password]);

    if (result[0]['COUNT(*)'] === 0) {
      return res.status(401).render('signin', { error: "Username or password is not correct" });
    }

    // If both username and password are correct, set a cookie and redirect
    res.cookie('signInUser', username, { maxAge: 3600000 });
    res.redirect('/inbox');
  } catch (error) {
    console.log('Error in sign-in:', error);
    res.status(500).render('error', { error: 'Internal Server Error' });
  }
});

app.get('/signup', (req, res) => {
  res.render('signup', { error: null });
});

app.post('/signup', async (req, res) => {
  const full_name = req.body.full_name;
  const username = req.body.username;
  const email = req.body.email;
  const password = req.body.password;
  const confirmPassword = req.body.confirmPassword;

  if (confirmPassword !== password)
    return res.status(400).render('signup', { error: 'Re-enter password does not match password' })

  if (password.length < 6)
    return res.status(400).render('signup', { error: 'The password is too short (less than 6 characters)' })

  // Check if a user with the same email or username already exists
  const checkUserQuery = 'SELECT COUNT(*) AS userCount FROM users WHERE email = ? OR username = ?';

  try {
    const [userCheckResult] = await connection.query(checkUserQuery, [email, username]);
    const userCount = userCheckResult[0].userCount;

    if (userCount > 0) {
      return res.status(400).render('signup', { error: 'User with the same email or username already exists' })
    }

    // Create a new user
    const insertUserQuery = 'INSERT INTO users (full_name, username, email, password) VALUES (?, ?, ?, ?)';
    await connection.query(insertUserQuery, [full_name, username, email, password]);

    res.redirect('welcome')
  } catch (error) {
    console.error('Error during signup:', error);
    res.status(500).json({ error: 'Internal Server Error.' });
  }
});

app.get('/welcome', (req, res) => {
  const signedUpUser = req.cookies.signInUser;
  res.render('welcome', { username: signedUpUser });
});

app.get('/inbox', async (req, res) => {
  const signInUser = req.cookies.signInUser;

  if (signInUser) {
    const pageCurrent = parseInt(req.query.page) || 1;
    try {
      // Fetch total elements
      const totalElementsResult = await connection.query(`
              SELECT COUNT(*) as total_elements
              FROM emails
              WHERE receiver_id = (SELECT id FROM users WHERE username = '${signInUser}')
              AND is_deleted_by_receiver = 0;
          `);

      const totalElements = totalElementsResult[0][0].total_elements;

      // Fetch inbox mails with pagination
      const offset = (pageCurrent - 1) * ITEM_PER_PAGE;
      const result = await connection.query(`
              SELECT emails.*, sender.username as sender_username
              FROM emails
                  INNER JOIN users AS sender ON emails.sender_id = sender.id
              WHERE emails.receiver_id = (SELECT id FROM users WHERE username = '${signInUser}')
                  AND emails.is_deleted_by_receiver = 0
              ORDER BY emails.created_date DESC
              LIMIT ${ITEM_PER_PAGE} OFFSET ${offset};
          `);

      const inboxMails = result[0];
      const totalPages = Math.ceil(totalElements / ITEM_PER_PAGE);

      res.render('inbox', {
        inboxMails,
        totalElements,
        totalPages,
        pageCurrent,
      });
    } catch (error) {
      console.log('Fetching inbox data is error:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  } else {
    res.redirect('/signin');
  }
});

app.post('/deleteEmails', async (req, res) => {
  const signInUser = req.cookies.signInUser;
  const selectedEmails = req.body.emails;

  try {
    // Update the database to mark emails as deleted
    const updateQuery = `
          UPDATE emails
          SET is_deleted_by_receiver = 1
          WHERE receiver_id = (SELECT id FROM users WHERE username = '${signInUser}')
          AND email_id IN (${selectedEmails.join(',')})
          AND is_deleted_by_receiver = 0;
      `;

    const result = await connection.query(updateQuery);

    if (result[0].affectedRows > 0) {
      res.status(200).json({ success: true });
    } else {
      // No rows were affected, meaning the emails were not found or already deleted
      res.status(404).json({ error: 'Emails not found or already deleted' });
    }
  } catch (error) {
    console.error('Error while deleting emails:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get('/email/:id', async (req, res) => {
  const id = req.params.id;

  try {
    const result = await connection.query('SELECT * FROM emails WHERE id = ?', [id]);
    const email = result[0][0]; // Assuming there's only one email with the given id

    if (email) {
      res.render('emailDetail', {
        emailSubject: email.subject,
        emailBody: email.body,
        attachmentLink: email.attachment,
      });
    } else {
      res.status(404).send('Email not found');
    }
  } catch (error) {
    console.log('Failed to retrieve email:', error);
    res.status(500).send('Internal Server Error');
  }
});

app.get('/outbox', async (req, res) => {
  const signInUser = req.cookies.signInUser;

  if (signInUser) {
    try {
      const elementsResult = await connection.query(`
              SELECT COUNT(*) as total_elements
              FROM emails
              INNER JOIN users ON emails.sender_id = users.id
              WHERE users.username = '${signInUser}' AND emails.is_deleted_by_sender = 0;
          `);

      const totalElements = elementsResult[0][0].total_elements;
      const pageCurrent = parseInt(req.query.page) || 1;
      const offset = (pageCurrent - 1) * ITEM_PER_PAGE;

      const result = await connection.query(`
              SELECT emails.*, users.full_name as recipientFullName
              FROM emails
              INNER JOIN users ON emails.receiver_id = users.id
              WHERE emails.sender_id = (SELECT id FROM users WHERE username = '${signInUser}')
              AND emails.is_deleted_by_sender = 0
              LIMIT ${ITEM_PER_PAGE} OFFSET ${offset};
          `);

      const outboxMails = result[0];
      const totalPages = Math.ceil(totalElements / ITEM_PER_PAGE);

      res.render('outbox', {
        outboxMails,
        totalElements,
        totalPages,
        pageCurrent,
      });

    } catch (error) {
      console.log('Error fetching outbox data:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  } else {
    res.redirect('/');
  }
});

app.get('/compose', async (req, res) => {
  const signedInUser = req.cookies.signInUser;

  if (signedInUser) {
    try {
      const result = await connection.query(`SELECT username FROM users WHERE username != '${signedInUser}';`);
      const recipients = result[0].map(user => user.username);

      res.render('compose', { recipients });
    } catch (error) {
      console.error('Error fetching recipients:', error);
      res.status(500).send('Internal Server Error');
    }
  } else {
    res.redirect('/signin');
  }
});

app.post('/compose', upload.none(), async (req, res) => {
  const { subject, body, recipient } = req.body;
  const senderUsername = req.cookies.signInUser;

  if (!subject && !body && !recipient) {
    return res.status(400).type("text").send("Invalid email information! Missing parameters: subject, body, recipient");
  }

  try {
    // Fetch sender_id
    const [senderResult] = await connection.query(`SELECT id FROM users WHERE username = ?`, [senderUsername]);

    const senderId = senderResult[0]?.id;

    if (!senderId) {
      return res.status(400).type("text").send("Invalid sender information");
    }

    // Fetch receiver_id
    const [recipientResult] = await connection.query(`SELECT id FROM users WHERE username = ?`, [recipient]);

    const recipientId = recipientResult[0]?.id;

    if (!recipientId) {
      return res.status(400).type("text").send("Invalid recipient information");
    }

    // Insert email into the database
    const insertQuery = `
      INSERT INTO emails (subject, body, sender_id, receiver_id)
      VALUES (?, ?, ?, ?)
    `;

    await connection.query(insertQuery, [subject || '(no subject)', body, senderId, recipientId]);

    res.redirect('/outbox');
  } catch (error) {
    console.error('Failed to send email:', error);
    res.status(500).send('Internal Server Error');
  }
});

app.get('/signout', (req, res) => {
  res.send('Sign-out page');
});

app.listen(8000, () => {
  console.log(`App listening at http://localhost:8000`);
});
