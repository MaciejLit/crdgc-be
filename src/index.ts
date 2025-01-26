import express from "express";
import axios from "axios";
import cors from 'cors';


interface Player {
  name: string;
  category: string;
  roundScore: number;
  place?: number;
  points: number;
}

const assignPoints = (players: Player[]) => {
  const pointsByPlace = [
    100, 85, 75, 70, 65, 60, 55, 50, 46, 42, 38, 34, 30, 27, 24, 21, 18, 15, 12, 10, 8, 6, 5, 4, 3, 2, 1
  ];
  const sortedPlayers = players.sort((a, b) => a.roundScore - b.roundScore);

  let lastScore: number | undefined = undefined;
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

const fetchAndGroupPlayers = async (url: string, roundNum: number) => {
  const resultsByCategory: { [key: string]: any[] } = {};

    const response = await axios.get(url);
    const subCompetitions = response.data.Competition.SubCompetitions;

    subCompetitions.forEach((round: any) => {
      round.Results.forEach((result: any) => {
        const { Name, Sum, ClassName, DNF } = result;

        const adjustedSum = DNF == 1 ? Sum + 999 : Sum;

        if (!resultsByCategory[ClassName]) {
          resultsByCategory[ClassName] = [];
        }

        const existingPlayer = resultsByCategory[ClassName].find(
          (player) => player.name === Name
        );

        if (existingPlayer) {
          existingPlayer.roundScore += adjustedSum;
        } else {
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
};

const fetchAndProcessResults = async (roundUrls: string[]) => {
  let combinedResults: any[] = [];

  for (let roundNum = 1; roundNum <= roundUrls.length; roundNum++) {
    const roundResults = await fetchAndGroupPlayers(roundUrls[roundNum - 1], roundNum);
    combinedResults.push(roundResults);
  }

  return combinedResults;
};


const mergeResults = (combinedResults: any[]) => {
  const resultsByCategory: { [category: string]: any[] } = {};

  combinedResults.forEach((roundResult, roundIndex) => {
    Object.keys(roundResult).forEach((roundKey) => {
      const roundData = roundResult[roundKey]; 

      if (typeof roundData === 'object') {
        Object.keys(roundData).forEach((category) => {
          const playersInCategory = roundData[category];
          if (Array.isArray(playersInCategory)) {
            playersInCategory.forEach((player: any) => {
              const { name, points } = player;
              if (!resultsByCategory[category]) {
                resultsByCategory[category] = [];
              }
              const existingPlayer = resultsByCategory[category].find((p) => p.name === name);

              if (existingPlayer) {
                if (roundIndex === 0) existingPlayer.points1 = points;
                if (roundIndex === 1) existingPlayer.points2 = points;
                if (roundIndex === 2) existingPlayer.points3 = points;
                if (roundIndex === 3) existingPlayer.points4 = points;
              } else {
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
          } else {
            console.warn(`Oczekiwana tablica graczy w kategorii '${category}', ale otrzymano coś innego.`);
          }
        });
      } else {
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

const app = express();

app.use(cors());

app.get("/combined-results", async (req, res) => {
  const roundUrls = [
    "https://discgolfmetrix.com/api.php?content=result&id=3154647", // round1
    "https://discgolfmetrix.com/api.php?content=result&id=3178736", // round2
    "https://discgolfmetrix.com/api.php?content=result&id=3187008", // round3
    "https://discgolfmetrix.com/api.php?content=result&id=3193913", // round4
  ];

  try {
    const combinedResults = await fetchAndProcessResults(roundUrls);

    const finalResults = mergeResults(combinedResults);

    res.json(finalResults);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error processing results");
  }
});



const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
