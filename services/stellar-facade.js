const _ = require('lodash');

const StellarSdk = require('stellar-sdk');

StellarSdk.Network.useTestNetwork();

const server = new StellarSdk.Server('https://horizon-testnet.stellar.org');

const axios = require('axios');

const Accounts = require('./accounts');

class StellarFacade {

    createAccount ({accountName}) {
        // check if already exists
        if (Accounts.exists(accountName)) {
            return Promise.resolve(Accounts.get(accountName));
        }

        // Create new keypair
        const pair = StellarSdk.Keypair.random();

        console.log(`Creating account for [${accountName}] | secret = [${pair.secret()}] publicKey = [${pair.publicKey()}]`);

        // return both for testing only
        let account = {
            secretKey: pair.secret(),
            publicKey: pair.publicKey(),
        };
        Accounts.set(accountName, account);

        return Promise.resolve(account);
    }

    getAccount (accountName) {
        return Promise.resolve(Accounts.get(accountName));
    }

    listAccountBalances () {
        let accountLookups = _.map(Accounts.all(), function (config, account) {
            return this.loadAccount(account)
                .then((result) => {
                    return {...result, account};
                });
        }.bind(this));

        return Promise.all(accountLookups)
            .then((allDetails) => {
                return _.map(allDetails, function (detail) {
                    return {
                        account: detail.account,
                        flags: detail.flags,
                        balances: detail.balances
                    };
                });
            });
    }

    loadAccount (accountName) {
        let {secretKey, publicKey} = Accounts.get(accountName);
        return server.loadAccount(publicKey);
    }

    createAsset ({assetCode, accountName}) {
        let {secretKey, publicKey} = Accounts.get(accountName);

        let issuedAsset = new StellarSdk.Asset(assetCode, publicKey);
        console.log(issuedAsset);

        return Promise.resolve(issuedAsset);
    }

    configureAccountIssuanceProperties ({accountName}) {

        // see https://www.stellar.org/developers/guides/issuing-assets.html#requiring-or-revoking-authorization
        let {secretKey, publicKey} = Accounts.get(accountName);

        // Currently there are three flags, used by issuers of assets.
        //   Authorization required (0x1): Requires the issuing account to give other accounts permission before they can hold the issuing account's credit.
        //   Authorization revocable (0x2): Allows the issuing account to revoke its credit held by other accounts.
        //   Authorization immutable (0x4): If this is set then none of the authorization flags can be set and the account can never be deleted.

        return server.loadAccount(publicKey)
            .then(function (issuer) {

                let transaction = new StellarSdk.TransactionBuilder(issuer)
                    .addOperation(StellarSdk.Operation.setOptions({
                        setFlags: StellarSdk.AuthRevocableFlag | StellarSdk.AuthRequiredFlag | StellarSdk.AuthImmutableFlag
                    }))
                    .build();

                transaction.sign(StellarSdk.Keypair.fromSecret(secretKey));

                return server.submitTransaction(transaction);
            });
    }

    fundAccount ({fromAccountName, toAccountName}) {
        const minAmount = '1.5';

        console.log(`Activate account with transfer from [${fromAccountName}] to [${toAccountName}] for [XLM] with amount of [${minAmount}]`);

        const {secretKey: fromSecretKey, publicKey: fromPublicKey} = Accounts.get(fromAccountName);
        const {publicKey: toPublicKey} = Accounts.get(toAccountName);

        return server.loadAccount(fromPublicKey)
            .then(function (funder) {
                let transaction = new StellarSdk.TransactionBuilder(funder)
                    .addOperation(StellarSdk.Operation.createAccount({
                        destination: toPublicKey,
                        startingBalance: minAmount
                    }))
                    .build();

                transaction.sign(StellarSdk.Keypair.fromSecret(fromSecretKey));

                return server.submitTransaction(transaction);
            });
    }

    checkUserHasTrustline (accountName, assetCode) {

        const {secretKey, publicKey} = Accounts.get(accountName);

        return server.loadAccount(publicKey)
            .then(function (account) {

                // how do we know it is the correct issuer?
                let hasTrustLineSetup = account.balances.some((balance) => {
                    // token already listed with positive balance
                    return balance.asset_code === assetCode && balance.limit > 0;
                });

                if (hasTrustLineSetup) {
                    console.log(`Trustline exists from [${accountName}] for [${assetCode}]`);
                    return Promise.resolve(true);
                }

                console.log(`NO Trustline from [${accountName}] for [${assetCode}]`);
                return Promise.resolve(false);
            });
    }

    createTrustLine ({fromAccountName, toAccountName, assetCode, limit}) {

        console.log(`Trustline from [${fromAccountName}] to [${toAccountName}] for [${assetCode}] with limit of [${limit}]`);

        const {secretKey: fromSecretKey, publicKey: fromPublicKey} = Accounts.get(fromAccountName);
        const {publicKey: toPublicKey} = Accounts.get(toAccountName);

        return server.loadAccount(fromPublicKey)
            .then((fromAccount) => {
                try {
                    let transaction = new StellarSdk.TransactionBuilder(fromAccount)
                        .addOperation(StellarSdk.Operation.changeTrust({
                            asset: new StellarSdk.Asset(assetCode, toPublicKey),
                            limit: limit
                        }))
                        .build();

                    transaction.sign(StellarSdk.Keypair.fromSecret(fromSecretKey));

                    return server.submitTransaction(transaction);
                } catch (e) {
                    console.log(e);
                    throw e;
                }
            });
    }

