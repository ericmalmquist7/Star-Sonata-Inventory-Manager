const { ipcMain, app, BrowserWindow } = require('electron')

var request = require('request');
const cheerio = require('cheerio');
const xml2js = require('xml2js');
const fs = require('fs');
const CryptoJS = require('crypto-js');

var win; //Window reference to switch active html file

var saved_data_path = `${__dirname}/data.json`;

var data = []; //Global storage of parsed data points (So we don't have to pull XML data on every request)

class AccountInfo{
	constructor (un, pw, characterArray, loaded, error){
		this.un = un;
		this.pw = pw;
		this.characterArray = characterArray;
		this.loaded = loaded; //true false
		this.error = error; //if no errors, error is null
	}
}

//INTERPROCESS COMMUNICATION
ipcMain.on('refresh', async (event) => {
  let xml_inventory = await updateInv(getSavedData());
  data = parseData(xml_inventory);
  event.reply('refresh_reply', data);
})

ipcMain.on('select_data', (event, args) => {
	let selectedData = selectData(args);
	event.reply('select_data_reply', selectedData);
})

ipcMain.on('show_accounts', (event) => {
	let response = {};	
	let saved_data = getSavedData();
	response.accounts = saved_data.accounts;
	event.reply('show_accounts_reply', response);
	
})

ipcMain.on('remove_account', (event, args) => {
	let name = args.name;

	args = {};
	args.success = false;

	let saved_data = getSavedData();

	let index = -1;
	for(let i in saved_data.accounts){
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
		args.success = updateSavedData(saved_data);
	}

	event.reply('remove_account_reply', args);
})

ipcMain.on('add_account', (event) => {
	win.loadURL(`file://${__dirname}/accountWindow.html`);
})

ipcMain.on('new_account', async (event, args) => {
	let _un = args.un;
	let _pw = args.pw;

	let responseCode = await testLogin(_un, _pw);
	
	if(!(responseCode === 302)){args = {}
		args.success = false;
		args.name = _un;
		if(responseCode === 200 || responseCode == 401){ //Server login failure returns 200 (lol). Expected behavior is 401.
			args.error = "Failed to login, invalid credentials. Response code: " + responseCode;
		}else{
			args.error = "Failed to login. Response code: " + responseCode;
		}
		event.reply('new_account_reply', args);
		return;
	}

	_pw = CryptoJS.AES.encrypt(_pw, "https://www.youtube.com/watch?v=dQw4w9WgXcQ").toString();
	let saved_data = getSavedData();
	
	let found = false;
	for (let i in saved_data.accounts){
		if(saved_data.accounts[i].un === _un){
			found = true;
			saved_data.accounts[i] = new AccountInfo(_un, _pw, [], false, null);
		}
	}

	if(!found) {
		saved_data.accounts.push(new AccountInfo(_un, _pw, [], false, null));
	}
	let saveSuccess = updateSavedData(saved_data)


	args = {}
	args.success = saveSuccess;
	args.name = _un;
	if(saveSuccess){
		win.loadURL(`file://${__dirname}/index.html`);
	}
	else{
		args.error = "Failed to save data to file.";
		event.reply('new_account_reply', args);
	}
})

ipcMain.on('return_home', (event) => {
	win.loadURL(`file://${__dirname}/index.html`);
})

//Data parsing functions
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

