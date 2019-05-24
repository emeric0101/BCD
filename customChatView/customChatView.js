
const e = React.createElement;
const dispatcherBotToken = '38007a0d722620de50c7554170281b64';

const botsToken = {
    'ACTION': 'b61f6ca83c801cb24a29aff073319136',
    'INFO': 'f22732dc0be9b78c1335583689f3eda1',
    'SUPPORT': 'ebf5b7ad7735b3f0bdcf421034d97217'
}


class CaiService {
    conversationId = (new Date()).getTime();
    axiosInstance = null;
    constructor() {
        this.reset();
    }

    reset() {
        this.axiosInstance = this.createInstance(dispatcherBotToken);
    }

    /**
     * Create an instance of axios with the bot token
     * @param {*} token 
     */
    createInstance(token) {
        return axios.create({
            baseURL: 'https://api.cai.tools.sap',
            timeout: 1000,
            headers: { 'Authorization': 'Token ' + token }
        });
    }

    sendMessage(msg) {
        return new Promise((resolve, error) => {
            console.log('sending : ', msg);
            this.axiosInstance.post('/build/v1/dialog',
                {
                    "message":
                    {
                        "content": msg,
                        "type": "text"
                    },
                    "conversation_id": this.conversationId,
                    "memory": customChatViewService.getContext()

                }
            )
                .then(async (response) => {
                    if (!response.data.results) {
                        error(Error('Bad result'));
                    }
                    let results = response.data.results.messages;
                    if (results.length == 1) {
                        const action = results[0].content;
                        if (botsToken[action]) {
                            console.log("Switching to the bot" + action);
                            this.axiosInstance = this.createInstance(botsToken[action]);
                            resolve(await this.sendMessage(msg));
                        }
                    }
                    // end conversation ?
                    const idEnd = results.find(e => e.content && e.content == 'END_CONVERSATION');
                    if (idEnd) {
                        idEnd.content = 'Anything else ?';
                        this.reset();
                    }
                    resolve(results);
                })
                .catch(function (e) {
                    error(e);
                });
        });
    }

}

var customChatViewService = {
    caiService: new CaiService(),
    _context: {},
    domContainer: null,
    registerContext(key, value) {
        this._context[key] = value;
    },
    initChat() {
        this.domContainer = document.querySelector('#content'),
            ReactDOM.render(e(ChatButton), this.domContainer);
    },
    show() {
        ReactDOM.render(e(ChatWindow), this.domContainer);
    },
    hideConversation() {
        ReactDOM.render(e(ChatButton), this.domContainer);
        // reset dispatcher
        this.caiService.reset();
    },
    getContext() {
        return this._context;
    },
    async getConversation() {
        return [
        ];
    }
};

/**
 * Clippy easter eggs for speaking :)
 */
var clippyInstance = {
    clippyStarted: false,
    agent: null,
    startClippy() {
        clippy.load('Clippy', (agent) => {
            // Do anything with the loaded agent
            this.agent = agent;
            agent.show();
            this.clippyStarted = true;
        });
    },
    speak(message) {
        if (this.clippyStarted) {
            this.agent.speak(message);
        }
    }
}



class ChatWindow extends React.Component {
    state = {
        msgs: [],
        currentMsg: ''
    };
    constructor(props) {
        super(props);
        customChatViewService.getConversation().then(e => {
            this.setState({ msgs: e });
        });
    }
    async sendMessage() {
        // clippy easter eggs
        if (this.state.currentMsg.includes('CLIPPY')) {
            clippyInstance.startClippy();
            this.setState({ currentMsg: ''});

            return;
        }

        const list = document.getElementById('clippy-list');

        // merge user message
        this.state.msgs.push({
            author: 'you',
            type: 'text',
            content: this.state.currentMsg
        });
        list.scrollTo(0,list.scrollHeight)

        this.setState({ msgs: this.state.msgs, currentMsg: ''});

        let receivedMsgs = await customChatViewService.caiService.sendMessage(this.state.currentMsg);
        receivedMsgs.forEach(element => {
            element['author'] = 'bot';
            clippyInstance.speak(element.content.title || element.content)
        });
        // Merge bot messages
        this.state.msgs.push(...receivedMsgs);
        this.setState({ msgs: this.state.msgs});

        list.scrollTo(0,list.scrollHeight)


    }
    onKeyUp(e) {
        if (e.key == 'Enter') {
            this.sendMessage();
        }
    }
    onTextChange(e) {
        this.setState({currentMsg: event.target.value});
    }
    render() {
        return e("div", {
            className: "clippy-dialog w3-animate-fading fast"
        }, e('div', { className: 'list-wrapper', id: 'clippy-list' }, e(ChatMessageList, { msgs: this.state.msgs })),
            e("div", {
                className: "send-box"
            }, e("div", {
                className: "area-wrapper"
            }, e("textarea", { onChange: (e) => this.onTextChange(e), value: this.state.currentMsg, className: 'textarea-input', placeholder: 'Your message', onKeyUp: (e) => this.onKeyUp(e) })),
                e("div", {
                    className: "send-wrapper"
                }
                ), e("button", {
                    type: "button",
                    className: 'clippy-button',
                    onClick: (e) => this.sendMessage(e)
                }, "Send"),
                e("button", {
                    type: "button",
                    className: 'clippy-button',
                    onClick: (e) => customChatViewService.hideConversation()
                }, "Close")

            ),
        );
    }
}


class ChatMessageList extends React.Component {
    counter = 0;
    buttonCounter = 0;
    constructor(props) {
        super(props);
    }
    render() {
        const msgs = this.props.msgs;
        if (!msgs) {
            return e('div');
        }
        return msgs.map(el => {
            if (el.type == 'buttons') {
                return e("div", { className: el.author + ' clippy-msg' },
                    e('div', {}, el.content.title),
                    el.content.buttons.map(button => {
                        return e('button', { className: 'clippy-button', key: this.buttonCounter++, onClick: () => window.location.href = button.value }, button.title);
                    }));
            } else {
                return e("div", { className: el.author + ' clippy-msg', key: this.counter++ }, el.content);
            }
        });
    }
}


class ChatButton extends React.Component {

    constructor(props) {
        super(props);
    }

    openChat() {
        customChatViewService.show();
    }
    render() {
        return e(
            'button',
            { onClick: () => this.openChat(), className: 'clippy-bottom-button clippy-button' },
            'Open conversation'
        );
    }
}