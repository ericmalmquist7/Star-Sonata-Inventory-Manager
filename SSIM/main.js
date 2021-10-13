const path = require('path')
const fs = require('fs')
const CryptoJS = require('crypto-js')

const { testLogin, accountUpdate } = require(path.join(__dirname, '/js/xmlRequest.js'))

const { ipcMain, app, BrowserWindow } = require('electron')

let win // Window reference to switch active html file

const savedDataPath = path.join(__dirname, 'data.json')

let data = [] // Global storage of parsed data points (So we don't have to pull XML data on every request)

class AccountInfo {
    constructor (un, pw, characterArray, loaded, error) {
        this.un = un
        this.pw = pw
        this.characterArray = characterArray
        this.loaded = loaded // true false
        this.error = error // if no errors, error is null
    }
}

// Interprocess Communication
ipcMain.on('refresh', async (event) => {
    const xmlInventory = await updateInv(getSavedData())
    data = parseData(xmlInventory)
    event.reply('refresh_reply', data)
})

ipcMain.on('select_data', (event, args) => {
    const selectedData = selectData(args)
    event.reply('select_data_reply', selectedData)
})

ipcMain.on('show_accounts', (event) => {
    const response = {}
    response.accounts = getSavedData().accounts
    event.reply('show_accounts_reply', response)
})

ipcMain.on('remove_account', (event, args) => {
    const name = args.name

    args = {}
    args.success = false

    const savedData = getSavedData()

    let index = -1
    for (const i in savedData.accounts) {
        if (savedData.accounts[i].un === name) {
            index = i
            break
        }
    }

    if (index !== -1) {
        savedData.accounts.splice(index, 1)
        args.success = updateSavedData(savedData)
    }

    event.reply('remove_account_reply', args)
})

ipcMain.on('add_account', (event) => {
    win.loadURL(path.join(__dirname, '/accountWindow.html'))
})

