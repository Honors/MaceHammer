var http = require('http'),
	fs = require('fs');
var Showdown = require('showdown');
var converter = new Showdown.converter();
	
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
exports.module = http.createServer(function(req, res) {	
	if( req.url.match(/^\/upload/) ) {
		var buffer = [], file = req.url.substr(1).split('/')[1];
		req.on("data", function(chunk) {buffer.push(chunk)});
		req.on("end", function() {
			fs.writeFile(__dirname + '/copy/' + file, buffer, function(err) {
				res.end(JSON.stringify({ error: err }));
			});
		});		
		return;
	}

	var path = __dirname + (req.url == '/' ? '/index.html' : req.url);
	fs.stat(path, function(err, stat) {
	    if (!err && req.url != '/') {
			res.writeHead(200, {'Content-Type': path.match(/js$/)?'text/javascript':'text/html'});
			fs.createReadStream(path).pipe(res);
	    } else if( req.url == '/' ) {
	    	res.writeHead(200, {'Content-Type': path.match(/js$/)?'text/javascript':'text/html'});
	    	fs.readFile(__dirname + '/tmpl.html', function(err, data) {
	    		var template = ""+data;
	    		var parse_embeds = function(cb, template) {
		    		parseTemplate(template, /@embed{([^}]+)}/g, function(md) {
		    			return converter.makeHtml(md);
		    		}, function(composite) {
		    			cb(composite);
		    		});
				};
	    		var parse_jsons = function(cb, template) {
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
	    		
	    		parse_embeds(parse_jsons.bind({}, function(html) {
	    			res.end(html);
	    		}), template);
	    	});
	    } else {
	        res.writeHead(404);
	        res.end();
	    }
	});
});