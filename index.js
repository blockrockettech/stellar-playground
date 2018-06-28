const express = require('express');
const _ = require('lodash');
const bodyParser = require('body-parser');
const stringify = require('json-stringify-safe');
const cors = require('cors');

const StellarFacade = require('./services/stellar-facade');
const stellarFacade = new StellarFacade();

const app = express();
app.use(bodyParser.json());

app.use(cors());

const ASSET_CODE = 'STE';

const promiseResult = (promise, res) => {
    promise
        .then((result) => {
            console.log(result);
            return res.status(200).send(stringify(result, null, 4));
        })
        .catch((error) => {
            console.log(error);
            return res.status(500).send(stringify(error, null, 4));
        });
};

app.post('/account/create', (req, res) => {
    console.log(req.body);
    return promiseResult(stellarFacade.createAccount({
        accountName: req.body.accountName
    }), res);
});

app.get('/accounts/all', (req, res) => {
    return promiseResult(stellarFacade.listAccountBalances(), res);
});

app.post('/account/configure', function (req, res) {
    console.log(req.body);
    return promiseResult(stellarFacade.configureAccountIssuanceProperties({
        accountName: req.body.accountName
    }), res);
});

app.get('/account/get/:accountName', (req, res) => {
    return promiseResult(stellarFacade.getAccount(req.params.accountName), res);
});

app.get('/account/fund/friendbot/:accountName', (req, res) => {
    return promiseResult(stellarFacade.fundViaFriendbot(req.params.accountName), res);
});

app.get('/account/load/:accountName', function (req, res) {
    return promiseResult(stellarFacade.loadAccount(req.params.accountName), res);
});

app.post('/account/fund', function (req, res) {
    return promiseResult(stellarFacade.fundAccount({
        fromAccountName: req.body.fromAccountName,
        toAccountName: req.body.toAccountName
    }), res);
});

app.post('/asset/create', function (req, res) {
    let {accountName, assetCode} = req.body;
    return promiseResult(stellarFacade.createAsset({
        assetCode: assetCode,
        accountName: accountName
    }), res);
});

app.post('/asset/transfer', function (req, res) {
    return promiseResult(stellarFacade.transferAsset({
        assetAccountName: req.body.assetAccountName,
        fromAccountName: req.body.fromAccountName,
        toAccountName: req.body.toAccountName,
        assetCode: ASSET_CODE,
        amount: req.body.amount
    }), res);
});

app.post('/asset/transfer/prepaid', function (req, res) {
    return promiseResult(stellarFacade.prepaidTransferAsset({
        assetAccountName: req.body.assetAccountName,
        fromAccountName: req.body.fromAccountName,
        toAccountName: req.body.toAccountName,
        assetCode: ASSET_CODE,
        amount: req.body.amount
    }), res);
});

app.post('/asset/transfer/thirdpartypaid', function (req, res) {
    return promiseResult(stellarFacade.assetAccountPrepaidTransferAsset({
        assetAccountName: req.body.assetAccountName,
        thirdPartyAccountName: req.body.thirdPartyAccountName,
        fromAccountName: req.body.fromAccountName,
        toAccountName: req.body.toAccountName,
        assetCode: ASSET_CODE,
        amount: req.body.amount
    }), res);
});

app.post('/asset/transfer/xdr', function (req, res) {
    return promiseResult(stellarFacade.xdrTransferAsset({
        thirdPartyAccountName: 'pxe', // FIXME - hardcoded
        xdrTransaction: req.body.xdrTransaction
    }), res);
});

app.post('/native/transfer', function (req, res) {
    return promiseResult(stellarFacade.transferNative({
        fromAccountName: req.body.fromAccountName,
        toAccountName: req.body.toAccountName,
        amount: req.body.amount
    }), res);
});

app.get('/trustline/check/:accountName', function (req, res) {
    console.log(req.body);
    return promiseResult(stellarFacade.checkUserHasTrustline(req.params.accountName, ASSET_CODE), res);
});

app.post('/trustline/create', function (req, res) {
    console.log(req.body);
    return promiseResult(stellarFacade.createTrustLine({
        fromAccountName: req.body.fromAccountName,
        toAccountName: req.body.toAccountName,
        assetCode: ASSET_CODE,
        limit: '10000'
    }), res);
});

app.post('/trustline/create/prepaid', function (req, res) {
    console.log(req.body);
    return promiseResult(stellarFacade.createPrepaidTrustLine({
        fromAccountName: req.body.fromAccountName,
        toAccountName: req.body.toAccountName,
        assetCode: ASSET_CODE,
        limit: '10000'
    }), res);
});

app.post('/trustline/clear', function (req, res) {
    console.log(req.body);
    return promiseResult(stellarFacade.clearTrustLine({
        fromAccountName: req.body.fromAccountName,
        toAccountName: req.body.toAccountName,
        assetCode: ASSET_CODE
    }), res);
});

// FIRE UP THE ENGINES!
let server = app.listen(process.env.PORT || 3000, function () {
    console.log('Listening on port: ' + server.address().port);
});
