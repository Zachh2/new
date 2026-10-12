const __l = require("../../includes/i18n");
const axios = require('axios');
if (axios && axios.defaults) axios.defaults.timeout = axios.defaults.timeout || 30000; // no request may hang forever
const fs = require('fs');
const path = require('path');

module.exports.config = {
    name: "weather",
    hasPermssion: 0,
    version: "1.0.0",
    credits: "Jonell Magallanes",
    description: "Get accurate weather information with photo",
    usePrefix: true,
    commandCategory: "Utility",
    usages: "[city name]",
    cooldowns: 10,
};

module.exports.run = async function ({ api, event, args }) {
    const { threadID, messageID } = event;

    if (!args[0]) {
        return api.sendMessage(
            __l.t("m1062"),
            threadID, messageID
        );
    }

    const city = args.join(" ");
    
    const sendWait = (t) => global.editMsgDisabled ? Promise.resolve(null) : new Promise(r => api.sendMessage(t, threadID, (e, i) => r(e ? null : i), messageID));
    const react = (e) => { try { api.setMessageReaction(e, messageID, () => {}, true); } catch (err) {} };
    const __fmt = (t, ok) => { const s = String(t); return /[╭╰━┈]/.test(s) ? s : "╭┈ ❒ [ WEATHER " + (ok ? "✅" : "❌") + " ]\n" + s + "\n╰┈━━━━━━━━━━━"; };
    const edit = (t, i) => { const b = /❌|⚠️|💀|[Ff]ail|[Ee]rror|[Nn]ot found|[Cc]ould not|[Uu]nable|too large/.test(String(t)); const o = __fmt(t, !b); if (i) api.editMessage(o, i.messageID, threadID); else api.sendMessage(o, threadID, messageID); react(b ? "❌" : "✅"); };
    react("⏳");
    const info = await sendWait(__l.t("m1064"));

    try {

        // Free Weather API - OpenWeatherMap
        const weatherApiUrl = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&units=metric&appid=da0e33d3e18abbb4e5f10b63c50c9b87`;
        
        const weatherResponse = await axios.get(weatherApiUrl);
        const weatherData = weatherResponse.data;

        if (weatherData.cod !== 200) {
            return edit(
                __l.t("m1065"),
                info
            );
        }

        // Get weather photo based on condition
        const weatherCondition = weatherData.weather[0].main.toLowerCase();
        const weatherPhotoUrl = await getWeatherPhoto(weatherCondition, city);
        
        // Format weather information
        const temperature = Math.round(weatherData.main.temp);
        const feelsLike = Math.round(weatherData.main.feels_like);
        const humidity = weatherData.main.humidity;
        const windSpeed = weatherData.wind.speed;
        const description = weatherData.weather[0].description;
        const country = weatherData.sys.country;
        const cityName = weatherData.name;
        
        // Get additional details
        const sunrise = new Date(weatherData.sys.sunrise * 1000).toLocaleTimeString();
        const sunset = new Date(weatherData.sys.sunset * 1000).toLocaleTimeString();
        const visibility = (weatherData.visibility / 1000).toFixed(1);
        const pressure = weatherData.main.pressure;

        const weatherMessage = 
            __l.t("m1066") +
            __l.t("m1067", [cityName, country]) +
            __l.t("m1068", [description.charAt(0).toUpperCase() + description.slice(1)]) +
            __l.t("m1069", [temperature]) +
            __l.t("m1070", [feelsLike]) +
            __l.t("m1071", [humidity]) +
            __l.t("m1072", [windSpeed]) +
            __l.t("m1073", [visibility]) +
            __l.t("m1074", [pressure]) +
            __l.t("m1075", [sunrise]) +
            __l.t("m1076", [sunset]) +
            `━━━━━━━━━━━━━━━━━━`;

        edit(weatherMessage, info);

        if (weatherPhotoUrl) {
            const photoResponse = await axios.get(weatherPhotoUrl, { responseType: 'stream' });
            const photoPath = path.join(__dirname, `weather_${Date.now()}.jpg`);
            
            const writer = fs.createWriteStream(photoPath);
            photoResponse.data.pipe(writer);
            
            writer.on('finish', () => {
                api.sendMessage({
                    attachment: fs.createReadStream(photoPath)
                }, threadID, () => {
                    fs.unlinkSync(photoPath);
                }, messageID);
            });
        }

    } catch (error) {
        console.error(error);
        
        // Fallback to alternative free API
        try {
            await fallbackWeatherAPI(api, event, city, info);
        } catch (fallbackError) {
            edit(
                __l.t("m1077"),
                info
            );
        }
    }
};

async function getWeatherPhoto(condition, city) {
    const conditionMap = {
        'clear': 'sunny',
        'clouds': 'cloudy',
        'rain': 'rainy',
        'snow': 'snow',
        'thunderstorm': 'storm',
        'drizzle': 'drizzle',
        'mist': 'fog',
        'smoke': 'fog',
        'haze': 'fog',
        'dust': 'fog',
        'fog': 'fog',
        'sand': 'fog',
        'ash': 'fog',
        'squall': 'storm',
        'tornado': 'storm'
    };

    const photoType = conditionMap[condition] || 'weather';
    
    // Using Unsplash free API for weather photos
    const unsplashUrl = `https://source.unsplash.com/600x400/?${photoType}-weather,${city}`;
    return unsplashUrl;
}

async function fallbackWeatherAPI(api, event, city, info) {
    const { threadID, messageID } = event;
    
    // Alternative free weather API - WeatherAPI
    const alternativeUrl = `https://api.weatherapi.com/v1/current.json?key=4f9a5b7a1a1e4f5c8a5172209230712&q=${encodeURIComponent(city)}&aqi=no`;
    
    try {
        const response = await axios.get(alternativeUrl);
        const data = response.data;
        
        const weatherMessage = 
            __l.t("m1066") +
            __l.t("m1067", [data.location.name, data.location.country]) +
            __l.t("m1068", [data.current.condition.text]) +
            __l.t("m1069", [data.current.temp_c]) +
            __l.t("m1070", [data.current.feelslike_c]) +
            __l.t("m1071", [data.current.humidity]) +
            __l.t("m1078", [data.current.wind_kph]) +
            __l.t("m1073", [data.current.vis_km]) +
            __l.t("m1079", [data.current.pressure_mb]) +
            `━━━━━━━━━━━━━━━━━━`;

        // Get weather photo
        const condition = data.current.condition.text.toLowerCase();
        const weatherPhotoUrl = await getWeatherPhoto(condition, city);

        if (info) api.editMessage(weatherMessage, info.messageID, threadID);
        else api.sendMessage(weatherMessage, threadID, messageID);

        if (weatherPhotoUrl) {
            const photoResponse = await axios.get(weatherPhotoUrl, { responseType: 'stream' });
            const photoPath = path.join(__dirname, `weather_${Date.now()}.jpg`);
            
            const writer = fs.createWriteStream(photoPath);
            photoResponse.data.pipe(writer);
            
            writer.on('finish', () => {
                api.sendMessage({
                    attachment: fs.createReadStream(photoPath)
                }, threadID, () => {
                    fs.unlinkSync(photoPath);
                }, messageID);
            });
        }
        
    } catch (error) {
        throw error;
    }
}