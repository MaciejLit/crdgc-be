import express from "express";
import axios from "axios";
import cors from "cors";
import round6Vol2Data from "./data/rounds/vol2-round6.json";
import round6Vol3Data from "./data/rounds/vol3-round6.json";

const METRIX_API_BASE = "https://discgolfmetrix.com/api.php?content=result&id=";

const buildMetrixUrl = (id: string) => `${METRIX_API_BASE}${id}`;

interface Player {
  name: string;
  category: string;
  roundScore: number;
  place?: number;
  points: number;
}

const assignPoints = (players: Player[], pointsByPlace?: number[]) => {
  const defaultPointsByPlace = [
    100, 85, 75, 70, 65, 60, 55, 50, 46, 42, 38, 34, 30, 27, 24, 21, 18, 15, 12, 10, 8, 6, 5, 4, 3, 2, 1
  ];
  const pointsByPlaceToUse = pointsByPlace ?? defaultPointsByPlace;
  const sortedPlayers = players.sort((a, b) => a.roundScore - b.roundScore);

  let lastScore: number | undefined = undefined;
  let lastPlace = 0;
  let lastPoints = 0;

  sortedPlayers.forEach((player, index) => {
    if (player.roundScore !== lastScore) {
      lastPlace = index + 1;
      lastPoints = pointsByPlaceToUse[lastPlace - 1] || 1;
    }

    player.place = lastPlace;
    player.points = lastPoints;

    lastScore = player.roundScore;
  });
};

const normalizeCategoryName = (rawName?: string) => {
  if (!rawName) {
    return "Unknown";
  }

  const normalized = rawName.toLowerCase().replace(/\s+/g, " ").trim();
  switch (normalized) {
    case "mpo":
    case "pro open":
      return "Pro Open";
    case "fpo":
    case "pro open women":
    case "women's pro open":
      return "Women's Pro Open";
    case "mp40":
    case "mixed pro 40+":
    case "pro masters 40+":
    case "pro master 40+":
      return "Pro Master 40+";
    case "ma3":
    case "mixed amateur 3":
      return "Mixed Amateur 3";
    case "ma4":
    case "mixed amateur 4":
      return "Mixed Amateur 4";
    default:
      return rawName;
  }
};

const normalizePlayerName = (rawName?: string) => {
  if (!rawName) {
    return "";
  }

  return rawName
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
};

const CRDGC_MEMBERS = [
  "Jacek Ciechanowski",
  "Sebastian Śleboda",
  "Maciej Litwinienko",
  "Kamil Karpała",
  "Michał Księżuk",
  "Michał Maciołek",
  "Axel Starosta",
  "Filip Górski",
  "Paweł Cytryński",
  "Mateusz Ukleja",
  "Piotr Ratajewski",
  "Tadeusz Maszewski",
  "Paweł Słotwiński",
  "Michał Malicki",
  "Borys Dzielicki",
  "Łukasz Kordys",
  "Tomasz Skoracki",
  "Kacper Szopieraj",
  "Antoni Zakroczymski",
  "Paweł Szwed",
  "Jakub Kisielnicki",
  "Jakub Kaczmarek",
  "Przemysław Wojt",
  "Bartosz Dworzecki",
  "Kamil Piętka",
  "Marek Niedbalski",
  "Max Kuszak",
  "Jakub Muszyński",
  "Norbert Rutkowski",
  "Dominik Szczygielski",
  "Katarzyna Bobrowska",
  "Michał Wachowiak",
  "Jarosław Hnat",
  "Mateusz Książkiewicz",
  "Mikołaj Turek",
  "Dominika Rzęsa",
];

const CRDGC_MEMBER_SET = new Set(CRDGC_MEMBERS.map(normalizePlayerName));

const extractCompetitionResults = (competition: any, context: string) => {
  const subCompetitions = competition?.SubCompetitions;
  if (Array.isArray(subCompetitions)) {
    const results: any[] = [];
    subCompetitions.forEach((round: any) => {
      if (Array.isArray(round?.Results)) {
        results.push(...round.Results);
      }
    });
    if (results.length > 0) {
      return results;
    }
  }

  const tourResults = competition?.TourResults;
  if (Array.isArray(tourResults) && tourResults.length > 0) {
    return tourResults;
  }

  const results = competition?.Results;
  if (Array.isArray(results) && results.length > 0) {
    return results;
  }

  throw new Error(`Brak danych wyników dla ${context}`);
};