    createPrepaidTrustLine ({fromAccountName, toAccountName, assetCode, limit}) {
        console.log(`Create Trustline from payment account [${fromAccountName}] to [${toAccountName}] for [${assetCode}]`);

        const {secretKey: fromSecretKey, publicKey: fromPublicKey} = Accounts.get(fromAccountName);
        const {publicKey: toPublicKey, secretKey: toSecretKey} = Accounts.get(toAccountName);

        return server.loadAccount(toPublicKey)
            .then((toAccount) => {

                let transaction = new StellarSdk.TransactionBuilder(toAccount) // the account who pays the fee
                    .addOperation(StellarSdk.Operation.changeTrust({
                        asset: new StellarSdk.Asset(assetCode, toPublicKey),
                        limit: limit,
                        source: fromPublicKey // the account the operation is run on/against
                    }))
                    .build();

                // Requester then signs the transaction
                transaction.sign(StellarSdk.Keypair.fromSecret(fromSecretKey));

                // Source the transaction and pays the fee
                // transaction.sign(StellarSdk.Keypair.fromSecret(toSecretKey));

                ////////////////////////////////////////////
                // BELOW simulating sending over the wire //
                ////////////////////////////////////////////

                // CLIENT APP - Simulate sending the transaction (as XDR) over the wire
                const xdrTransaction = transaction.toEnvelope().toXDR('base64');
                console.log(xdrTransaction);

                // BACKEND - Simulates receiving the payload
                // Attempt to marshall the XDR into a transaction
                let transactionToSign = new StellarSdk.Transaction(xdrTransaction);

                // BACKEND - Attempt to sign the transaction (this is as we need payer's private key)
                transactionToSign.sign(StellarSdk.Keypair.fromSecret(toSecretKey));

                return server.submitTransaction(transactionToSign);
            });
    }

    clearTrustLine ({fromAccountName, toAccountName, assetCode}) {

        console.log(`Clear Trustline from [${fromAccountName}] to [${toAccountName}] for [${assetCode}]`);

        const {secretKey: fromSecretKey, publicKey: fromPublicKey} = Accounts.get(fromAccountName);
        const {publicKey: toPublicKey} = Accounts.get(toAccountName);

        let issuedAsset = new StellarSdk.Asset(assetCode, toPublicKey);

        return server.loadAccount(fromPublicKey)
            .then((account) => {

                let transaction = new StellarSdk.TransactionBuilder(account)
                    .addOperation(StellarSdk.Operation.changeTrust({
                        asset: issuedAsset,
                        limit: '0', // Set to ZERO to clear
                    }))
                    .build();

                transaction.sign(StellarSdk.Keypair.fromSecret(fromSecretKey));

                return server.submitTransaction(transaction);
            });
    }

    transferAsset ({assetAccountName, fromAccountName, toAccountName, assetCode, amount}) {
        console.log(`Transfer from [${fromAccountName}] to [${toAccountName}] [${amount}][${assetCode}]`);

        const {publicKey: assetPublicKey} = Accounts.get(assetAccountName);
        const {secretKey: fromSecretKey, publicKey: fromPublicKey} = Accounts.get(fromAccountName);
        const {publicKey: toPublicKey} = Accounts.get(toAccountName);

        let issuedAsset = new StellarSdk.Asset(assetCode, assetPublicKey);

        return server.loadAccount(fromPublicKey)
            .then(function (issuer) {
                let transaction = new StellarSdk.TransactionBuilder(issuer)
                    .addOperation(StellarSdk.Operation.payment({
                        destination: toPublicKey,
                        asset: issuedAsset,
                        amount: amount
                    }))
                    .build();

                transaction.sign(StellarSdk.Keypair.fromSecret(fromSecretKey));

                return server.submitTransaction(transaction);
            });
    }

