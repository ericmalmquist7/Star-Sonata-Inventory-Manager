//Library Imports
const {ipcRenderer} = require('electron');;

const searchQueryResultsBtn = document.querySelector('#searchQueryResults');
const addAccountBtn = document.querySelector('#add_account');
const refreshInvBtn = document.querySelector('#refresh_inv');
const loadingCircle = document.querySelector('#loadingCircle');
const loadingInfo = document.querySelector('#loadingInfo');
const darkModeBtn = document.querySelector('#darkMode');

const form = document.querySelector('form');
const tbody = document.querySelector('tbody');

	
var refreshStart = 0;

const setTheme = theme => document.documentElement.className = theme;
setTheme("dark");

function removeEmptyStrings(s_array){
	var temp = [];
	for(var i in s_array){
		if (s_array[i] !== ''){
			temp.push(s_array[i])
		}
	}
	return temp;
}

function clearRows(){
	tbody.innerHTML = "";
}

function addRow(dataPoint){
	tbody.innerHTML += `
	<tr>
		<td>${dataPoint.item}</td>
		<td>${dataPoint.quantity}</td>
		<td>${dataPoint.ship}</td>
		<td>${dataPoint.alias}</td>
		<td>${dataPoint.character}</td>
		<td>${dataPoint.account}</td>
		<td>${dataPoint.isEquipped}</td>
	</tr>
	`;
}


function onSearchQuery(e){	
	e.preventDefault();
	clearRows();

	const search_any = document.getElementById('search_any').value;
	const search_exact = document.getElementById('search_exact').value;
	const search_exclude = document.getElementById('search_exclude').value;

	let accountFilter = [];
	let characterFilter = [];
	
	const accounts = document.querySelectorAll('.accountContainer');
	for(let i=0; i < accounts.length; i++){
		let accountActive = accounts[i].querySelector('.account input').checked;
		if(!accountActive){
			accountFilter.push(accounts[i].querySelector('.account label').textContent.trim());
		}

		let characters = accounts[i].querySelectorAll('.character label');
		for(let j=0; j < characters.length; j++){
			let characterActive = characters[j].querySelector('input').checked;
			console.log(characterActive)
			if(!characterActive){
				characterFilter.push(characters[j].textContent.trim());
			}
		}
	}

	var args = {};
	args.search_any = removeEmptyStrings(search_any.trim().toLowerCase().split(' '));
	args.search_exact = search_exact.trim().toLowerCase();
	args.search_exclude = removeEmptyStrings(search_exclude.trim().toLowerCase().split(' '));
	args.characterFilter = characterFilter;
	args.accountFilter = accountFilter;
	ipcRenderer.send("select_data", args)
}

function onAddAccount(e){
	ipcRenderer.send('add_account');
}

function onRemoveAccount(e){
	var args = {}
	args.name = e.target.value;
	ipcRenderer.send("remove_account", args);
}

function onRefreshInventory(){
	refreshStart = Date.now();
	setLoadingCircle(true);
	ipcRenderer.send("refresh");
}

function onToggleDarkMode(e){
	if(document.documentElement.className == "dark"){
		setTheme("light");
		e.target.innerHTML = "Light"
	}
	else if(document.documentElement.className == "light"){
		setTheme("dark");
		e.target.innerHTML = "Dark"
	}

}

function setLoadingCircle(active, timeTaken, lastUpdate){
	if(active){
		loadingCircle.style.display = "inline"
		loadingInfo.style.display = "none"
	}
	else{
		loadingCircle.style.display = "none"
		loadingInfo.style.display = "inline"
		loadingInfo.innerHTML = `<h4>Updated at ${lastUpdate} <br> (${timeTaken} ms)</h4>`
	}
}


ipcRenderer.on('refresh_reply', (event, new_inventory) => {

	ipcRenderer.send('show_accounts');

	let lastUpdate = new Date(Date.now());
	let timeTaken = lastUpdate - refreshStart;

	let hours = `${lastUpdate.getHours()}`.padStart(2, '0');
	let minutes = `${lastUpdate.getMinutes()}`.padStart(2, '0');

	lastUpdate = [hours,minutes].join(':')
	setLoadingCircle(false, timeTaken, lastUpdate);
})

ipcRenderer.on('select_data_reply', (event, selected_data) => {
  console.log(selected_data) // prints inventory
  var show_limit = 500;
  for(var i in selected_data){
	  if (i > show_limit) break;
	  addRow(selected_data[i]);
  }
  searchQueryResultsBtn.innerHTML = "Search Query Results (" + selected_data.length + " entries found)";
  if(selected_data.length > show_limit){
	searchQueryResultsBtn.innerHTML += " (Only showing first " + show_limit + " entries.)";
  }
})

ipcRenderer.on('show_accounts_reply', (event, args) =>{
	accountSelection.innerHTML = '';
	console.log(args.accounts)
	for(var a in args.accounts){
		var account = args.accounts[a].name
		var accountContainer = document.createElement("div");
		accountContainer.className="accountContainer";

		accountSelection.append(accountContainer);

		var newHtml = '';
		newHtml += `<div class ="account">
						
						<label>
						<input type="checkbox" name="account" value="${account}" checked="true"">
						${account}
						</label>
					</div>
					<hr>`
		
		if(args.accounts[a].error !== null){
			var newChar = `<div class = "character">
								<label>Login Error</label>
							</div>`
			newHtml += newChar;
			console.error(args.accounts[a].error)
		}
		else if(args.accounts[a].loaded === false){
			var newChar = `<div class = "character">
								<label>Account not loaded</label>
							</div>`
			newHtml += newChar;
		}
		else{
			for(var c in args.accounts[a].characterArray){
				var charName = args.accounts[a].characterArray[c]
				var newChar = `<div class="character">
									
									<label>
									<input type="checkbox" name="character" value="${charName}" checked="true">
									${charName}
									</label>
								</div>`
				newHtml += newChar;
			}
		}

		accountContainer.innerHTML = newHtml;
			
		var btn = document.createElement("button");
		btn.className = "remove_account";
		btn.value = account;
		btn.innerHTML = "Remove";
		btn.addEventListener('click', onRemoveAccount)
		accountContainer.append(btn)
	}
	
})

ipcRenderer.on('add_account_reply', (event, response) => {
	if(response.success){
		console.log("Added account " + response.name)
	}
	else{
		console.log("Failed to add account " + response.name)
	}
	ipcRenderer.send('show_accounts');
  })

ipcRenderer.on('remove_account_reply', (event, response) => {
	if(response.success){
		console.log("Removed account " + response.name)
	}
	else{
		console.log("Failed to remove account " + response.name)
	}
	ipcRenderer.send('show_accounts');
})

refreshInvBtn.addEventListener('click', onRefreshInventory);
form.addEventListener('submit', onSearchQuery);
addAccountBtn.addEventListener('click', onAddAccount);
ipcRenderer.send('show_accounts');
darkModeBtn.addEventListener('click', onToggleDarkMode)