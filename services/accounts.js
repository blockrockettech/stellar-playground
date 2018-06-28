const fs = require('fs');
const _ = require('lodash');

const CACHE_FILE = './blockchain-manchester-config.json';

class Accounts {

    static all () {
        return JSON.parse(fs.readFileSync(CACHE_FILE));
    }

    static get (accountName) {
        // console.log(`get [${accountName}]`);
        let cache = JSON.parse(fs.readFileSync(CACHE_FILE));
        let found = _.get(cache, accountName);
        if (!found) {
            throw new Error(`Unable to find account ${accountName}`);
        }
        return found;
    }

    static exists (accountName) {
        // console.log(`get [${accountName}]`);
        let cache = JSON.parse(fs.readFileSync(CACHE_FILE));
        return _.get(cache, accountName);
    }

    static set (accountName, {publicKey, secretKey}) {
        let cache = JSON.parse(fs.readFileSync(CACHE_FILE));
        let updatedCache = _.set(cache, accountName, {
            publicKey,
            secretKey
        });

        fs.writeFileSync(CACHE_FILE, JSON.stringify(updatedCache, null, 4));

        return Accounts.get(accountName);
    }
}

module.exports = Accounts;
