const { ipcRenderer } = require('electron')

const form = document.querySelector('form')
const backButton = document.querySelector('#goBack')
const loadingCircle = document.querySelector('.loadingCircle')
const loadingInfo = document.querySelector('.loadingInfo')

function onSubmit (e) {
    setLoadingCircle(true)
    e.preventDefault()
    const args = {}
    args.un = document.getElementById('username').value
    args.pw = document.getElementById('password').value
    ipcRenderer.send('new_account', args)
}

function onGoBack (e) {
    e.preventDefault()
    ipcRenderer.send('return_home')
}

ipcRenderer.on('new_account_reply', (event, args) => {
    setLoadingCircle(false, args.error)
    console.log(args.error)
})

function setLoadingCircle (active, error) {
    if (active) {
        loadingCircle.style.display = 'inline'
        loadingInfo.style.display = 'none'
    } else {
        loadingCircle.style.display = 'none'
        loadingInfo.style.display = 'inline'
        loadingInfo.innerHTML = `<h4>${error}></h4>`
    }
}

form.addEventListener('submit', onSubmit)
backButton.addEventListener('click', onGoBack)
