let express = require('express'),
app = express(),
path = require('path');

app.enable('view cache');
app.set('view engine', 'pug');
app.set('views', path.join(__dirname, 'views'));

app.use(require('../src')); //include our middleware

app.get('/', function(req, res) {
  res.render('default');
});

module.exports = app;