const { ipcRenderer } = require("electron");

const form = document.querySelector('form');
const errorText = document.querySelector('.error');
const backButton = document.querySelector('#goBack');

function onSubmit(e){
	e.preventDefault();
    let args = {}
    args.un = document.getElementById('username').value;
    args.pw = document.getElementById('password').value;
    ipcRenderer.send('new_account', args)

}

function onGoBack(e){
    e.preventDefault();
    ipcRenderer.send('return_home');
}

ipcRenderer.on('new_account_reply', (event, args) => {
    let error = args.error;
    console.log(error);
    errorText.innerHTML = `${error}`;
});

form.addEventListener('submit', onSubmit);
backButton.addEventListener('click', onGoBack);
