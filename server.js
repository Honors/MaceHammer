var http = require('http'),
	fs = require('fs'),
	app = require('./route'),
	nodemailer = require("nodemailer");
var Showdown = require('showdown');
var converter = new Showdown.converter();
	
var smtpTransport = nodemailer.createTransport("SMTP", {
    service: "Gmail",
    auth: {
        user: "neary.matt@gmail.com",
        pass: "ipnpfirpjlfqdjuj"
    }
});
var parseTemplate = function(template, pattern, parser, cb) {
	var embeds = [], embedReads = {};
	template.replace(pattern, function(match, name) {
		embeds.push(name);
	});
	
	var substituteEmbeds = function() {
		cb(template.replace(pattern, function(match, name) {
			return parser(embedReads[name]);
		}));
	};
	
	embeds.forEach(function(embed) {
		fs.readFile(__dirname + '/copy/' + embed, function(err, data) {
			embedReads[embed] = ""+data;
			if( Object.keys(embedReads).length == embeds.length ) {
				substituteEmbeds();
			}
		});
	});
};	
var renderTemplate = function(template, cb) {
	var parse_embeds = function(cb, template) {
		if( !template.match(/@embed{([^}]+)}/g) ) {
			cb(template);
		}
		parseTemplate(template, /@embed{([^}]+)}/g, function(md) {
			return converter.makeHtml(md).replace(/\n/g, ' ');
		}, function(composite) {
			cb(composite);
		});
	};
	var parse_raws = function(cb, template) {
		if( !template.match(/@raw{([^}]+)}/g) ) {
			cb(template);
		}
		parseTemplate(template, /@raw{([^}]+)}/g, function(json) {
			return json;
		}, function(composite) {
			cb(composite);
		});
	};
	var parse_jsons = function(cb, template) {
		if( !template.match(/@json{([^}]+)}/g) ) {
			cb(template);
		}
		parseTemplate(template, /@json{([^}]+)}/g, function(md) {
			var html = converter.makeHtml(md);
			var sections = html.split('<h1').map(function(section) {
				return '<h1'+section.replace(/\n/g, '');
			}).slice(1);
			var dict = {};
			sections.forEach(function(section) {
				var key = section.match(/^<h1[^>]*?>([\s\S]+)<\/h1>/)[1];
				var value = section.replace(/^<h1[^>]*?>[\s\S]+<\/h1>/, '');
				dict[key] = value;
			});
			return JSON.stringify(dict);
		}, function(composite) {
			cb(composite);
		});		
	};	 	    	
	
	parse_embeds(parse_jsons.bind({}, parse_raws.bind({}, cb)), template);
};
var findProduct = function(SKU, products) {
	for( var k in products ) {
		if( products[k].SKU == SKU ) return products[k];
	}
	return {};
};
app.get({
	path: /^/,
	cb: function(req, res) {
		var map = {
			'/edit': '/editor.html',
			'/': '/tmpl.html',
			'/store': '/store.html',
		};
		if( map[req.url] ) {
			var path = __dirname + map[req.url];
			res.writeHead(200, {'Content-Type': 'text/html'});
			fs.readFile(path, function(err, data) {
				var template = ""+data;
				renderTemplate(template, function(html) {
					res.end(html);
				});
			});
		} else {
			var path = __dirname + req.url;		
			var types = { "js": "text/javascript", "jpg": "image/jpeg", "html": "text/html", "png": "image/png" };
			fs.stat(path, function(err, stat) {
			    if (!err) {
					res.writeHead(200, {'Content-Type': types[path.match(/\.([^\.]+)$/)[1]]||"text/html"});
					fs.createReadStream(path).pipe(res);
			    } else {
			        res.writeHead(404);
			        res.end();
			    }
			});
		}		
	}
}).get({
	path: /^\/purchase\/[^\/]+/,
	cb: function(req, res) {
		var path = __dirname + '/checkout.html';
		res.writeHead(200, {'Content-Type': 'text/html'});
		fs.readFile(path, function(err, data) {
			var template = ""+data;
			renderTemplate(template, function(html) {
				res.end(html);
			});
		});
	}
}).post({
	path: /^\/upload/,
	cb: function(req, res) {
		var buffer = [], file = req.url.substr(1).split('/')[1];
		req.on("data", function(chunk) {buffer.push(chunk)});
		req.on("end", function() {
			fs.writeFile(__dirname + '/copy/' + file, buffer, function(err) {
				res.end(JSON.stringify({ error: err }));
			});
		});
	}
}).post({
	path: /^\/pay/,
	cb: function(req, res) {
		var buffer = [], file = req.url.substr(1).split('/')[1];
		req.on("data", function(chunk) {buffer.push(chunk)});
		req.on("end", function() {
			var purchase = JSON.parse(buffer.join(""));
			fs.readFile(__dirname + '/copy/products.json', function(err, data) {
				var products = JSON.parse(""+data),
					product = findProduct(purchase.SKU, products),
					token = purchase.token;
				
				// TODO: process payment with stripe...
				
				var mailOptions = {
				    from: "MaceHammer Storefront <neary.matt@gmail.com>",
				    to: "macehammerfitness@gmail.com",
				    subject: "Order of "+purchase.SKU+": "+purchase.name,
				    text: "Payment from "+purchase.name,
				    html: "<b>Payment has been processed.</b>"
				};	
				smtpTransport.sendMail(mailOptions, function(error, response){
					res.end(JSON.stringify({ err: error, success: !error }));
				});				
			});
		});
	}
})


exports.module = http.createServer(function(req, res) {
  // reject all requests
  res.writeHead(301, { 'Content-Type': 'text/html' });
  res.end("<h1>Moved Permanently.</h1>");
});
