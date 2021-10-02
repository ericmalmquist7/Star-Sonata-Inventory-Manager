const { ipcMain, app, BrowserWindow } = require('electron')

const util = require('util');
var request = require('request');
const cheerio = require('cheerio');
const xml2js = require('xml2js');
const fs = require('fs');
const { xml } = require('cheerio/lib/static');

var saved_data_path = app.getPath("appData") + "/SSIM/data.json";
var characters = {};
var saved_data = {};

var data = [];

var parser = new xml2js.Parser();



//INTERPROCESS COMMUNICATION

ipcMain.on('refresh', async (event) => {
  var xml_inventory = await updateInv(getSavedData(saved_data_path, true));
  data = parseData(xml_inventory);
  event.reply('refresh_reply', data);
})

ipcMain.on('select_data', (event, args) => {
	var selectedData = selectData(args);
	event.reply('select_data_reply', selectedData);
})

ipcMain.on('show_accounts', (event) => {
	if(isEmpty(saved_data)){
		saved_data = getSavedData(saved_data_path);
	}

	var accounts = [];
	for(var i in saved_data.accounts)
	{
		var a = saved_data.accounts[i].un
		accounts[a] = [];
		for(var c in characters[a]){
			accounts[a].push(characters[a][c])
		}
		console.log(accounts);
	}
	var response = {};	
	response.accounts = accounts;
	event.reply('show_accounts_reply', response);
	
})

ipcMain.on('remove_account', (event, args) => {
	var name = args.name;
	args.success = false;

	saved_data = getSavedData(saved_data_path, true);

	var index = -1;
	for(var i in saved_data.accounts){
		if(saved_data.accounts[i].un === name){
			index = i;
			break;
		}
	}
	
	if( index === -1){
		args.success = false;
	}
	else{
		saved_data.accounts.splice(index, 1)
		args.success = updateSavedData(saved_data_path, saved_data);
	}

	event.reply('remove_account_reply', args);
})

ipcMain.on('add_account', (event, args) => {
	var _un = args.un;
	var _pw = args.pw;
	//TODO add encrpytion
	saved_data = getSavedData(saved_data_path, true);
	
	var found = false;
	for (var i in saved_data.accounts){
		if(saved_data.accounts[i].un === _un){
			found = true;
			saved_data.accounts[i] = {un:_un, pw:_pw};
		}
	}
	if(!found) saved_data.accounts.push({un:_un, pw:_pw});
	var success = updateSavedData(saved_data_path, saved_data)

	var args = {}
	args.success = success;
	args.name = _un;
	event.reply('add_account_reply', success);
})


function selectData(args){
	var search_any = args.search_any;
	var search_exact = args.search_exact;
	if (search_exact != ''){
		search_any = search_any.concat(args.search_exact);
	}
	var search_exclude = args.search_exclude;
	
	var selectedData = [];
	for(var d in data){
		var item_str = data[d].item.toLowerCase();
		for(var i in search_any){
			if (item_str.includes(search_any[i])){
				//Found item, now we need to check for exclude fields
				var isExcluded = false;
				for(var e in search_exclude){
					if(item_str.includes(search_exclude[e])){
						isExcluded = true;
						break;
					}
				}
				if(!isExcluded){
					//Item is in _any_ and not _exclude_, now check for _exact_
					if(search_exact != ""){
						if(item_str == search_exact){
							selectedData.push(data[d]);
							break;
						}
					}
					else{
						//No exact terms supplied.
						selectedData.push(data[d]);
						break;
					}
				}
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

function parseData(xml_inventory){

	var dataPoints = [];

	for(var account in xml_inventory){
		for(var character in xml_inventory[account]){
			for(var ship in xml_inventory[account][character].inventory.DOCKEDSHIP){
				var _ship = xml_inventory[account][character].inventory.DOCKEDSHIP[ship].SHIP[0];

				var new_datapoints = parseShipData(account, character, _ship, true);
				dataPoints = dataPoints.concat(new_datapoints);
			}
			for(var ship in xml_inventory[account][character].inventory.SHIP){
				var _ship = xml_inventory[account][character].inventory.SHIP[ship];
				
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


function getSavedData(data_path, includePw){
	console.log("Retrieving saved data");
	var read_data;
	try {
		read_data = fs.readFileSync(data_path);
	  } catch (err) {
		if (err.code == 'ENOENT'){
			console.error("Could not find account file at " + data_path);
		}
		else console.error("Error reading file:\n" + err);
		return null;
	  }
		
	var saved_data = JSON.parse(read_data);
	if(includePw === "undefined" || !includePw){
		for(var a in saved_data.accounts){
			saved_data.accounts[a].pw = "";
		} 
		
	}
	console.log("Done");
	return saved_data;
}

function updateSavedData(data_path, newData){
	console.log("Saving data");
	try {
		var data_str = JSON.stringify(newData);
		fs.writeFileSync(data_path, data_str);
	  } catch (err) {
		if (err.code == 'ENOENT'){
			console.error("Could not find account file at " + data_path);
		}
		else console.error("Error reading file:\n" + err);
		return false;
	  }
	console.log("Done");
	return true;
}

async function updateInv(saved_data){
	console.log("Updating inventory");
	console.log("Updating " + saved_data.accounts.length + " accounts");
			
	var xml_inventorys = {};

	for(k=0; k < saved_data.accounts.length; k++)
	{
		var a = saved_data.accounts[k].un;
		var p = saved_data.accounts[k].pw;
		//TODO Add encryption

		
		var promise = accountUpdate(a, p);
		characters[a] = [];
		for( var c in xml_inventory[a]){
				characters[a].push(c);
		}
		xml_inventorys = Object.assign(xml_inventorys, xml_inventory);
				  
		
		
	}
	
}

function accountUpdate(u, p)
{
	return new Promise(function (resolve, reject){
			
		var xml_inventory = {};
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
					reject(Error(status));
				}
				else
				{
					xml_inventory[u] = {};
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
									xml_inventory[u][res.request.characterName] = result;
									console.log("Added inventory to " + u + ":" + res.request.characterName);
								}							
								loading--;
								if(loading === 0) resolve(xml_inventory);
							});
						});
					}							
				}
			});
		});
	});
}

function isEmpty(obj) {
    return Object.keys(obj).length === 0;
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
	  saved_data = getSavedData(saved_data_path);
	})

  })
