let request = require('request')
const cheerio = require('cheerio')
const xml2js = require('xml2js')

function testLogin (u, p) {
    console.log('Testing login...')
    return new Promise(function (resolve, reject) {
        const j = request.jar()
        request = request.defaults({ jar: j })

        const options = {
            url: 'https://www.starsonata.com/user/login',
            formData: { username: u, password: p, stay_logged_in: 'on' },
            jar: j,
            headers: {
                Connection: 'keep-alive',
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent':
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/68.0.3440.106 Safari/537.36'
            }
        }

        request.post(
            options,
            'https://www.starsonata.com/user/login/',
            function (err, res, body) {
                if (err) {
                    reject(err)
                    return
                }
                console.log(res)
                console.log('POST login sent.. user:' + u + ', Response code: ' + res.statusCode)
                resolve(res.statusCode)
            }
        )
    })
}

function accountUpdate (u, p) {
    if (u === 'undefined' || p === 'undefined') {
        return Promise.reject(new Error('Error: username or password undefined.'))
    }
    if (u === '' || p === '') {
        return Promise.reject(new Error('Error: username or password blank.'))
    }

    return new Promise(function (resolve, reject) {
        const parser = new xml2js.Parser()

        const xmlInventory = {}
        let loading = 0

        const j = request.jar()
        request = request.defaults({ jar: j })

        let options = {
            url: 'https://www.starsonata.com/user/login',
            formData: { username: u, password: p, stay_logged_in: 'on' },
            jar: j,
            headers: {
                Connection: 'keep-alive',
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent':
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/68.0.3440.106 Safari/537.36'
            }
        }
        request.post(
            options,
            'https://www.starsonata.com/user/login/',
            function (err, res, body) {
                if (err) { reject(err); return }

                console.log('POST login... user:' + u + ', Response code: ' + res.statusCode)

                options = {
                    url: 'https://www.starsonata.com/user/assets/',
                    headers: {
                        Connection: 'keep-alive',
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'User-Agent':
                                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/68.0.3440.106 Safari/537.36'
                    }
                }

                request.get(options, function (err, res, body) {
                    if (err) { reject(err); return }

                    console.log('GET assets sent.. Response code: ' + res.statusCode)
                    if (res.statusCode === 500) {
                        reject(new Error('Internal Server Error (500)'))
                        return
                    }

                    const $ = cheerio.load(body)
                    // const table = $('.medium') // Unused
                    const names = []
                    const links = []

                    for (let i = 0; i < 5; i++) {
                        names.push($('table tr:nth-child(' + (i + 2) + ') td:nth-child(1)').text())

                        console.log('Name found in asset table: ' + names[i])
                        links.push($('table tr:nth-child(' + (i + 2) + ') td:nth-child(17) a:nth-child(2)').attr('href'))
                    }

                    const characters = []
                    const xmlLinks = []
                    for (let i = 0; i < names.length; i++) {
                        if (names[i] !== '') {
                            characters.push(names[i])
                            xmlLinks.push(links[i])
                        }
                    }
                    loading += characters.length
                    if (characters.length === 0) {
                        console.log('Could not log in to account ' + u + ' - Did credentials change? Did starsonata.com break?')
                        reject(new Error('No character data found (Some causes: Invalid credentials, failed login, server issues)'))
                        return
                    }

                    xmlInventory[u] = {}
                    for (let i = 0; i < characters.length; i++) {
                        options.url = xmlLinks[i]
                        options.characterName = characters[i]

                        request.get(options, function (err, res, body) {
                            console.log('GET assets sent.. Response code: ' + res.statusCode)

                            if (err) {
                                console.error('Server GET error:\n' + err)
                            }

                            parser.parseString(body, function (err, result) {
                                if (err) {
                                    console.error('ERROR in parsing XML inventory (' + u + '(:\n' + err)
                                } else {
                                    xmlInventory[u][res.request.characterName] = result
                                    console.log('Added inventory to ' + u + ':' + res.request.characterName)
                                }
                                loading--
                                if (loading === 0) resolve(xmlInventory)
                            })
                        })
                    }
                })
            }
        )
    })
}

module.exports = { testLogin, accountUpdate }