function selectData(args){
	let search_any = args.search_any;
	let search_exact = args.search_exact;
	if (search_exact != ''){
		search_any = search_any.concat(args.search_exact);
	}
	let search_exclude = args.search_exclude;

	let characterFilter = args.characterFilter;
	let accountFilter = args.accountFilter;

	let selectedData = [];
	for(let i in data){
		//Check account and character filters
		if(accountFilter.includes(data[i].account) || 
		characterFilter.includes(data[i].character)){
			continue;
		}
		let item_str = data[i].item.toLowerCase();

		for(let j in search_any){
			if (item_str.includes(search_any[j])){
				//Found item, now we need to check for exclude fields
				let isExcluded = false;
				for(let e in search_exclude){
					if(item_str.includes(search_exclude[e])){
						isExcluded = true;
						break;
					}
				}
				if(!isExcluded){
					//Item is in _any_ and not _exclude_, now check for _exact_
					if(search_exact != ""){
						if(item_str == search_exact){
							selectedData.push(data[i]);
							break;
						}
					}
					else{
						//No exact terms supplied.
						selectedData.push(data[i]);
						break;
					}
				}
			}
		}
	}
	return selectedData;
}

function parseData(xml_inventory){

	let dataPoints = [];

	for(let account in xml_inventory){
		for(let character in xml_inventory[account]){
			for(let ship in xml_inventory[account][character].inventory.DOCKEDSHIP){
				let _ship = xml_inventory[account][character].inventory.DOCKEDSHIP[ship].SHIP[0];

				dataPoints = dataPoints.concat(parseShipData(account, character, _ship, true))
			}
			for(let ship in xml_inventory[account][character].inventory.SHIP){
				let _ship = xml_inventory[account][character].inventory.SHIP[ship];
				
				dataPoints = dataPoints.concat(parseShipData(account, character, _ship, false));
			}
		}
	}
	return dataPoints;
}

function parseShipData(account, character, _ship, isDocked){
	let dataPoints = [];

	let ship_name = _ship.HULL[0]._;

	let ship_alias = ""
	if(hasProp(_ship, 'SHIP_ALIAS')) ship_alias = _ship.SHIP_ALIAS[0];
	

	if(hasProp(_ship, 'ITEM')){
		
		for(let item in _ship.ITEM){
			let _item = _ship.ITEM[item];

			let item_name = _item.$.nm;
			let quantity = 1;
			if(hasProp(_item.$, 'quant')) quantity = parseInt(_item.$.quant);

			let isEquipped = _item.$.eqp;
			isEquipped = !!parseInt(isEquipped);
			
			let DP = new DataPoint(account, character, ship_name, ship_alias, item_name, quantity, isDocked, isEquipped)
			dataPoints.push(DP);
		}
	}
	else if(hasProp(_ship, 'ITEMLIST')){
		for(let item in _ship.ITEMLIST[0].ITEM){
			let _item = _ship.ITEMLIST[0].ITEM[item];

			let item_name = _item.$.nm;
			let quantity = 1;
			if(hasProp(_item.$, 'quant')) quantity = parseInt(_item.$.quant);

			let isEquipped = _item.$.eqp;
			isEquipped = !!parseInt(isEquipped);
			
			let DP = new DataPoint(account, character, ship_name, ship_alias, item_name, quantity, isDocked, isEquipped)
			dataPoints.push(DP);
		}
	}
	else{
		console.log("Could not find any items on " + account + "->" + character + "->" + ship_name + "->" + ship_alias)
	}

	return dataPoints;
}


//Local data Processing
function getSavedData(){
	console.log("Retrieving saved data");

	let data_path = saved_data_path;
	let read_data;
	try {
		read_data = fs.readFileSync(data_path);
	  } catch (err) {
		if (err.code == 'ENOENT'){
			console.error("Could not find account file at " + data_path + ". Attempting to create file.");
			let saved_data = {};
			saved_data.accounts = [];
			if(updateSavedData(data_path, saved_data)){
				return saved_data;
			}
			else{
				return null;
			}
		}
		else console.error("Error reading file:\n" + err);
		return null;
	  }
	

	let saved_data = {}
	try{
		saved_data = JSON.parse(read_data);
	} catch (e){
		console.log("Error parsing JSON: Reformatting file.")
		let saved_data = {};
		saved_data.accounts = [];
		if(updateSavedData(data_path, saved_data)){
			return saved_data;
		}
		else{
			return null;
		}
	}	
		
	console.log("Done");
	return saved_data;
}

