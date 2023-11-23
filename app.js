const express = require('express');
const mysql = require('mysql2');
const ejs = require('ejs');
const db = require("./dbsetup");
const app = express();
const bodyParser = require("body-parser");
const cookieParser = require("cookie-parser");
const path = require('path');
const { error } = require('console');
const ITEM_PER_PAGE = 5;

const connection = mysql.createConnection({
  host: 'localhost',
  user: 'wpr',
  password: 'fit2023',
  database: 'wpr2023',
  port: 3306,
}).promise();

connection.query('USE wpr2023');
app.use (express.urlencoded({extended: true}));
app.use (cookieParser());
app.use (bodyParser.json());

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');


connection.connect((error) => {
  if (error) {
    console.error('Error connecting to database: ' + error.stack);
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
    res.redirect('/signin');
  }
});

app.get('/signup', (req, res) => {
  res.render('/signup');
});

app.get('/signin', (req, res) => {
  const signInUser = req.cookies.signInUser;
  if (signInUser){
    res.redirect('/inbox');
  } else {
    res.render ('signin')
  }
});

app.post ('/signup', async(req, res) => {
  const full_name = req.body.full_name;
  const user_name = req.body.user_name;
  const email = req.body.email;
  const password = req.body.password;
  
  const confirmPassword = req.body.confirm_password;
  if (password !== confirmPassword) {
    return res.status(400).json({ error: 'Password is wrong.' });
  }

  try {
    // Tạo một bản ghi người dùng mới
    const newUser = new User({ full_name, user_name, email, password });

    // Lưu vào cơ sở dữ liệu
    await newUser.save();

    res.status(201).json({ message: 'Signup successfully.' });
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error.' });
  }
});

app.post ('/signin', async (req, res) => {
  const user_name = req.body.user_name;
  const password = req.body.password;
  let missingParams = [];
  if (user_name === undefined) {
    missingParams.push('user_name')
  }
  if (password === undefined) {
    missingParams.push('password')
  }
  if (missingParams.length > 0) {
    res.status (400).type("text").send("User's information is invalid")
  } else {
    const query = `SELECT COUNT (*) FROM users WHERE users.user_name = '${user_name}'`
    await connection.query(query).then(([result]) => {
      if (result[0]['COUNT (*)'] === 0) {
        res.status (400).type('text').send("Sorry, username does not exist.")
      }
    })
    res.cookie ('signInUser', user_name, {maxAge: 3600000});
    res.redirect('/inbox');
  }
});

app.get ('/inbox', async (req, res) => {
  const signInUser = "user1";
  if (signInUser) {
    const pageCurrent = parseInt (req.query.page) || 1;
    try {
      const elementsResult = await connection.query(
        `SELECT COUNT (*) as total_elements FROM emails INNER JOIN users ON emails.receiver_id = users.id WHERE users.user_name = '${signInUser}' AND emails.is_deleted_by_receiver = 0;`
      );
      const totalElements = elementsResult[0][0].total_elements;
      const offset = (pageCurrent - 1) * ITEM_PER_PAGE;
      const result = await connection.query(`
      SELECT emails.*, sender.id as sender_id, sender.user_name as sender_username, receiver.id as receiver_id, receiver.user_name as receiver_username
      FROM emails INNER JOIN users AS sender ON emails.sender_id = sender.id
                  INNER JOIN users AS receiver ON emails. receiver_id = receiver.id
      WHERE receiver.user_name = '${signInUser}'
      AND emails.is_deleted_by_receiver = 0
      ORDER BY emails.created_date DESC
      LIMIT ${ITEM_PER_PAGE} OFFSET ${offset};`);
      const inboxMails = result [0];
      const totalPages = Math.cell (totalElements/ITEM_PER_PAGE);
      res.render ('inbox', {
        inboxMails, totalElements, totalPages, pageCurrent,
      });
    } catch (error) {
      console.error ('Fetching inbox data is error:', error);
      res.status (500).json({error: 'Internal Server Error'});
    }
  } else {
    res.redirect ('/signin');
  }
});

