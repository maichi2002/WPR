const mysql = require('mysql2');


const connection = mysql.createConnection({
  host: 'localhost',
  user: 'wpr',
  password: 'fit2023',
});


connection.connect((err) => {
  if (err) throw err;
  console.log('Connected to the database!');
  connection.query('drop database if exists wpr2023')

  const createDatabase = `CREATE DATABASE IF NOT EXISTS wpr2023;`;
  connection.query(createDatabase)
  connection.query('USE wpr2023;')

  
  const createUsersTable = `CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_name VARCHAR(255) NOT NULL UNIQUE,
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL
  )`;
  
  connection.query(createUsersTable, (err, result) => {
    if (err) throw err;
    console.log('Users table created!');
  });

  
  const createEmailsTable = `CREATE TABLE IF NOT EXISTS emails (
    id INT AUTO_INCREMENT PRIMARY KEY,
    sender_id INT NOT NULL,
    receiver_id INT NOT NULL,
    subject VARCHAR(255) NOT NULL,
    body TEXT NOT NULL,
    attachment VARCHAR(255),
    FOREIGN KEY (sender_id) REFERENCES users(id),
    FOREIGN KEY (receiver_id) REFERENCES users(id)
  )`;
  connection.query(createEmailsTable, (err, result) => {
    if (err) throw err;
    console.log('Emails table created!');
  });

  
  const insertUsers = `INSERT INTO users (user_name, full_name, email, password) VALUES
  ('user1', 'User One', 'a@a.com', 'password1'),
  ('user2', 'User Two', 'b@b.com', 'password2'),
  ('user3', 'User Three', 'c@c.com', 'password3')`;

  connection.query(insertUsers, (err, result) => {
    if (err) throw err;
    console.log('Users data inserted!');
  });

  
  const insertEmails = `INSERT INTO emails (sender_id, receiver_id, subject, body, attachment) VALUES
    (1, 2, 'Subject 1', 'Body 1', 'attachment1.pdf'),
    (1, 3, 'Subject 2', 'Body 2', 'attachment2.pdf'),
    (2, 1, 'Subject 3', 'Body 3', NULL),
    (2, 3, 'Subject 4', 'Body 4', NULL),
    (3, 1, 'Subject 5', 'Body 5', 'attachment3.pdf'),
    (3, 2, 'Subject 6', 'Body 6', NULL),
    (1, 2, 'Subject 7', 'Body 7', NULL),
    (2, 1, 'Subject 8', 'Body 8', 'attachment4.pdf')`;
  connection.query(insertEmails, (err, result) => {
    if (err) throw err;
    console.log('Emails data inserted!');
  });

  // Close the connection
  connection.end((err) => {
    if (err) throw err;
    console.log('Connection closed!');
  });
});