const fetchAndGroupPlayers = async (
  url: string,
  roundNum: number,
  pointsByPlace?: number[]
) => {
  const resultsByCategory: { [key: string]: any[] } = {};

  const response = await axios.get(url);
  const competition = response.data?.Competition;
  const results = extractCompetitionResults(competition, `URL: ${url}`);

  const addResult = (result: any) => {
    const { Name, Sum, ClassName, DNF } = result;
    if (!Name) {
      return;
    }

    if (DNF == 1) {
      return;
    }

    const sumValue = Number(Sum);
    if (Number.isNaN(sumValue)) {
      return;
    }

    const categoryName = normalizeCategoryName(ClassName);

    if (!resultsByCategory[categoryName]) {
      resultsByCategory[categoryName] = [];
    }

    const existingPlayer = resultsByCategory[categoryName].find(
      (player) => player.name === Name
    );

    if (existingPlayer) {
      existingPlayer.roundScore += sumValue;
    } else {
      resultsByCategory[categoryName].push({
        name: Name,
        category: categoryName,
        roundScore: sumValue,
      });
    }
  };

  results.forEach(addResult);

  Object.keys(resultsByCategory).forEach((category) => {
    const players = resultsByCategory[category];
    assignPoints(players, pointsByPlace);
    players.sort((a, b) => a.place - b.place); 
  });

  const wrappedResults = { [`kolejka${roundNum}`]: resultsByCategory };

  return wrappedResults;
};

const parsePDGAData = (
  pdgaData: any,
  roundNum: number,
  pointsByPlace?: number[]
) => {
  const resultsByCategory: { [key: string]: any[] } = {};
  
  pdgaData.categories.forEach((category: any) => {
    const categoryName = normalizeCategoryName(category.code || category.name);
    
    if (!resultsByCategory[categoryName]) {
      resultsByCategory[categoryName] = [];
    }

    category.results.forEach((result: any) => {
      result.players.forEach((player: any) => {
        resultsByCategory[categoryName].push({
          name: player.name,
          category: categoryName,
          roundScore: player.total,
        });
      });
    });
  });

  Object.keys(resultsByCategory).forEach((category) => {
    const players = resultsByCategory[category];
    assignPoints(players, pointsByPlace);
    players.sort((a, b) => a.place - b.place); 
  });

  const wrappedResults = { [`kolejka${roundNum}`]: resultsByCategory };
  return wrappedResults;
};

const fetchAndProcessResults = async (
  roundUrls: (string | any)[],
  pointsByPlace?: number[]
) => {
  const combinedResults: any[] = [];

  for (let roundNum = 1; roundNum <= roundUrls.length; roundNum++) {
    const roundData = roundUrls[roundNum - 1];
    
    if (typeof roundData === "string") {
      const roundResults = await fetchAndGroupPlayers(roundData, roundNum, pointsByPlace);
      combinedResults.push(roundResults);
    } else {
      const roundResults = parsePDGAData(roundData, roundNum, pointsByPlace);
      combinedResults.push(roundResults);
    }
  }

  return combinedResults;
};

