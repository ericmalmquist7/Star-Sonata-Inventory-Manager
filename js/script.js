//Library Imports
/* var util = require('util');
console.log("Util Loaded");
var request = require('request');
console.log("Request Loaded");
var cheerio = require('cheerio');
console.log("Cherrio Loaded");
var xml2js = require('xml2js');
console.log("XML2JS Loaded");
var fs = require('fs');
console.log("FS Loaded"); */

const form = document.querySelector('form');
const tbody = document.querySelector('tbody');
	
function onSearchQuery(e){
	const query = document.getElementById('search').value;
	e.preventDefault();
	clearRows();
	addRow(query, 10, "a", "b", "c");
}

function clearRows(){
	tbody.innerHTML = "";
}

function addRow(item, quantity, account, character, ship){
	tbody.innerHTML += `
	<tr>
		<td>${item}</td>
		<td>${quantity}</td>
		<td>${account}</td>
		<td>${character}</td>
		<td>${ship}</td>
	</tr>
	`;
}

form.addEventListener('submit', onSearchQuery);


var parser = new xml2js.Parser();

var inventory = {};

var lastUpdate = 0;


function updateInv(){

	return new Promise(function(resolve){		
		var status = "";
		
		fs.readFile('./accounts.json', async function read(err, data) {
			if (err) {
				console.log("Error reading file:\n" + err);
				return message.reply("Error reading file: \n" + err);
			}
			var accountObj = JSON.parse(data);
			
			console.log("Updating " + accountObj.accounts.length + " accounts");
			
			inventory = {};
			
			
			for(k=0; k < accountObj.accounts.length; k++)
			{
				var u = accountObj.accounts[k].un;
				var p = accountObj.accounts[k].pw;
				
				status = await accountUpdate(u, p);
			
			}
			resolve(status);
		});
	});
}

function accountUpdate(u, p)
{
	return new Promise(resolve => {
			
		var status = "";
		var loading = 0;
		
		var j = request.jar();
		request = request.defaults({jar:j});
			
		var options = {
			url: 'https://www.starsonata.com/user/login',
			formData: {'username':u, 'password':p, 'stay_logged_in':'on'},
			jar:j,
			headers:{
				'Connection': 'keep-alive',
				'Content-Type': 'application/x-www-form-urlencoded',
				'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/68.0.3440.106 Safari/537.36'
			}
		};
		
		request.post(options, 'https://www.starsonata.com/user/login/', function(err, res, body){
			console.log('POST login sent.. user:' + u + ', Response code: ' + res.statusCode);
			
			options = {
			url: 'https://www.starsonata.com/user/assets/',
			headers:{
				'Connection': 'keep-alive',
				'Content-Type': 'application/x-www-form-urlencoded',
				'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/68.0.3440.106 Safari/537.36'
			}
			};
			
			request.get(options, function(err, res, body){
				console.log('GET assets sent.. Response code: ' + res.statusCode);
				if(res.statusCode === 500)
					status += "Internal Server Error (500)\n";
			
				var $ = cheerio.load(body);
				var table = $('.medium');
				var names = [];
				var links = [];
				
				for(i=0;i < 5;i++)
				{
					names.push($('table tr:nth-child('+(i+2)+') td:nth-child(1)').text());
					console.log("Name found in asset table: " + names[i]);
					links.push($('table tr:nth-child('+(i+2)+') td:nth-child(17) a:nth-child(2)').attr('href'));
				}
				
				var characters = [];
				var xmlLinks = [];
				for(i=0;i < names.length;i++)
				{
					if(names[i] !== "")
					{
						characters.push(names[i]);
						xmlLinks.push(links[i]);
					}
				}
				loading += characters.length;
				if(characters.length === 0)
				{
					console.log("Could not log in to account " + u + " - Did credentials change? Did starsonata.com break?");
					status += "No character data found (Some causes: Invalid credentials, failed login, server issues)\n";
					resolve(status);
				}
				else
				{
					inventory[u] = {};
					for(i=0;i < characters.length;i++)
					{
						options.url = xmlLinks[i];
						options.characterName = characters[i];
						
						request.get(options, function(err, res, body){
							console.log('GET assets sent.. Response code: ' + res.statusCode);
							
							if(err)
							{
								console.log("ERROR in GET:\n" + err);
								status += "Server Request.error - " + err + "\n";
							}		
							
							parser.parseString(body, function(err, result){
								if(err)
								{
									console.log("ERROR in parsing XML inventory (" + u + "(:\n" + err);
									status += "XML Parse error: " + err + " (This would accour if login failed)\n";
								}	
								else
								{			
									inventory[u][res.request.characterName] = result;
									console.log("Added inventory to " + u + ":" + res.request.characterName);
								}							
								loading--;
								if(loading === 0) resolve(status);
							});
						});
					}							
				}
			});
		});
	});
}
