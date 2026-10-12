const fs = require('fs');
const axios = require('axios');
const { CookieJar } = require('tough-cookie');
const { wrapper } = require('axios-cookiejar-support');

const ACTIONS = [
    'https://www.facebook.com/',
    'https://www.facebook.com/me',
    'https://www.facebook.com/notifications',
    'https://www.facebook.com/messages',
    'https://www.facebook.com/groups',
    'https://www.facebook.com/watch',
    'https://www.facebook.com/marketplace'
];

const getRandomAction = () => ACTIONS[Math.floor(Math.random() * ACTIONS.length)];

const facebookHeaders = {
    'authority': 'www.facebook.com',
    'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'accept-language': 'en-US,en;q=0.9',
    'cache-control': 'max-age=0',
    'sec-ch-ua': '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'sec-fetch-dest': 'document',
    'sec-fetch-mode': 'navigate',
    'sec-fetch-site': 'same-origin',
    'sec-fetch-user': '?1',
    'upgrade-insecure-requests': '1',
    'user-agent': 'Mozilla/5.0 (Linux; Android 13; 22127RK46C Build/TKQ1.220905.001; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/107.0.5304.141 Mobile Safari/537.36 XWEB/5127 MMWEBSDK/20230604 MMWEBID/7189 MicroMessenger/8.0.38.2400(0x28002639) WeChat/arm64 Weixin NetType/WIFI Language/zh_CN ABI/arm64 qcloudcdn-xinan Request-Source=4 Request-Channel',
    'viewport-width': '1920',
    'referer': 'https://www.facebook.com/',
    'dnt': '1'
};

function createSession() {
    try {
        const appState = JSON.parse(fs.readFileSync('./appstate.json', 'utf8'));
        const cookieJar = new CookieJar();
        
        appState.forEach(cookie => {
            cookieJar.setCookieSync(`${cookie.key}=${cookie.value}`, 'https://www.facebook.com');
        });

        const session = wrapper(axios.create({
            jar: cookieJar,
            withCredentials: true,
            headers: facebookHeaders
        }));

        console.log('Online User has been activated');
        return session;
    } catch (error) {
        return null;
    }
}

async function simulateHumanActivity(session) {
    if (!session) return false;

    try {
        const actions = [...ACTIONS];
        const shuffleActions = () => actions.sort(() => Math.random() - 0.5);
        
        const randomActions = shuffleActions().slice(0, 2 + Math.floor(Math.random() * 3));
        
        for (const action of randomActions) {
            const delay = 3000 + Math.random() * 7000;
            await new Promise(resolve => setTimeout(resolve, delay));
            
            await session.get(action, {
                headers: {
                    ...facebookHeaders,
                    'referer': 'https://www.facebook.com/'
                }
            });

            if (Math.random() > 0.7) {
                await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 5000));
                await session.get('https://www.facebook.com/', {
                    headers: {
                        ...facebookHeaders,
                        'referer': action
                    }
                });
            }
        }
        
        return true;
    } catch (error) {
        return false;
    }
}

async function simulateOnlineUser(session) {
    if (!session) return false;

    try {
        const response = await session.get('https://www.facebook.com/active_endpoint', {
            headers: {
                ...facebookHeaders,
                'referer': 'https://www.facebook.com/'
            }
        });
        
        return response.status === 200;
    } catch (error) {
        return false;
    }
}

function startOnlinePresence() {
    // =======================================================================
    // DISABLED BY DEFAULT — this was working against you, not for you.
    //
    // It replayed scripted page loads to facebook.com every 60-150s using
    // headers that contradict each other (an Android WeChat user-agent paired
    // with sec-ch-ua-platform "Windows" and a 1920px viewport), and requested
    // /active_endpoint, which is not a real Facebook route.
    //
    // That combination is precisely what automation detection looks for, so
    // the module meant to keep the session alive was a likely cause of the
    // checkpoints and logouts.
    //
    // FCA already keeps presence alive via updatePresence/online in main.js,
    // so nothing is lost by leaving this off. To re-enable anyway, set
    // "onlinePresence": true in config.json.
    // =======================================================================
    if (!global.config || global.config.onlinePresence !== true) {
        console.log('Online-presence simulator is disabled (recommended).');
        return { stop: () => {} };
    }

    console.log('⚠️  Online-presence simulator ENABLED — this raises the risk of a Facebook checkpoint.');

    const session = createSession();
    if (!session) {
        return { stop: () => {} };
    }
    
    let activityCount = 0;
    
    const interval = setInterval(async () => {
        await simulateHumanActivity(session);
        activityCount++;
        
        if (activityCount % 3 === 0) {
            await simulateOnlineUser(session);
        }
    }, 60000 + Math.random() * 90000);

    const onlineInterval = setInterval(async () => {
        await simulateOnlineUser(session);
    }, 300000 + Math.random() * 300000);

    simulateHumanActivity(session);
    simulateOnlineUser(session);

    return {
        stop: () => {
            clearInterval(interval);
            clearInterval(onlineInterval);
        }
    };
}

module.exports = startOnlinePresence;