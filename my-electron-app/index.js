const { ipcMain, app, BrowserWindow } = require('electron')

const util = require('util');
var request = require('request');
const cheerio = require('cheerio');
const xml2js = require('xml2js');
const fs = require('fs');

var parser = new xml2js.Parser();

var inventory = {};
var data = [];

ipcMain.on('get_saved_data', async (event) => {
  var data_path = app.getPath("appData") + "/SSIM/accounts.json";
  await updateInv(data_path);
  data = parseData();
  event.reply('get_saved_data_reply', data);
})

ipcMain.on('select_data', (event, args) => {
	var selectedData = selectData(args);
	event.reply('select_data_reply', selectedData);
})

function selectData(args){
	var must_include = args.must_include;
	
	var selectedData = [];
	for(var d in data){
		for(var i in must_include){
			if (data[d].item.includes(must_include[i])){
				selectedData.push(data[d]);
			}
		}
	}
	return selectedData;
}

class DataPoint {
	constructor(account, character, ship, alias, item, quantity, isDocked, isEquipped) {
	  this.account = account;
	  this.character = character;
	  this.ship = ship;
	  this.alias = alias;
	  this.item = item;
	  this.quantity = quantity;
	  this.isDocked = isDocked;
	  this.isEquipped = isEquipped;
	}
  }

function parseData(){

	var dataPoints = [];

	for(var account in inventory){
		for(var character in inventory[account]){
			for(var ship in inventory[account][character].inventory.DOCKEDSHIP){
				var _ship = inventory[account][character].inventory.DOCKEDSHIP[ship].SHIP[0];

				var new_datapoints = parseShipData(account, character, _ship, true);
				dataPoints = dataPoints.concat(new_datapoints);
			}
			for(var ship in inventory[account][character].inventory.SHIP){
				var _ship = inventory[account][character].inventory.SHIP[ship];
				
				var new_datapoints = parseShipData(account, character, _ship, false);
				dataPoints = dataPoints.concat(new_datapoints);
			}
		}
	}
	return dataPoints;
}

function parseShipData(account, character, _ship, isDocked){
	var dataPoints = [];

	var ship_name = _ship.HULL[0]._;

	if(hasProp(_ship, 'SHIP_ALIAS')){
		var ship_alias = _ship.SHIP_ALIAS[0];
	}
	else{
		var ship_alias = "";
	}

	if(hasProp(_ship, 'ITEM')){
		
		for(var item in _ship.ITEM){
			var _item = _ship.ITEM[item];

			var item_name = _item.$.nm;
			if(hasProp(_item.$, 'quant')) 
				var quantity = parseInt(_item.$.quant);
			else var quantity = 1;

			var isEquipped = _item.$.eqp;
			isEquipped = !!parseInt(isEquipped);
			
			var DP = new DataPoint(account, character, ship_name, ship_alias, item_name, quantity, isDocked, isEquipped)
			dataPoints.push(DP);
		}
	}
	else if(hasProp(_ship, 'ITEMLIST')){
		for(var item in _ship.ITEMLIST[0].ITEM){
			var _item = _ship.ITEMLIST[0].ITEM[item];

			var item_name = _item.$.nm;
			if(hasProp(_item.$, 'quant')) 
				var quantity = parseInt(_item.$.quant);
			else var quantity = 1;

			var isEquipped = _item.$.eqp;
			isEquipped = !!parseInt(isEquipped);
			
			var DP = new DataPoint(account, character, ship_name, ship_alias, item_name, quantity, isDocked, isEquipped)
			dataPoints.push(DP);
		}
	}
	else{
		console.log("Could not find any items on " + account + "->" + character + "->" + ship_name + "->" + ship_alias)
	}

	return dataPoints;
}

function updateInv(data_path){
	console.log("Updating inventory");
	
	return new Promise(function(resolve){		
		var status = "";
		
		fs.readFile(data_path, async function read(err, data) {
			if (err) {
				console.log("Error reading file:\n" + err);
				if (err.code == 'ENOENT'){
					console.log("Could not find account file at " + data_path);
				}
				return "Error reading file: \n" + err;
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

function hasProp (obj, prop) {
	return Object.prototype.hasOwnProperty.call(obj, prop);
  }

//Window Management  
function createWindow () {
	const win = new BrowserWindow({
	width: 1400,
	height: 1000,
	webPreferences: {
		enableRemoteModule: true,
		nodeIntegration: true,
		contextIsolation: false,
	}
	})

	win.loadFile('index.html')
}

app.whenReady().then(() => {
	createWindow();
	
	app.on('window-all-closed', function () {
	  if (process.platform !== 'darwin') app.quit()
    })
  
	app.on('activate', function () {
	  if (BrowserWindow.getAllWindows().length === 0) createWindow()
	})
  })
