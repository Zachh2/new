'use strict';

// Money and user data live in the same usersData.json. Use the Users
// controller for all writes so a second in-memory copy cannot overwrite
// names, EXP, or balances saved by another command.
module.exports = function ({ Users }) {
    async function getData(userID) {
        try {
            if (!userID || isNaN(userID)) throw new Error('Invalid user ID');
            return await Users.getData(userID);
        } catch (error) {
            console.error('Currency getData:', error);
            return false;
        }
    }

    async function setData(userID, options = {}) {
        try {
            if (!userID || isNaN(userID)) throw new Error('Invalid user ID');
            if (!options || typeof options !== 'object' || Array.isArray(options))
                throw new Error('Currency options must be an object');
            if (!await Users.getData(userID)) return false;
            return await Users.setData(userID, options);
        } catch (error) {
            console.error('Currency setData:', error);
            return false;
        }
    }

    async function delData(userID, callback) {
        const data = await setData(userID, { money: 0 });
        if (typeof callback === 'function') callback(data ? null : new Error('Could not reset balance'), data);
        return data;
    }

    async function increaseMoney(userID, money) {
        if (typeof money !== 'number' || !Number.isFinite(money))
            throw new Error(global.getText('currencies', 'needNumber'));
        const data = await getData(userID);
        if (!data) throw new Error('User data unavailable');
        if (!await setData(userID, { money: (Number(data.money) || 0) + money }))
            throw new Error('Could not save balance');
        return true;
    }

    async function decreaseMoney(userID, money) {
        if (typeof money !== 'number' || !Number.isFinite(money))
            throw new Error(global.getText('currencies', 'needNumber'));
        const data = await getData(userID);
        if (!data) throw new Error('User data unavailable');
        const balance = Number(data.money) || 0;
        if (balance < money) return false;
        if (!await setData(userID, { money: balance - money }))
            throw new Error('Could not save balance');
        return true;
    }

    return { getData, setData, delData, increaseMoney, decreaseMoney };
};