    prepaidTransferAsset ({assetAccountName, fromAccountName, toAccountName, assetCode, amount}) {
        console.log(`Prepaid transfer from [${fromAccountName}] to [${toAccountName} **pays fee] [${amount}][${assetCode}]`);

        const {publicKey: assetPublicKey} = Accounts.get(assetAccountName);
        const {secretKey: fromSecretKey, publicKey: fromPublicKey} = Accounts.get(fromAccountName);
        const {publicKey: toPublicKey, secretKey: toSecretKey} = Accounts.get(toAccountName);

        return server.loadAccount(toPublicKey)
            .then((toAccount) => {

                let transaction = new StellarSdk.TransactionBuilder(toAccount) // the account who pays the fee (i.e. merchant)
                    .addOperation(StellarSdk.Operation.payment({
                        destination: toPublicKey,
                        asset: new StellarSdk.Asset(assetCode, assetPublicKey),
                        amount: amount,
                        source: fromPublicKey // the account the operation is run on/against
                    }))
                    .build();

                // Requester then signs the transaction
                transaction.sign(StellarSdk.Keypair.fromSecret(fromSecretKey));

                // Source the transaction and pays the fee
                // transaction.sign(StellarSdk.Keypair.fromSecret(toSecretKey));

                ////////////////////////////////////////////
                // BELOW simulating sending over the wire //
                ////////////////////////////////////////////

                // CLIENT APP - Simulate sending the transaction (as XDR) over the wire
                const xdrTransaction = transaction.toEnvelope().toXDR('base64');
                console.log(xdrTransaction);

                // BACKEND - Simulates receiving the payload
                // Attempt to marshall the XDR into a transaction
                let transactionToSign = new StellarSdk.Transaction(xdrTransaction);

                // BACKEND - Attempt to sign the transaction (this is as we need payer's private key)
                transactionToSign.sign(StellarSdk.Keypair.fromSecret(toSecretKey));

                return server.submitTransaction(transactionToSign);
            });
    }

    assetAccountPrepaidTransferAsset ({assetAccountName, thirdPartyAccountName, fromAccountName, toAccountName, assetCode, amount}) {
        console.log(`Prepaid transfer from [${fromAccountName}] to [${toAccountName} **pays fee] [${amount}][${assetCode}]`);

        const {publicKey: assetPublicKey} = Accounts.get(assetAccountName);
        const {secretKey: thirdPartySecretKey, publicKey: thirdPartyPublicKey} = Accounts.get(thirdPartyAccountName);
        const {secretKey: fromSecretKey, publicKey: fromPublicKey} = Accounts.get(fromAccountName);
        const {publicKey: toPublicKey} = Accounts.get(toAccountName);

        return server.loadAccount(thirdPartyPublicKey)
            .then((thirdPartyAccount) => {

                let transaction = new StellarSdk.TransactionBuilder(thirdPartyAccount) // the account who pays the fee
                    .addOperation(StellarSdk.Operation.payment({
                        destination: toPublicKey,
                        asset: new StellarSdk.Asset(assetCode, assetPublicKey),
                        amount: amount,
                        source: fromPublicKey // the account the operation is run on/against
                    }))
                    .build();

                // Requester then signs the transaction
                transaction.sign(StellarSdk.Keypair.fromSecret(fromSecretKey));

                ////////////////////////////////////////////
                // BELOW simulating sending over the wire //
                ////////////////////////////////////////////

                // CLIENT APP - Simulate sending the transaction (as XDR) over the wire
                const xdrTransaction = transaction.toEnvelope().toXDR('base64');
                console.log(xdrTransaction);

                // BACKEND - Simulates receiving the payload
                // Attempt to marshall the XDR into a transaction
                let transactionToSign = new StellarSdk.Transaction(xdrTransaction);

                // BACKEND - Sign from asset holder
                transactionToSign.sign(StellarSdk.Keypair.fromSecret(thirdPartySecretKey));

                return server.submitTransaction(transactionToSign);
            });
    }

    xdrTransferAsset ({thirdPartyAccountName, xdrTransaction}) {
        console.log(`XDR transaction ${xdrTransaction}`);

        const {secretKey: thirdPartySecretKey} = Accounts.get(thirdPartyAccountName);

        console.log(xdrTransaction);

        let transactionToSign = new StellarSdk.Transaction(xdrTransaction);

        transactionToSign.sign(StellarSdk.Keypair.fromSecret(thirdPartySecretKey));

        return server.submitTransaction(transactionToSign);
    }

    transferNative ({fromAccountName, toAccountName, amount}) {
        console.log(`Transfer native XLM from [${fromAccountName}] to [${toAccountName}] [${amount}][XLM]`);

        const {secretKey: fromSecretKey, publicKey: fromPublicKey} = Accounts.get(fromAccountName);
        const {publicKey: toPublicKey} = Accounts.get(toAccountName);

        return server.loadAccount(fromPublicKey)
            .then(function (issuer) {
                let transaction = new StellarSdk.TransactionBuilder(issuer)
                    .addOperation(StellarSdk.Operation.payment({
                        destination: toPublicKey,
                        asset: StellarSdk.Asset.native(),
                        amount: amount,
                    }))
                    .build();

                transaction.sign(StellarSdk.Keypair.fromSecret(fromSecretKey));

                return server.submitTransaction(transaction);
            });
    }

    fundViaFriendbot (accountName) {
        const {publicKey} = Accounts.get(accountName);
        console.log(`FRIEND-BOT: Funding account [${accountName}] has a public key of [${publicKey}]`);

        // for example
        // https://friendbot.stellar.org/?addr=GDJY6ELYMCKP4RQ56CZFL3XWUUVJMBRZD3EXZT6QK2PZDFT6HGSHO6KP
        return axios.get(`https://friendbot.stellar.org/?addr=${publicKey}`);
    }
}

module.exports = StellarFacade;