function updateSavedData(newData){
	console.log("Saving data");

	let data_path = saved_data_path;
	try {
		let data_str = JSON.stringify(newData);
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


//XML pulling from starsonata.com
async function updateInv(saved_data){
	console.log("Updating inventory");
	console.log("Updating " + saved_data.accounts.length + " accounts");
			
	let xml_inventorys = {};

	for(let i=0; i < saved_data.accounts.length; i++)
	{
		let a = saved_data.accounts[i].un;
		let p = saved_data.accounts[i].pw;
		let decryptP = CryptoJS.AES.decrypt(p, "https://www.youtube.com/watch?v=dQw4w9WgXcQ").toString(CryptoJS.enc.Utf8);

		if(p === ""){
			console.log("Password field left blank!");
			continue;
		}

		//TODO Add encryption
		try{
			//TODO: Login and pull accounts simultaneously (Promise.all). Currently, that will cause an error, maybe cookies 
			let xml_inventory = await accountUpdate(a, decryptP);
			let characters = []
			for( let c in xml_inventory[a]){
				characters.push(c);
			}
			//update global accountInfo
			saved_data.accounts[i] = new AccountInfo(a, p, characters, true, null);

			xml_inventorys = Object.assign(xml_inventorys, xml_inventory);
		}
		catch (e){
			console.error("Error loading account " + a + " : " + e);
			//update global accountInfo
			saved_data.accounts[i] = new AccountInfo(a, p, [], false, e);
		}
		
	}
	//Write updated information to disk
	updateSavedData(saved_data);
	return xml_inventorys;		  
}

function testLogin(u, p){
	console.log("Testing login...");
	return new Promise(function (resolve, reject){
		let j = request.jar();
		request = request.defaults({jar:j});
			
		let options = {
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
			resolve(res.statusCode);
		});

	})
}

function accountUpdate(u, p)
{
	if(u === "undefined" || p === "undefined"){
		return Promise.reject("Error: username or password undefinied.");
	}
	return new Promise(function (resolve, reject){
			
		let parser = new xml2js.Parser();

		let xml_inventory = {};
		let status = "";
		let loading = 0;
		
		let j = request.jar();
		request = request.defaults({jar:j});
			
		let options = {
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
			
				let $ = cheerio.load(body);
				let table = $('.medium');
				let names = [];
				let links = [];
				
				for(i=0;i < 5;i++)
				{
					names.push($('table tr:nth-child('+(i+2)+') td:nth-child(1)').text());
					console.log("Name found in asset table: " + names[i]);
					links.push($('table tr:nth-child('+(i+2)+') td:nth-child(17) a:nth-child(2)').attr('href'));
				}
				
				let characters = [];
				let xmlLinks = [];
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


//Utility functions
function isEmpty(obj) {
    return Object.keys(obj).length === 0;
}

function hasProp (obj, prop) {
	return Object.prototype.hasOwnProperty.call(obj, prop);
  }


//Window Management  
function createWindow (fileName) {
	const win = new BrowserWindow({
	width: 1400,
	height: 1000,
	webPreferences: {
		enableRemoteModule: true,
		nodeIntegration: true,
		contextIsolation: false,
	}
	})

	win.loadFile(fileName)
	return win;
}


app.whenReady().then(() => {

	let saved_data = getSavedData();
	for(let i=0; i < saved_data.accounts.length; i++){
		saved_data.accounts[i].loaded = false;
	}
	updateSavedData(saved_data);

	win = createWindow('index.html');
	win.webContents.on('new-window', function(e, url) {
		e.preventDefault();
		require('electron').shell.openExternal(url);
	});
	
	app.on('window-all-closed', function () {
	  if (process.platform !== 'darwin') app.quit()
    });
  
	app.on('activate', function () {
		if (BrowserWindow.getAllWindows().length === 0) win = createWindow();
	});

  })
