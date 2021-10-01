//Library Imports
var remote = require('electron');
const {ipcRenderer} = remote;

const util = require('util');
const request = require('request');
const cheerio = require('cheerio');
const xml2js = require('xml2js');
const { html } = require('cheerio/lib/api/manipulation');

const searchQueryResultsBtn = document.querySelector('#searchQueryResults');
const addAccountBtn = document.querySelector('#add_account');
const refreshInvBtn = document.querySelector('#refresh_inv');
const accountSelectionContainer = document.querySelector('#accountSelection');

const form = document.querySelector('form');
const tbody = document.querySelector('tbody');
	
inventory = {};

var lastUpdate = 0;

function removeEmptyStrings(s_array){
	var temp = [];
	for(var i in s_array){
		if (s_array[i] !== ''){
			temp.push(s_array[i])
		}
	}
	return temp;
}

function onSearchQuery(e){	
	e.preventDefault();
	clearRows();

	const search_any = document.getElementById('search_any').value;
	const search_exact = document.getElementById('search_exact').value;
	const search_exclude = document.getElementById('search_exclude').value;

	var args = {};
	args.search_any = removeEmptyStrings(search_any.trim().toLowerCase().split(' '));
	args.search_exact = search_exact.trim().toLowerCase();
	args.search_exclude = removeEmptyStrings(search_exclude.trim().toLowerCase().split(' '));

	ipcRenderer.send("select_data", args)
}

function onAddAccount(e){
	ipcRenderer.send('show_accounts');

}

function onRemoveAccount(e){
	var args = {}
	args.name = e.target.value;
	ipcRenderer.send("remove_account", args);
}

function onRefreshInventory(){
	ipcRenderer.send("get_saved_data");
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



ipcRenderer.on('get_saved_data_reply', (event, new_inventory) => {
  console.log(new_inventory) // prints inventory
  inventory = new_inventory;
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
	for(var a in args.accounts){

		var accountContainer = document.createElement("div");
		accountContainer.className="accountContainer";

		accountSelection.append(accountContainer);

		var newHtml = '';
		newHtml += `<div class ="account">
						<input type="radio">
						<h4>${a}</h4>
					</div>

					<hr>`

		for(var c in args.accounts[a].characters){
			var newChar = `<div class = "character">
			<input type="radio">
			<h4 class="characterName">${c}</h4>
		</div>`
			newHtml += newChar;
		}

		accountContainer.innerHTML += newHtml;
			
		var btn = document.createElement("button");
		btn.className = "remove_account";
		btn.value = a;
		btn.innerHTML = "Remove";
		btn.addEventListener('click', onRemoveAccount)
		accountContainer.append(btn)
	}
	
})

ipcRenderer.on('add_account_reply', (event, response) => {

  })

ipcRenderer.on('remove_account_reply', (event, response) => {
	if(response.success){
		console.log("Removed account " + response.name)
	}
	else{
		console.log("Failed to remove account " + response.name)
	}
})

refreshInvBtn.addEventListener('click', onRefreshInventory);
form.addEventListener('submit', onSearchQuery);
addAccountBtn.addEventListener('click', onAddAccount);
ipcRenderer.send('show_accounts');