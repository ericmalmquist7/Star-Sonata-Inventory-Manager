//Library Imports
var remote = require('electron');
const {ipcRenderer} = remote;

const util = require('util');
const request = require('request');
const cheerio = require('cheerio');
const xml2js = require('xml2js');


const form = document.querySelector('form');
const loadInv = document.querySelector('.refresh_inv');
const tbody = document.querySelector('tbody');
	
inventory = {};

var lastUpdate = 0;

function onSearchQuery(e){
	const query = document.getElementById('search').value;
	e.preventDefault();
	clearRows();
	var args = {};
	args.must_include = query.split(' ');
	ipcRenderer.send("select_data", args)
}

function getInventory(){
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
		<td>${dataPoint.isDocked}</td>
	</tr>
	`;
}



ipcRenderer.on('get_saved_data_reply', (event, new_inventory) => {
  console.log(new_inventory) // prints inventory
  inventory = new_inventory;
})
ipcRenderer.on('select_data_reply', (event, selected_data) => {
  console.log(selected_data) // prints inventory
  for(var i in selected_data){
	  if (i > 500) break;
	  addRow(selected_data[i]);
  }
})


form.addEventListener('submit', onSearchQuery);
loadInv.addEventListener('click', getInventory);