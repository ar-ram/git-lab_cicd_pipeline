// index.js
import express from 'express';  // Use 'import' instead of 'require'

const app = express();
const port = 3000;

app.get('/', (req, res) => {
  res.send('hello to my team-mates');
});

app.listen(port, () => {
  console.log(`App listening at http://localhost:${port}`);
});
