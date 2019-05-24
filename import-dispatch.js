const dispatcherBotToken = { name: 'dispatch-bot', user: 'emeric0101', devToken: 'a335f55ecac824f27e8fe007d493f4d7', version: 'v1' };

const ignoredIntents = ['greetings', 'goodbye', 'no', 'yes'];

const botsToken = [
    { intentName: 'semanticaction', trigger: 'ACTION', name: 'act', user: 'ashurawrun', devToken: 'b167dbc3f049bb46aa16e19895ff68a4', version: 'v1' },
    { intentName: 'semanticrequest', trigger: 'INFO', name: 'request-info', user: 'ashurawrun', devToken: 'dc1841f189eb8a61362fa1366e337646', version: 'v1' },
    { intentName: 'semanticsupport', trigger: 'SUPPORT', name: 'support', user: 'ashurawrun', devToken: '49341577bc2e1f6e52663bf391ee1956', version: 'v1' }
];

var request = require('request');


async function deleteRequest(url, token) {
    return new Promise((resolve, error) => {
        request.delete({
            url: url,
            headers: {
                "Content-Type": "application/json",
                "Authorization": "Token " + token
            }
        }, function optionalCallback(err, httpResponse, body) {
            if (err) {
                return console.error('upload failed:', err);
            }
            resolve(body);
        }, function (e) {
            error(e);
        });
    });
}

async function getRequest(url, token) {
    return new Promise((resolve, error) => {
        request.get({
            url: url,
            headers: {
                "Content-Type": "application/json",
                "Authorization": "Token " + token
            }
        }, function optionalCallback(err, httpResponse, body) {
            if (err) {
                return console.error('upload failed:', err);
            }
            resolve(JSON.parse(body));
        }, function (e) {
            error(e);
        });
    });
}

async function postRequest(url, data, token) {
    return new Promise((resolve, error) => {
        request.post({
            url: url,
            body: JSON.stringify(data),
            headers: {
                "Content-Type": "application/json",
                "Authorization": "Token " + token
            }
        }, function optionalCallback(err, httpResponse, body) {
            if (err) {
                return console.error('upload failed:', err);
            }
            resolve(JSON.parse(body));
        }, function (e) {
            error(e);
        });
    });
}

async function getIntents(bot) {
    return await getRequest("https://api.cai.tools.sap/train/v2/users/" + bot.user + "/bots/" + bot.name + "/versions/" + bot.version + "/dataset/intents",
        bot.devToken
    );
}
async function getIntentFromSlud(slug, bot) {
    return await getRequest(
        "https://api.cai.tools.sap/train/v2/users/" + bot.user + "/bots/" + bot.name + "/versions/" + bot.version + "/dataset/intents/" + slug,
        bot.devToken
    );
}

async function createIntend(intent, bot) {
    return await postRequest(
        "https://api.cai.tools.sap/train/v2/users/" + bot.user + "/bots/" + bot.name + "/versions/" + bot.version + "/dataset/intents",
        intent,
        bot.devToken
    );
}


async function deleteIntentFromSlud(slug, bot) {
    return await deleteRequest(
        "https://api.cai.tools.sap/train/v2/users/" + bot.user + "/bots/" + bot.name + "/versions/" + bot.version + "/dataset/intents/" + slug,
        bot.devToken
    );
}

async function deleteSkill(slug, bot) {
    return await deleteRequest(
        "https://api.cai.tools.sap/train/v2/users/" + bot.user + "/bots/" + bot.name + "/versions/" + bot.version + "/builder/skills/" + slug,
        bot.devToken
    );
}

async function createSkill(skill, bot) {
    const r = await postRequest(
        "https://api.cai.tools.sap/build/v1/users/" + bot.user + "/bots/" + bot.name + "/versions/" + bot.version + "/builder/skills",
        skill,
        bot.devToken
    );
    return r;
}
console.log("ABC - Dispatcher bot creation - 2019");
async function main() {

    for (const bot of botsToken) {
        console.log("   Deleting intent if exist ");
        await deleteIntentFromSlud(bot.intentName, dispatcherBotToken);
        console.log("   Deleting skill if exist ");
        await deleteSkill(bot.intentName, dispatcherBotToken);

        const newIntent = {
            name: bot.intentName,
            description: '',
            expressions: [
            ]
        };

        console.log("   importing " + bot.name);
        const intents = await getIntents(bot);
        // then getting the intent sentence
        for (const intent of intents.results) {
            if (ignoredIntents.includes(intent.slug)) {
                console.log("       Skipped : " + intent.slug);
            } else {
                console.log("       Intent : " + intent.slug);
                const intentModel = await getIntentFromSlud(intent.slug, bot);
                const expressions = intentModel.results.expressions;
                for (const expression of expressions) {
                    newIntent.expressions.push(
                        { source: expression.source, language: { isocode: expression.language.isocode } }
                    );
                }

            }
        }
        console.log("   Creating intent : ", bot.name);
        createIntend(newIntent, dispatcherBotToken);

        console.log("   Creating skill");
        createSkill({ "name": bot.intentName, "type": "business", "readme": "# README\n\n> You can update this readme to explain what your skill does." }, dispatcherBotToken);
    }
    console.log("done");
}

main();