app.delete ('/:type/delete', async (req, res) => {
  const selected_emails = req.body.selected_emails;

  const user_name = "user1";
  const type = req.params.type;
  const user_id = await connection.query(`SELECT id FROM users WHERE user_name = '${user_name}'`).then (([result]) => {
    return result[0].id;
  });
  console.log(user_id);
  const updateColumn = (type === 'sender') ? 'is_deleted_by_sender' : 'is_deleted_by_receiver';
  const updateQuery = `UPDATE emails SET ${updateColumn} = true WHERE email_id IN (${selected_emails}) AND receiver_id = ${user_id}`;
  await connection.query (updateQuery) 
  .then (results => {
    res.json({message: 'Emails updated successfully'});
  })
  .catch (error => {
    console.error ('Error updating emails:', error);
    res.status(500).json({error:'Internal Server Error'});
  });
});

// Single email detail page (lets user reads an email)
app.get('/email/:id', async (req, res) => {
  const id = req.params.id;
  
  try {
    const result = await connection.query(`SELECT * FROM emails WHERE email_id = '${id}'`);
    const email = result[0];

    res.json(email);
  } catch (error) {
    console.error('Failed to retrieve email:', error);
    res.status(500).send('Internal Server Error');
  }
});


// Outbox page (show sent emails)
app.get('/outbox', async (req, res) => {
  const signInUser = req.cookies.signInUser;

  if (signInUser) {
    try {
      const elementsResult = await connection.query(`SELECT COUNT(*) as total_elements FROM emails 
                                                    INNER JOIN users ON emails.sender_id = users.id
                                                    WHERE users.user_name = '${signInUser}' AND emails.is_deleted_by_sender = 0;`);

      const totalElements = elementsResult[0][0].total_elements;
      const pageCurrent = parseInt(req.query.page) || 1;
      const offset = (pageCurrent - 1) * ITEM_PER_PAGE;

      const result = await connection.query(`SELECT emails.*, users.user_name FROM emails 
                                            INNER JOIN users ON emails.sender_id = users.id 
                                            WHERE users.user_name = '${signInUser}' AND emails.is_deleted_by_sender = 0 
                                            LIMIT ${ITEM_PER_PAGE} OFFSET ${offset};`);

      const outboxMails = result[0];
      const totalPages = Math.ceil(totalElements / ITEM_PER_PAGE);

      res.render('outbox', {
        outboxMails, totalElements, totalPages, pageCurrent
      });

    } catch (error) {
      console.error('Error fetching outbox data:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  } else {
    res.redirect('/signin');
  }
});


// Compose page (let user create and send an email to one receiver)
app.get('/compose', async (req, res) => {
  const signedInUser = req.cookies.signInUser;

  if (signedInUser) {
    try {
      const result = await connection.query(`SELECT email, id FROM users;`);
      const listOfUsers = result[0];
      res.render('compose');
    } catch (error) {
      res.status(500).send('Internal Server Error');
    }
  } else {
    res.redirect('/signin');
  }
});


app.post('/compose', async (req, res) => {
  const subject = req.body.subject;
  const content = req.body.content;
  const receiver_email = req.body.receiver_email;

  const sender = "user1";
  let missingParams = [];

  if (subject === undefined) {
    missingParams.push('subject');
  }
  if (content === undefined) {
    missingParams.push('content');
  }
  if (receiver_email === undefined) {
    missingParams.push('receiver_email');
  }

  if (missingParams.length > 0) {
    res.status(400).type("text").send(`Invalid email information! Missing parameters: ${missingParams}`);
  } else {
    let receiver_id, sender_id;

    try {
      const receiverResult = await connection.query(`SELECT id FROM users WHERE email = '${receiver_email}'`);
      receiver_id = receiverResult[0].id;
      console.log(receiver_id);

      const senderResult = await connection.query(`SELECT id FROM users WHERE user_name = '${sender}'`);
      sender_id = senderResult[0].id;
      console.log(sender_id);

      if (receiver_id && sender_id) {
        const insert_query = `INSERT INTO emails (subject, content, receiver_id, sender_id) VALUES ('${subject}', '${content}', '${receiver_id}', '${sender_id}')`;

        await connection.query(insert_query);
        res.redirect('/outbox');
      }
    } catch (error) {
      console.error('Failed to send email:', error);
      res.status(500).send('Internal Server Error');
    }
  }
});



// Send email
app.post('/send', (req, res) => {
});

// Sign-out feature
app.get('/signout', (req, res) => {
  res.send('Sign-out page');
});

app.listen(8000, () => {
  console.log(`App listening at http://localhost:8000`);
});
