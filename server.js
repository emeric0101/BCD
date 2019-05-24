// ---------------------------------------------------------------
// Import modules
// ---------------------------------------------------------------
var express     = require('express');
var path        = require('path');
var dotenv      = require('dotenv');
const orders   = require('./localService/mockdata/Orders.json');
const employees = require('./localService/mockdata/Employee.json');
const order_detail = require('./localService/mockdata/Order_Details.json')

//we need some variables.
dotenv.config();

// ---------------------------------------------------------------
// Instantiate the app
// ---------------------------------------------------------------

var app = express();

// Serve 'dynamic' jsx content being transformed if needed
var srcDir = path.resolve(__dirname);
var file;

// Récupération des shipping details à partir de l'order ID
app.post('/api/shipping/:orderid', function(req, res){
  const orderid = req.params.orderid; // on récupère l'orderid
  parseJSONBody(req, function(j){
    let order = orders.find(e => e.OrderID == orderid); // On compare l'order id à ceux présents dans le JSON
    const anwser = {
      "replies": [
      ],
      "conversation": {
        "language": "en",
        "memory": {
          "current_order": order
        }
      }
    }
    res.send(anwser); // On renvoie les infos correspondantes
  })
});



//the lightest HTTP server ever.
app.use('/', function (req, res) {
    file = srcDir + req.path;
    res.sendFile(file);
});

/*
Express body parser and proxy are incompatible.
*/
function parseJSONBody(res, callback){
    var body = '';
    res.on('data', function (data) {
        body += data;
        // Too much POST data, kill the connection!
        // 1e6 === 1 * Math.pow(10, 6) === 1 * 1000000 ~~~ 1MB
        if (body.length > 1e6)
            res.connection.destroy();
    });

    res.on('end', function () {
        callback(body);
    });
}




// ---------------------------------------------------------------
// Start the server
// ---------------------------------------------------------------
var server = app.listen(process.env.PORT || 1666, function () {
    process.stdout.write('Started dashboard dev server on port ' + server.address().port + '\n');
});