const mergeResults = (combinedResults: any[], topRounds = 4) => {
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
                if (roundIndex === 4) existingPlayer.points5 = points;
                if (roundIndex === 5) existingPlayer.points6 = points;
                if (roundIndex === 6) existingPlayer.points7 = points;
              } else {
                const newPlayer = {
                  name,
                  category,
                  points1: roundIndex === 0 ? points : null,
                  points2: roundIndex === 1 ? points : null,
                  points3: roundIndex === 2 ? points : null,
                  points4: roundIndex === 3 ? points : null,
                  points5: roundIndex === 4 ? points : null,
                  points6: roundIndex === 5 ? points : null,
                  points7: roundIndex === 6 ? points : null,
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
      const allPoints = [
        player.points1,
        player.points2,
        player.points3,
        player.points4,
        player.points5,
        player.points6,
        player.points7
      ].filter((points): points is number => points !== null && points !== undefined);

      const topPoints = allPoints.sort((a, b) => b - a).slice(0, topRounds);
      player.totalPoints = topPoints.reduce((sum, points) => sum + points, 0);
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

const fetchTournamentPlacings = async (tournamentId: string) => {
  const url = buildMetrixUrl(tournamentId);
  const response = await axios.get(url);
  const competition = response.data?.Competition;
  const results = extractCompetitionResults(competition, `ID turnieju: ${tournamentId}`);

  const resultsByPlayer: { [name: string]: { name: string; totalScore: number } } = {};

  const addResult = (result: any) => {
    const { Name, Sum, DNF } = result;
    if (!Name) {
      return;
    }

    if (DNF == 1) {
      return;
    }

    const sumValue = Number(Sum);
    if (Number.isNaN(sumValue)) {
      return;
    }

    if (!resultsByPlayer[Name]) {
      resultsByPlayer[Name] = { name: Name, totalScore: 0 };
    }

    resultsByPlayer[Name].totalScore += sumValue;
  };

  results.forEach(addResult);

  const allPlayers = Object.values(resultsByPlayer).sort(
    (a, b) => a.totalScore - b.totalScore
  );

  let lastScore: number | undefined = undefined;
  let lastPlace = 0;

  const placings = allPlayers.map((player, index) => {
    if (player.totalScore !== lastScore) {
      lastPlace = index + 1;
    }
    lastScore = player.totalScore;
    return { ...player, place: lastPlace };
  });

  return placings;
};

const app = express();
app.use(cors());
app.use(express.json());

const getVol12PointsByPlace = (maxPlaces: number) => {
  const points: number[] = [100, 95, 90, 85, 80, 75, 70, 65, 60, 55];
  for (let place = 11; place <= maxPlaces; place += 1) {
    const value = 65 - place;
    points.push(value > 1 ? value : 1);
  }
  return points;
};

const sendResultsResponse = async (
  res: express.Response,
  roundUrls: (string | any)[],
  options?: { pointsByPlace?: number[]; topRounds?: number }
) => {
  try {
    const combinedResults = await fetchAndProcessResults(roundUrls, options?.pointsByPlace);
    const finalResults = mergeResults(combinedResults, options?.topRounds ?? 4);
    res.json(finalResults);
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).send(`Error processing results: ${message}`);
  }
};

const VOL12_POINTS = getVol12PointsByPlace(100);
const ROUND_URLS_VOL1 = [
  buildMetrixUrl("2420358"),
  buildMetrixUrl("2428643"),
  buildMetrixUrl("2442153"),
  buildMetrixUrl("2448578"),
  buildMetrixUrl("2455733"),
  buildMetrixUrl("2540142"),
];

app.get("/results-crl-vol1", async (req, res) => {
  await sendResultsResponse(res, ROUND_URLS_VOL1, { pointsByPlace: VOL12_POINTS, topRounds: 4 });
});

const ROUND_URLS_VOL2 = [
  buildMetrixUrl("2808611"),
  buildMetrixUrl("2819390"),
  buildMetrixUrl("2827141"),
  buildMetrixUrl("2828772"),
  buildMetrixUrl("2832353"),
  round6Vol2Data,
];

app.get("/results-crl-vol2", async (req, res) => {
  await sendResultsResponse(res, ROUND_URLS_VOL2, { pointsByPlace: VOL12_POINTS, topRounds: 4 });
});
const ROUND_URLS_VOL3 = [
  buildMetrixUrl("3154647"),
  buildMetrixUrl("3178736"),
  buildMetrixUrl("3187008"),
  buildMetrixUrl("3193913"),
  buildMetrixUrl("3204719"),
  round6Vol3Data,
];

app.get("/results-crl-vol3", async (req, res) => {
  await sendResultsResponse(res, ROUND_URLS_VOL3, { topRounds: 4 });
});

const ROUND_URLS_VOL4 = [
  buildMetrixUrl("3504758"),
  buildMetrixUrl("3505237"),
  buildMetrixUrl("3516449"),
  buildMetrixUrl("3526288"),
  buildMetrixUrl("3530110"),
  buildMetrixUrl("3534571"),
];

app.get("/results-crl-vol4", async (req, res) => {
  await sendResultsResponse(res, ROUND_URLS_VOL4, { topRounds: 5 });
});

app.post("/crdgc-bag-tags", async (req, res) => {
  const tournamentId = String(
    req.body?.tournamentId ?? req.body?.id ?? req.query?.tournamentId ?? req.query?.id ?? ""
  ).trim();

  if (!tournamentId) {
    res.status(400).send("Missing tournamentId");
    return;
  }

  try {
    const placings = await fetchTournamentPlacings(tournamentId);
    const membersPlacings = placings
      .filter((player) => CRDGC_MEMBER_SET.has(normalizePlayerName(player.name)))
      .map((player) => ({
        name: player.name,
        place: player.place,
        totalScore: player.totalScore,
      }));

    res.json({
      tournamentId,
      totalPlayers: placings.length,
      presentMembers: membersPlacings.length,
      results: membersPlacings,
    });
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).send(`Error processing bag tags: ${message}`);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

export default app;
