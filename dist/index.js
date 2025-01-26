"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const axios_1 = __importDefault(require("axios"));
const cors_1 = __importDefault(require("cors"));
const assignPoints = (players) => {
    const pointsByPlace = [
        100, 85, 75, 70, 65, 60, 55, 50, 46, 42, 38, 34, 30, 27, 24, 21, 18, 15, 12, 10, 8, 6, 5, 4, 3, 2, 1
    ];
    const sortedPlayers = players.sort((a, b) => a.roundScore - b.roundScore);
    let lastScore = undefined;
    let lastPlace = 0;
    let lastPoints = 0;
    sortedPlayers.forEach((player, index) => {
        if (player.roundScore !== lastScore) {
            lastPlace = index + 1;
            lastPoints = pointsByPlace[lastPlace - 1] || 1;
        }
        player.place = lastPlace;
        player.points = lastPoints;
        lastScore = player.roundScore;
    });
};
const fetchAndGroupPlayers = (url, roundNum) => __awaiter(void 0, void 0, void 0, function* () {
    const resultsByCategory = {};
    const response = yield axios_1.default.get(url);
    const subCompetitions = response.data.Competition.SubCompetitions;
    subCompetitions.forEach((round) => {
        round.Results.forEach((result) => {
            const { Name, Sum, ClassName, DNF } = result;
            const adjustedSum = DNF == 1 ? Sum + 999 : Sum;
            if (!resultsByCategory[ClassName]) {
                resultsByCategory[ClassName] = [];
            }
            const existingPlayer = resultsByCategory[ClassName].find((player) => player.name === Name);
            if (existingPlayer) {
                existingPlayer.roundScore += adjustedSum;
            }
            else {
                resultsByCategory[ClassName].push({
                    name: Name,
                    category: ClassName,
                    roundScore: adjustedSum,
                });
            }
        });
    });
    Object.keys(resultsByCategory).forEach((category) => {
        const players = resultsByCategory[category];
        assignPoints(players);
        players.sort((a, b) => a.place - b.place);
    });
    const wrappedResults = { [`kolejka${roundNum}`]: resultsByCategory };
    return wrappedResults;
});
const fetchAndProcessResults = (roundUrls) => __awaiter(void 0, void 0, void 0, function* () {
    let combinedResults = [];
    for (let roundNum = 1; roundNum <= roundUrls.length; roundNum++) {
        const roundResults = yield fetchAndGroupPlayers(roundUrls[roundNum - 1], roundNum);
        combinedResults.push(roundResults);
    }
    return combinedResults;
});
const mergeResults = (combinedResults) => {
    const resultsByCategory = {};
    combinedResults.forEach((roundResult, roundIndex) => {
        Object.keys(roundResult).forEach((roundKey) => {
            const roundData = roundResult[roundKey];
            if (typeof roundData === 'object') {
                Object.keys(roundData).forEach((category) => {
                    const playersInCategory = roundData[category];
                    if (Array.isArray(playersInCategory)) {
                        playersInCategory.forEach((player) => {
                            const { name, points } = player;
                            if (!resultsByCategory[category]) {
                                resultsByCategory[category] = [];
                            }
                            const existingPlayer = resultsByCategory[category].find((p) => p.name === name);
                            if (existingPlayer) {
                                if (roundIndex === 0)
                                    existingPlayer.points1 = points;
                                if (roundIndex === 1)
                                    existingPlayer.points2 = points;
                                if (roundIndex === 2)
                                    existingPlayer.points3 = points;
                                if (roundIndex === 3)
                                    existingPlayer.points4 = points;
                            }
                            else {
                                const newPlayer = {
                                    name,
                                    category,
                                    points1: roundIndex === 0 ? points : null,
                                    points2: roundIndex === 1 ? points : null,
                                    points3: roundIndex === 2 ? points : null,
                                    points4: roundIndex === 3 ? points : null,
                                    totalPoints: points,
                                };
                                resultsByCategory[category].push(newPlayer);
                            }
                        });
                    }
                    else {
                        console.warn(`Oczekiwana tablica graczy w kategorii '${category}', ale otrzymano coś innego.`);
                    }
                });
            }
            else {
                console.warn(`Oczekiwana struktura obiektu dla rundy '${roundKey}', ale otrzymano coś innego.`);
            }
        });
    });
    Object.keys(resultsByCategory).forEach((category) => {
        const playersInCategory = resultsByCategory[category];
        playersInCategory.forEach((player) => {
            player.totalPoints = player.points1 + player.points2 + player.points3 + player.points4;
        });
        playersInCategory.sort((a, b) => b.totalPoints - a.totalPoints);
        let lastPlace = 0;
        let lastPoints = -1;
        playersInCategory.forEach((player, index) => {
            if (player.totalPoints !== lastPoints) {
                lastPlace = index + 1;
                lastPoints = player.totalPoints;
            }
            player.place = lastPlace;
        });
    });
    return resultsByCategory;
};
// Express app
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
// Define routes
app.get("/combined-results", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const roundUrls = [
        "https://discgolfmetrix.com/api.php?content=result&id=3154647", // round1
        "https://discgolfmetrix.com/api.php?content=result&id=3178736", // round2
        "https://discgolfmetrix.com/api.php?content=result&id=3187008", // round3
        "https://discgolfmetrix.com/api.php?content=result&id=3193913", // round4
    ];
    try {
        const combinedResults = yield fetchAndProcessResults(roundUrls);
        const finalResults = mergeResults(combinedResults);
        res.json(finalResults);
    }
    catch (err) {
        console.error(err);
        res.status(500).send("Error processing results");
    }
}));
// Export the express app to be used by Vercel as a serverless function
exports.default = app;