ipcMain.on('new_account', async (event, args) => {
    const _un = args.un
    let _pw = args.pw

    let responseCode

    // Test if login credentials are OK
    try {
        responseCode = await testLogin(_un, _pw)
    } catch (e) {
        args = {}
        args.success = false
        args.name = _un
        args.error = 'Failed to login. Error: ' + e
        event.reply('new_account_reply', args)
    }

    if (!(responseCode === 302)) {
        args = {}
        args.success = false
        args.name = _un
        if (responseCode === 200 || responseCode === 401) { // Server login failure returns 200 (lol). Expected behavior is 401.
            args.error = 'Failed to login, invalid credentials. Response code: ' + responseCode
        } else {
            args.error = 'Failed to login. Response code: ' + responseCode
        }
        event.reply('new_account_reply', args)
        return
    }

    // Login OK, encrypt password and save data
    _pw = CryptoJS.AES.encrypt(_pw, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ').toString()
    const savedData = getSavedData()

    let found = false
    for (const i in savedData.accounts) {
        if (savedData.accounts[i].un === _un) {
            found = true
            savedData.accounts[i] = new AccountInfo(_un, _pw, [], false, null)
        }
    }
    if (!found) {
        savedData.accounts.push(new AccountInfo(_un, _pw, [], false, null))
    }
    const saveSuccess = updateSavedData(savedData)

    args = {}
    args.success = saveSuccess
    args.name = _un
    if (saveSuccess) {
        // If everything went correctly, load homepage
        win.loadURL(path.join(__dirname, '/index.html'))
    } else {
        args.error = 'Failed to save data to file.'
        event.reply('new_account_reply', args)
    }
})

ipcMain.on('return_home', (event) => {
    win.loadURL(path.join(__dirname, '/index.html'))
})

// Data parsing functions
class DataPoint {
    constructor (account, character, ship, alias, item, quantity, isDocked, isEquipped) {
        this.account = account
        this.character = character
        this.ship = ship
        this.alias = alias
        this.item = item
        this.quantity = quantity
        this.isDocked = isDocked
        this.isEquipped = isEquipped
    }
}

function selectData (args) {
    let searchAny = args.searchAny
    const searchExact = args.searchExact
    if (searchExact !== '') {
        searchAny = searchAny.concat(args.searchExact)
    }
    const searchExclude = args.searchExclude

    const characterFilter = args.characterFilter
    const accountFilter = args.accountFilter

    const selectedData = []
    for (const i in data) {
        // Check account and character filters
        if (accountFilter.includes(data[i].account) || characterFilter.includes(data[i].character)) {
            continue
        }
        const itemStr = data[i].item.toLowerCase()

        for (const j in searchAny) {
            if (itemStr.includes(searchAny[j])) {
                // Found item, now we need to check for exclude fields
                let isExcluded = false
                for (const e in searchExclude) {
                    if (itemStr.includes(searchExclude[e])) {
                        isExcluded = true
                        break
                    }
                }
                if (!isExcluded) {
                    // Item is in _any_ and not _exclude_, now check for _exact_
                    if (searchExact !== '') {
                        if (itemStr === searchExact) {
                            selectedData.push(data[i])
                            break
                        }
                    } else {
                        // No exact terms supplied.
                        selectedData.push(data[i])
                        break
                    }
                }
            }
        }
    }
    return selectedData
}

function parseData (xmlInventory) {
    let dataPoints = []

    for (const account in xmlInventory) {
        for (const character in xmlInventory[account]) {
            for (const ship in xmlInventory[account][character].inventory.DOCKEDSHIP) {
                const _ship = xmlInventory[account][character].inventory.DOCKEDSHIP[ship].SHIP[0]

                dataPoints = dataPoints.concat(parseShipData(account, character, _ship, true))
            }
            for (const ship in xmlInventory[account][character].inventory.SHIP) {
                const _ship = xmlInventory[account][character].inventory.SHIP[ship]

                dataPoints = dataPoints.concat(parseShipData(account, character, _ship, false))
            }
        }
    }
    return dataPoints
}

function parseShipData (account, character, _ship, isDocked) {
    const dataPoints = []

    const shipName = _ship.HULL[0]._

    let shipAlias = ''
    if (hasProp(_ship, 'SHIP_ALIAS')) shipAlias = _ship.SHIP_ALIAS[0]

    if (hasProp(_ship, 'ITEM')) {
        for (const item in _ship.ITEM) {
            const _item = _ship.ITEM[item]

            const itemName = _item.$.nm
            let quantity = 1
            if (hasProp(_item.$, 'quant')) quantity = parseInt(_item.$.quant)

            let isEquipped = _item.$.eqp
            isEquipped = !!parseInt(isEquipped)

            const DP = new DataPoint(account, character, shipName, shipAlias, itemName, quantity, isDocked, isEquipped)
            dataPoints.push(DP)
        }
    } else if (hasProp(_ship, 'ITEMLIST')) {
        for (const item in _ship.ITEMLIST[0].ITEM) {
            const _item = _ship.ITEMLIST[0].ITEM[item]

            const itemName = _item.$.nm
            let quantity = 1
            if (hasProp(_item.$, 'quant')) quantity = parseInt(_item.$.quant)

            let isEquipped = _item.$.eqp
            isEquipped = !!parseInt(isEquipped)

            const DP = new DataPoint(account, character, shipName, shipAlias, itemName, quantity, isDocked, isEquipped)
            dataPoints.push(DP)
        }
    } else {
        console.log('Could not find any items on ' + account + '->' + character + '->' + shipName + '->' + shipAlias)
    }

    return dataPoints
}

// Local data Processing
function getSavedData () {
    console.log('Retrieving saved data')

    const dataPath = savedDataPath
    let readData
    try {
        readData = fs.readFileSync(dataPath)
    } catch (err) {
        if (err.code === 'ENOENT') {
            console.error('Could not find account file at ' + dataPath + '. Attempting to create file.')
            const savedData = {}
            savedData.accounts = []
            if (updateSavedData(dataPath, savedData)) {
                return savedData
            } else {
                return null
            }
        } else console.error('Error reading file:\n' + err)
        return null
    }

    let savedData = {}
    try {
        savedData = JSON.parse(readData)
    } catch (e) {
        console.log('Error parsing JSON: Reformatting file.')
        const savedData = {}
        savedData.accounts = []
        if (updateSavedData(dataPath, savedData)) {
            return savedData
        } else {
            return null
        }
    }

    console.log('Done')
    return savedData
}

function updateSavedData (newData) {
    console.log('Saving data')

    const dataPath = savedDataPath
    try {
        const dataStr = JSON.stringify(newData)
        fs.writeFileSync(dataPath, dataStr)
    } catch (err) {
        if (err.code === 'ENOENT') {
            console.error('Could not find account file at ' + dataPath)
        } else console.error('Error reading file:\n' + err)
        return false
    }
    console.log('Done')
    return true
}

// XML pulling from starsonata.com
async function updateInv (savedData) {
    console.log('Updating inventory')
    console.log('Updating ' + savedData.accounts.length + ' accounts')

    let xmlInventories = {}

    for (let i = 0; i < savedData.accounts.length; i++) {
        const a = savedData.accounts[i].un
        const p = savedData.accounts[i].pw
        const decryptP = CryptoJS.AES.decrypt(p, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ').toString(CryptoJS.enc.Utf8)

        if (p === '') {
            console.log('Password field left blank!')
            continue
        }

        // TODO Add encryption
        try {
            // TODO: Login and pull accounts simultaneously (Promise.all). Currently, that will cause an error, maybe cookies
            const xmlInventory = await accountUpdate(a, decryptP)
            const characters = []
            for (const c in xmlInventory[a]) {
                characters.push(c)
            }
            // update global accountInfo
            savedData.accounts[i] = new AccountInfo(a, p, characters, true, null)

            xmlInventories = Object.assign(xmlInventories, xmlInventory)
        } catch (e) {
            console.error('Error loading account ' + a + ' : ' + e)
            // update global accountInfo
            savedData.accounts[i] = new AccountInfo(a, p, [], false, e)
        }
    }
    // Write updated information to disk
    updateSavedData(savedData)
    return xmlInventories
}

// Utility functions
function hasProp (obj, prop) {
    return Object.prototype.hasOwnProperty.call(obj, prop)
}

// Window Management
function createWindow (fileName) {
    const win = new BrowserWindow({
        width: 1400,
        height: 1000,
        webPreferences: {
            enableRemoteModule: true,
            nodeIntegration: true,
            contextIsolation: false
        }
    })

    win.loadFile(fileName)
    return win
}

app.whenReady().then(() => {
    // Mark all accounts as unloaded on startup
    const savedData = getSavedData()
    for (let i = 0; i < savedData.accounts.length; i++) {
        savedData.accounts[i].loaded = false
    }
    updateSavedData(savedData)

    // Create renderer window
    win = createWindow('index.html')

    win.webContents.on('new-window', function (e, url) {
        e.preventDefault()
        require('electron').shell.openExternal(url)
    })

    app.on('window-all-closed', function () {
        if (process.platform !== 'darwin') app.quit()
    })

    app.on('activate', function () {
        if (BrowserWindow.getAllWindows().length === 0) win = createWindow()
    })
})
