// Library Imports
const { ipcRenderer } = require('electron')

const searchQueryResultsBtn = document.querySelector('#searchQueryResults')
const accountSelection = document.querySelector('#accountSelection')
const addAccountBtn = document.querySelector('#add_account')
const refreshInvBtn = document.querySelector('#refresh_inv')
const loadingCircle = document.querySelector('#loadingCircle')
const loadingInfo = document.querySelector('#loadingInfo')
const darkModeBtn = document.querySelector('#darkMode')
const githubBtn = document.querySelector('#github')

const form = document.querySelector('form')
const tbody = document.querySelector('tbody')

const showLimit = 250

let refreshStart = 0

const setTheme = theme => (document.documentElement.className = theme)
setTheme('dark')

function removeEmptyStrings (array) {
    const temp = []
    for (const i in array) {
        if (array[i] !== '') {
            temp.push(array[i])
        }
    }
    return temp
}

function clearRows () {
    tbody.innerHTML = ''
}

function addRow (dataPoint) {
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
	`
}

function onSearchQuery (e) {
    e.preventDefault()
    clearRows()

    const searchAny = document.getElementById('search_any').value
    const searchExact = document.getElementById('search_exact').value
    const searchExclude = document.getElementById('search_exclude').value

    const accountFilter = []
    const characterFilter = []

    const accounts = document.querySelectorAll('.accountContainer')
    for (let i = 0; i < accounts.length; i++) {
        const accountActive = accounts[i].querySelector('.account input').checked
        if (!accountActive) {
            accountFilter.push(accounts[i].querySelector('.account label').textContent.trim())
        }

        const characters = accounts[i].querySelectorAll('.character label')
        for (let j = 0; j < characters.length; j++) {
            const characterActive = characters[j].querySelector('input').checked
            if (!characterActive) {
                characterFilter.push(characters[j].textContent.trim())
            }
        }
    }

    const args = {}
    args.searchAny = removeEmptyStrings(searchAny.trim().toLowerCase().split(' '))
    args.searchExact = searchExact.trim().toLowerCase()
    args.searchExclude = removeEmptyStrings(searchExclude.trim().toLowerCase().split(' '))
    args.characterFilter = characterFilter
    args.accountFilter = accountFilter
    ipcRenderer.send('select_data', args)
}

function onAddAccount (e) {
    ipcRenderer.send('add_account')
}

function onRemoveAccount (e) {
    const args = {}
    args.name = e.target.value
    ipcRenderer.send('remove_account', args)
}

function onRefreshInventory () {
    refreshStart = Date.now()
    setLoadingCircle(true)
    ipcRenderer.send('refresh')
}

function onToggleDarkMode (e) {
    if (document.documentElement.className === 'dark') {
        setTheme('light')
        e.target.innerHTML = 'Light'
    } else if (document.documentElement.className === 'light') {
        setTheme('dark')
        e.target.innerHTML = 'Dark'
    }
}

function onGithubLink (e) {
    require('electron').shell.openExternal('https://github.com/ericmalmquist7/Star-Sonata-Inventory-Manager')
}

function setLoadingCircle (active, timeTaken, lastUpdate) {
    if (active) {
        loadingCircle.style.display = 'inline'
        loadingInfo.style.display = 'none'
    } else {
        loadingCircle.style.display = 'none'
        loadingInfo.style.display = 'inline'
        loadingInfo.innerHTML = `<h4>Updated at ${lastUpdate} <br> (${timeTaken} ms)</h4>`
    }
}

ipcRenderer.on('refresh_reply', (event, newInventory) => {
    console.log(newInventory)
    ipcRenderer.send('show_accounts')

    let lastUpdate = new Date(Date.now())
    const timeTaken = lastUpdate - refreshStart

    const hours = `${lastUpdate.getHours()}`.padStart(2, '0')
    const minutes = `${lastUpdate.getMinutes()}`.padStart(2, '0')

    lastUpdate = [hours, minutes].join(':')
    setLoadingCircle(false, timeTaken, lastUpdate)
})

ipcRenderer.on('select_data_reply', (event, selectedData) => {
    console.log(selectedData)

    for (const i in selectedData) {
        if (i > showLimit) break
        addRow(selectedData[i])
    }

    searchQueryResultsBtn.innerHTML = 'Search Query Results (' + selectedData.length + ' entries found)'
    if (selectedData.length > showLimit) {
        searchQueryResultsBtn.innerHTML += ' (Only showing first ' + showLimit + ' entries.)'
    }
})

ipcRenderer.on('show_accounts_reply', (event, args) => {
    accountSelection.innerHTML = ''
    console.log(args.accounts)
    for (const a in args.accounts) {
        const account = args.accounts[a].un
        const accountContainer = document.createElement('div')
        accountContainer.className = 'accountContainer'

        accountSelection.append(accountContainer)

        let newHtml = ''
        newHtml += `<div class ="account">
						
						<label>
						<input type="checkbox" name="account" value="${account}" checked="true"">
						${account}
						</label>
					</div>
					<hr>`

        if (args.accounts[a].error !== null) {
            const newChar = `<div class = "character">
								<label>Login Error</label>
							</div>`
            newHtml += newChar
            console.error(args.accounts[a].error)
        } else if (args.accounts[a].loaded === false) {
            const newChar = `<div class = "character">
								<label>Account not loaded</label>
							</div>`
            newHtml += newChar
        } else {
            for (const c in args.accounts[a].characterArray) {
                const charName = args.accounts[a].characterArray[c]
                const newChar = `<div class="character">
									
									<label>
									<input type="checkbox" name="character" value="${charName}" checked="true">
									${charName}
									</label>
								</div>`
                newHtml += newChar
            }
        }

        accountContainer.innerHTML = newHtml

        const btn = document.createElement('button')
        btn.className = 'remove_account'
        btn.value = account
        btn.innerHTML = 'Remove'
        btn.addEventListener('click', onRemoveAccount)
        accountContainer.append(btn)
    }
})

ipcRenderer.on('add_account_reply', (event, response) => {
    if (response.success) {
        console.log('Added account ' + response.name)
    } else {
        console.log('Failed to add account ' + response.name)
    }
    ipcRenderer.send('show_accounts')
})

ipcRenderer.on('remove_account_reply', (event, response) => {
    if (response.success) {
        console.log('Removed account ' + response.name)
    } else {
        console.log('Failed to remove account ' + response.name)
    }
    ipcRenderer.send('show_accounts')
})

refreshInvBtn.addEventListener('click', onRefreshInventory)
form.addEventListener('submit', onSearchQuery)
addAccountBtn.addEventListener('click', onAddAccount)
ipcRenderer.send('show_accounts')
darkModeBtn.addEventListener('click', onToggleDarkMode)
githubBtn.addEventListener('click', onGithubLink)

// eslint-disable-next-line no-unused-vars
function sortTable (n) {
    console.log('Sorting')
    const table = document.querySelector('table')
    let rows
    let switching
    let i
    let x
    let y
    let shouldSwitch
    let dir
    let switchcount = 0
    switching = true
    // Set the sorting direction to ascending:
    dir = 'asc'
    /* Make a loop that will continue until
    no switching has been done: */
    while (switching) {
        // Start by saying: no switching is done:
        switching = false
        rows = table.rows
        /* Loop through all table rows (except the
        first, which contains table headers): */
        for (i = 1; i < (rows.length - 1); i++) {
            // Start by saying there should be no switching:
            shouldSwitch = false
            /* Get the two elements you want to compare,
      one from current row and one from the next: */
            x = rows[i].getElementsByTagName('TD')[n]
            y = rows[i + 1].getElementsByTagName('TD')[n]
            /* Check if the two rows should switch place,
      based on the direction, asc or desc: */

            if (n === 1) {
                if (dir === 'asc') {
                    if (parseInt(x.innerHTML) > parseInt(y.innerHTML)) {
                        // If so, mark as a switch and break the loop:
                        shouldSwitch = true
                        break
                    }
                } else if (dir === 'desc') {
                    if (parseInt(x.innerHTML) < parseInt(y.innerHTML)) {
                        // If so, mark as a switch and break the loop:
                        shouldSwitch = true
                        break
                    }
                }
            } else {
                if (dir === 'asc') {
                    if (x.innerHTML.toLowerCase() > y.innerHTML.toLowerCase()) {
                        // If so, mark as a switch and break the loop:
                        shouldSwitch = true
                        break
                    }
                } else if (dir === 'desc') {
                    if (x.innerHTML.toLowerCase() < y.innerHTML.toLowerCase()) {
                        // If so, mark as a switch and break the loop:
                        shouldSwitch = true
                        break
                    }
                }
            }
        }
        if (shouldSwitch) {
            /* If a switch has been marked, make the switch
      and mark that a switch has been done: */
            rows[i].parentNode.insertBefore(rows[i + 1], rows[i])
            switching = true
            // Each time a switch is done, increase this count by 1:
            switchcount++
        } else {
            /* If no switching has been done AND the direction is "asc",
      set the direction to "desc" and run the while loop again. */
            if (switchcount === 0 && dir === 'asc') {
                dir = 'desc'
                switching = true
            }
        }
    }
    console.log('Sorting done')
}
